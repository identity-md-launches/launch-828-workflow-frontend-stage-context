import { readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, fallback, http } from 'viem';
const config = JSON.parse(await readFile(new URL('../../dist/imd-deployment.json', import.meta.url)));
const abi = JSON.parse(await readFile(new URL('../../dist/abi/LaunchToken.json', import.meta.url)));
const { poolId, stateAbi, quoteAbi } = await import('../src/protocol.ts');
const client = createPublicClient({ transport: fallback(config.network.rpcUrls.map(url => http(url, { timeout: 10000, retryCount: 0 })), { retryCount: 0 }) });
const evidence = { checkedAt: new Date().toISOString(), mode: 'Read-only public RPC; no wallet or broadcast', chainId: null, block: null, contracts: [], token: {}, pool: {}, error: null };
try {
  evidence.chainId = await client.getChainId();
  if (evidence.chainId !== config.chainId) throw new Error('Wrong RPC chain ID');
  evidence.block = String(await client.getBlockNumber());
  const addresses = [...config.contracts.map(c => ({ name: c.name, address: c.address })), ...Object.entries(config.network.uniswapV4).filter(([, address]) => typeof address === 'string').map(([name, address]) => ({ name, address })), { name: 'initializationGuard', address: config.poolKey.hooks }];
  for (const contract of addresses) {
    const code = await client.getCode({ address: contract.address });
    evidence.contracts.push({ ...contract, codeBytes: code ? (code.length - 2) / 2 : 0 });
  }
  for (const functionName of ['name', 'symbol', 'decimals', 'totalSupply']) {
    const result = await client.readContract({ address: config.contracts[0].address, abi, functionName });
    evidence.token[functionName] = typeof result === 'bigint' ? String(result) : result;
  }
  const slot = await client.readContract({ address: config.network.uniswapV4.stateView, abi: stateAbi, functionName: 'getSlot0', args: [poolId(config.poolKey)] });
  const liquidity = await client.readContract({ address: config.network.uniswapV4.stateView, abi: stateAbi, functionName: 'getLiquidity', args: [poolId(config.poolKey)] });
  evidence.pool = { id: poolId(config.poolKey), sqrtPriceX96: String(slot[0]), tick: slot[1], protocolFee: slot[2], lpFee: slot[3], activeLiquidity: String(liquidity) };
  try {
    const quote = await client.simulateContract({ address: config.network.uniswapV4.quoter, abi: quoteAbi, functionName: 'quoteExactInputSingle', args: [{ poolKey: config.poolKey, zeroForOne: true, exactAmount: 1000000000000000n, hookData: '0x' }] });
    evidence.quote = { mode: 'eth_call simulation only', inputETH: '0.001', outputPachuBaseUnits: String(quote.result[0]), gasEstimate: String(quote.result[1]) };
  } catch (e) { evidence.quote = { mode: 'eth_call simulation only', error: e.shortMessage || e.message }; }
} catch (e) { evidence.error = e.shortMessage || e.message; }
await writeFile(new URL('../../docs/evidence/live-read.json', import.meta.url), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
if (evidence.error) process.exitCode = 1;
