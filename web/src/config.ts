import { createPublicClient, defineChain, fallback, http, keccak256, toBytes, type Abi, type Address } from 'viem';

export type PoolKey = { currency0: Address; currency1: Address; fee: number; tickSpacing: number; hooks: Address };
export type Deployment = {
  version: 1; launchId: string; chainId: number; sourceCommit: string; attestationHash: string;
  contracts: { name: string; address: Address; abiHash: string; abiPath: string }[];
  assets: { path: string; sha256: string }[];
  poolKey: PoolKey;
  network: {
    chainId: number; name: string; testnet: boolean; rpcUrls: string[]; explorer: string;
    nativeCurrency: { name: string; symbol: string; decimals: number };
    uniswapV4: { poolManager: Address; universalRouter: Address; quoter: Address; stateView: Address; positionManager: Address; permit2: Address; extendedSwapParams?: boolean };
  };
  walletAddChain?: Record<string, unknown>;
};
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort((v as Record<string, unknown>)[k])])) : v;
  return JSON.stringify(sort(value));
}
async function fetchJson(path: string) {
  if (path.includes('..') || path.startsWith('/') || path.includes(':')) throw new Error('Unsafe configuration path.');
  const response = await fetch(new URL(path, new URL(import.meta.env.BASE_URL, location.href)), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Unable to load ${path}. Reload the site to retry.`);
  return response.json();
}
export async function loadConfig() {
  const config: Deployment = await fetchJson('imd-deployment.json');
  if (config.version !== 1 || config.chainId !== config.network.chainId || !config.poolKey) throw new Error('Deployment configuration is incomplete. Trading is disabled.');
  if (BigInt(config.poolKey.currency0) >= BigInt(config.poolKey.currency1)) throw new Error('Pool currencies are not sorted. Trading is disabled.');
  const loaded = await Promise.all(config.contracts.map(async contract => {
    const abi: Abi = await fetchJson(contract.abiPath);
    if (!Array.isArray(abi) || keccak256(toBytes(canonical(abi))).slice(2) !== contract.abiHash) throw new Error('Contract ABI does not match the attested deployment.');
    return { ...contract, abi };
  }));
  const token = loaded.find(contract => contract.name === 'LaunchToken');
  if (!token || ![config.poolKey.currency0, config.poolKey.currency1].some(c => c.toLowerCase() === token.address.toLowerCase())) throw new Error('Token and pool configuration disagree.');
  const chain = defineChain({
    id: config.chainId, name: config.network.name, nativeCurrency: config.network.nativeCurrency,
    rpcUrls: { default: { http: config.network.rpcUrls } },
    blockExplorers: { default: { name: 'Explorer', url: config.network.explorer } },
    testnet: config.network.testnet,
  });
  const client = createPublicClient({ chain, transport: fallback(config.network.rpcUrls.map(url => http(url, { timeout: 8000, retryCount: 0 })), { retryCount: 0 }) });
  return { config, token, chain, client };
}
export type Runtime = Awaited<ReturnType<typeof loadConfig>>;
