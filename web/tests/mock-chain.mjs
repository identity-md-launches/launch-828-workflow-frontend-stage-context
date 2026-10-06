import { readFileSync } from 'node:fs';
import { decodeFunctionData, encodeErrorResult, encodeFunctionResult, toHex } from 'viem';
import { currencyAbi, permitAbi, quoteAbi, routerAbi, stateAbi } from '../src/protocol.ts';
export const config = JSON.parse(readFileSync(new URL('../../dist/imd-deployment.json', import.meta.url)));
export const tokenAbi = JSON.parse(readFileSync(new URL('../../dist/abi/LaunchToken.json', import.meta.url)));
export const account = '0x1111111111111111111111111111111111111111';
export const recipient = '0x2222222222222222222222222222222222222222';
export const owner = '0x3333333333333333333333333333333333333333';
const unit = 10n ** 18n;
export function mockChain() {
  const state = { chainId: 1, missingCode: false, rpcDown: false, quoteRevert: false, executeRevert: false, holdReceipt: false, revertedTx: false, tokenAllowance: 0n, routerAllowance: 0n, routerExpiration: 0, ownerAllowance: 1500n * unit, customAllowance: 0n, tokenBalance: 2000000n * unit, quotes: 0, calls: [], sends: [], applied: new Set() };
  function interfaceFor(address) {
    const value = address?.toLowerCase();
    if (value === config.contracts[0].address) return tokenAbi;
    if (value === config.network.uniswapV4.stateView) return stateAbi;
    if (value === config.network.uniswapV4.quoter) return quoteAbi;
    if (value === config.network.uniswapV4.permit2) return permitAbi;
    if (value === config.network.uniswapV4.universalRouter) return routerAbi;
    throw new Error(`Unexpected RPC contract ${address}`);
  }
  function apply(tx, hash) {
    if (state.applied.has(hash)) return;
    state.applied.add(hash);
    const abi = interfaceFor(tx.to);
    const { functionName, args } = decodeFunctionData({ abi, data: tx.data });
    if (functionName === 'approve' && tx.to.toLowerCase() === config.network.uniswapV4.permit2) {
      state.routerAllowance = args[2]; state.routerExpiration = Number(args[3]);
    } else if (functionName === 'approve') {
      if (args[0].toLowerCase() === config.network.uniswapV4.permit2) state.tokenAllowance = args[1];
      else state.customAllowance = args[1];
    } else if (functionName === 'transfer') state.tokenBalance -= args[1];
    else if (functionName === 'transferFrom') state.ownerAllowance -= args[2];
  }
  async function rpc(method, params) {
    state.calls.push({ method, params });
    if (state.rpcDown) throw { code: -32000, message: 'Mock RPC unavailable' };
    if (method === 'eth_chainId') return toHex(state.chainId);
    if (method === 'eth_blockNumber') return '0x100';
    if (method === 'eth_getCode') return state.missingCode ? '0x' : '0x60006000';
    if (method === 'eth_getBalance') return toHex(10n * unit);
    if (method === 'eth_call') {
      const tx = params[0]; const abi = interfaceFor(tx.to);
      const { functionName, args } = decodeFunctionData({ abi, data: tx.data });
      let result;
      if (functionName === 'name') result = 'Pachu';
      else if (functionName === 'symbol') result = 'PACHU';
      else if (functionName === 'decimals') result = 18;
      else if (functionName === 'totalSupply') result = 1000000000n * unit;
      else if (functionName === 'balanceOf') result = state.tokenBalance;
      else if (functionName === 'allowance' && abi === permitAbi) result = [state.routerAllowance, state.routerExpiration, 0];
      else if (functionName === 'allowance') result = args[0].toLowerCase() === owner ? state.ownerAllowance : args[1].toLowerCase() === config.network.uniswapV4.permit2 ? state.tokenAllowance : state.customAllowance;
      else if (functionName === 'getSlot0') result = [2n ** 96n, 0, 0, config.poolKey.fee];
      else if (functionName === 'getLiquidity') result = 100000000000000n;
      else if (functionName === 'quoteExactInputSingle') {
        state.quotes++;
        if (state.quoteRevert) throw { code: 3, message: 'execution reverted: liquidity unavailable', data: '0x' };
        result = [args[0].zeroForOne ? 1000n * unit : unit / 100n, 180000n];
      } else if (functionName === 'execute') {
        if (state.executeRevert) throw { code: 3, message: 'execution reverted', data: encodeErrorResult({ abi: routerAbi, errorName: 'V4TooLittleReceived', args: [100n, 90n] }) };
        return '0x';
      } else if (['transfer', 'approve', 'transferFrom'].includes(functionName)) result = abi === permitAbi ? undefined : true;
      else throw new Error(`Unexpected function ${functionName}`);
      return encodeFunctionResult({ abi, functionName, result });
    }
    if (method === 'eth_getTransactionReceipt') {
      if (state.holdReceipt) return null;
      const hash = params[0]; const tx = state.sends.find(t => t.hash === hash);
      if (!tx) return null;
      if (!state.revertedTx) apply(tx, hash);
      return { transactionHash: hash, transactionIndex: '0x0', blockHash: `0x${'ab'.repeat(32)}`, blockNumber: '0x100', from: account, to: tx.to, cumulativeGasUsed: '0x20000', gasUsed: '0x20000', effectiveGasPrice: '0x100', logs: [], logsBloom: `0x${'00'.repeat(256)}`, status: state.revertedTx ? '0x0' : '0x1', type: '0x2', contractAddress: null };
    }
    if (method === 'eth_getBlockByNumber') return { number: '0x100', hash: `0x${'ab'.repeat(32)}`, timestamp: toHex(Math.floor(Date.now() / 1000)), transactions: [], gasLimit: '0x1000000', gasUsed: '0x0', baseFeePerGas: '0x10', difficulty: '0x0', extraData: '0x', logsBloom: `0x${'00'.repeat(256)}`, miner: account, mixHash: `0x${'00'.repeat(32)}`, nonce: '0x0000000000000000', parentHash: `0x${'00'.repeat(32)}`, receiptsRoot: `0x${'00'.repeat(32)}`, sha3Uncles: `0x${'00'.repeat(32)}`, size: '0x1', stateRoot: `0x${'00'.repeat(32)}`, totalDifficulty: '0x0', transactionsRoot: `0x${'00'.repeat(32)}`, uncles: [] };
    throw new Error(`Unexpected RPC method ${method}`);
  }
  async function route(route) {
    const payload = route.request().postDataJSON();
    const handle = async message => {
      try { return { jsonrpc: '2.0', id: message.id, result: await rpc(message.method, message.params) }; }
      catch (e) { return { jsonrpc: '2.0', id: message.id, error: { code: e.code || -32000, message: e.message || String(e), ...(e.data ? { data: e.data } : {}) } }; }
    };
    const body = Array.isArray(payload) ? await Promise.all(payload.map(handle)) : await handle(payload);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  }
  async function send(tx) {
    const hash = toHex(BigInt(state.sends.length + 1), { size: 32 });
    state.sends.push({ ...tx, hash }); return hash;
  }
  return { state, route, send };
}
export async function injectWallet(page, chain, options = {}) {
  await page.exposeFunction('__testSend', chain.send);
  await page.addInitScript(({ account, options }) => {
    const listeners = {};
    window.walletMock = { chainId: options.chainId || '0x1', accounts: [account], rejectConnect: false, rejectSign: false, unknownChain: false, requests: [] };
    window.ethereum = {
      async request({ method, params }) {
        const state = window.walletMock; state.requests.push({ method, params });
        if (method === 'eth_requestAccounts' && state.rejectConnect) throw { code: 4001, message: 'User rejected request' };
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return state.accounts;
        if (method === 'eth_chainId') return state.chainId;
        if (method === 'wallet_switchEthereumChain') {
          if (state.unknownChain) throw { code: 4902, message: 'Unknown chain' };
          state.chainId = params[0].chainId; (listeners.chainChanged || []).forEach(fn => fn(state.chainId)); return null;
        }
        if (method === 'wallet_addEthereumChain') { state.unknownChain = false; return null; }
        if (method === 'eth_sendTransaction') {
          if (state.rejectSign) throw { code: 4001, message: 'User rejected signing' };
          return window.__testSend(params[0]);
        }
        throw new Error(`Unexpected wallet method ${method}`);
      },
      on(event, listener) { (listeners[event] ||= []).push(listener); },
      removeListener(event, listener) { listeners[event] = (listeners[event] || []).filter(fn => fn !== listener); },
    };
    window.walletMock.changeChain = chainId => { window.walletMock.chainId = chainId; (listeners.chainChanged || []).forEach(fn => fn(chainId)); };
    window.walletMock.changeAccount = address => { window.walletMock.accounts = address ? [address] : []; (listeners.accountsChanged || []).forEach(fn => fn(window.walletMock.accounts)); };
  }, { account, options });
}
