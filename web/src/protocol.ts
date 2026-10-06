import { encodeAbiParameters, keccak256, parseAbi, parseAbiParameters, zeroAddress, type Address } from 'viem';
import type { PoolKey } from './config';

// Protocol interfaces; deployment addresses are always read from imd-deployment.json.
export const stateAbi = parseAbi([
  'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
  'function getLiquidity(bytes32 poolId) view returns (uint128 liquidity)',
]);
export const quoteAbi = parseAbi([
  'function quoteExactInputSingle(((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 exactAmount, bytes hookData) params) returns (uint256 amountOut, uint256 gasEstimate)',
]);
export const routerAbi = parseAbi([
  'function execute(bytes commands, bytes[] inputs, uint256 deadline) payable',
  'error ExecutionFailed(uint256 commandIndex, bytes message)',
  'error TransactionDeadlinePassed()',
  'error V4TooLittleReceived(uint256 minAmountOutReceived, uint256 amountReceived)',
]);
export const permitAbi = parseAbi([
  'function allowance(address owner, address token, address spender) view returns (uint160 amount, uint48 expiration, uint48 nonce)',
  'function approve(address token, address spender, uint160 amount, uint48 expiration)',
]);
export const currencyAbi = parseAbi([
  'function symbol() view returns (string)', 'function decimals() view returns (uint8)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)',
  'function approve(address,uint256) returns (bool)',
]);
const keyParams = parseAbiParameters('(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)');
export const poolId = (key: PoolKey) => keccak256(encodeAbiParameters(keyParams, [key]));
export function swapInput(key: PoolKey, input: Address, amountIn: bigint, minimum: bigint, extended = false) {
  const zeroForOne = input.toLowerCase() === key.currency0.toLowerCase();
  const output = zeroForOne ? key.currency1 : key.currency0;
  const tuple = extended
    ? parseAbiParameters('((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, uint256 minHopPriceX36, bytes hookData)')
    : parseAbiParameters('((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)');
  const params = [
    encodeAbiParameters(tuple, [{ poolKey: key, zeroForOne, amountIn, amountOutMinimum: minimum, ...(extended ? { minHopPriceX36: 0n } : {}), hookData: '0x' }]),
    encodeAbiParameters(parseAbiParameters('address, uint256'), [input, amountIn]),
    encodeAbiParameters(parseAbiParameters('address, uint256'), [output, minimum]),
  ];
  return encodeAbiParameters(parseAbiParameters('bytes, bytes[]'), ['0x060c0f', params]);
}
export const isNative = (address: Address) => address.toLowerCase() === zeroAddress;
export function errorMessage(error: unknown): string {
  const e = error as { code?: number; shortMessage?: string; message?: string; cause?: unknown; data?: { errorName?: string } };
  if (e?.code === 4001 || /rejected|denied/i.test(e?.message || '')) return 'Request declined in your wallet. You can try again.';
  if (e?.data?.errorName === 'ERC20InsufficientBalance') return 'PACHU balance is too low. Reduce the amount and try again.';
  if (e?.data?.errorName === 'ERC20InsufficientAllowance') return 'Allowance is too low. Ask the token owner to approve your wallet first.';
  if (e?.cause) { const cause = errorMessage(e.cause); if (!cause.startsWith('Unable to')) return cause; }
  if (/insufficient funds/i.test(e?.message || '')) return 'ETH balance is too low for the amount and network fee.';
  if (/revert/i.test(e?.shortMessage || e?.message || '')) return `${e.shortMessage || 'Contract simulation reverted.'} Check the amount, balance and allowance before retrying.`;
  return e?.shortMessage || e?.message || 'Unable to complete the request. Check your connection and try again.';
}
