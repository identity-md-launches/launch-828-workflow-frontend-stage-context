import { useCallback, useEffect, useRef, useState } from 'react';
import { zeroAddress, type Address } from 'viem';
import type { Runtime } from './config';
import { currencyAbi, errorMessage, isNative, poolId, stateAbi } from './protocol';

export type LiveState = {
  name: string; symbol: string; decimals: number; supply: bigint; block: bigint;
  tokenBalance?: bigint; pairBalance?: bigint; pair: { address: Address; symbol: string; decimals: number };
  liquidity: bigint; sqrtPrice: bigint; lpFee: number; tick: number; updated: number;
};
export function useLiveState(runtime: Runtime, account?: Address) {
  const [data, setData] = useState<LiveState>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const epoch = useRef(0);
  const active = useRef<number | null>(null);
  const lastCodeCheck = useRef(0);
  const refresh = useCallback(async (verifyCode = false) => {
    const generation = epoch.current;
    if (active.current === generation) return;
    active.current = generation; setLoading(true);
    try {
      const { client, token, config } = runtime;
      if (await client.getChainId() !== config.chainId) throw new Error('RPC returned a different network. Actions are disabled.');
      if (verifyCode || Date.now() - lastCodeCheck.current > 60000) {
        const addresses = [...config.contracts.map(c => c.address), ...Object.values(config.network.uniswapV4).filter(a => typeof a === 'string') as Address[], config.poolKey.hooks].filter(a => a !== zeroAddress);
        const codes = await Promise.all([...new Set(addresses)].map(address => client.getCode({ address })));
        if (codes.some(code => !code || code === '0x')) throw new Error('A configured contract has no deployed code. Actions are disabled.');
        lastCodeCheck.current = Date.now();
      }
      const read = (functionName: string, args?: readonly unknown[]) => client.readContract({ address: token.address, abi: token.abi, functionName, args });
      const pairAddress = config.poolKey.currency0.toLowerCase() === token.address.toLowerCase() ? config.poolKey.currency1 : config.poolKey.currency0;
      const [name, symbol, decimals, supply, block, slot, liquidity, pairSymbol, pairDecimals, tokenBalance, pairBalance] = await Promise.all([
        read('name'), read('symbol'), read('decimals'), read('totalSupply'), client.getBlockNumber(),
        client.readContract({ address: config.network.uniswapV4.stateView, abi: stateAbi, functionName: 'getSlot0', args: [poolId(config.poolKey)] }),
        client.readContract({ address: config.network.uniswapV4.stateView, abi: stateAbi, functionName: 'getLiquidity', args: [poolId(config.poolKey)] }),
        isNative(pairAddress) ? config.network.nativeCurrency.symbol : client.readContract({ address: pairAddress, abi: currencyAbi, functionName: 'symbol' }),
        isNative(pairAddress) ? config.network.nativeCurrency.decimals : client.readContract({ address: pairAddress, abi: currencyAbi, functionName: 'decimals' }),
        account ? read('balanceOf', [account]) : undefined,
        account ? isNative(pairAddress) ? client.getBalance({ address: account }) : client.readContract({ address: pairAddress, abi: currencyAbi, functionName: 'balanceOf', args: [account] }) : undefined,
      ]);
      if (generation !== epoch.current) return;
      setData({ name: name as string, symbol: symbol as string, decimals: Number(decimals), supply: supply as bigint, block, sqrtPrice: slot[0], tick: slot[1], lpFee: slot[3], liquidity, pair: { address: pairAddress, symbol: pairSymbol, decimals: pairDecimals }, tokenBalance: tokenBalance as bigint | undefined, pairBalance, updated: Date.now() });
      setVerified(true); setError('');
    } catch (e) { if (generation === epoch.current) { setVerified(false); setError(errorMessage(e)); } }
    finally { if (active.current === generation) { active.current = null; setLoading(false); } }
  }, [runtime, account]);
  useEffect(() => {
    epoch.current++; setData(undefined); setVerified(false);
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 12000);
    void refresh(true);
    return () => { epoch.current++; clearInterval(timer); };
  }, [refresh]);
  return { data, error, loading, verified, refresh };
}
