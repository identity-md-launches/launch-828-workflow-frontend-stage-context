import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeAbiParameters, encodeAbiParameters, keccak256, parseAbiParameters } from 'viem';

// Node 24 strips type-only syntax. Tests execute the production module directly.
const { swapInput, poolId, errorMessage } = await import('../src/protocol.ts');
const config = JSON.parse(readFileSync(new URL('../config/deployment.json', import.meta.url)));
const key = config.poolKey;

test('pool ID uses the complete attested key including the initialization guard', () => {
  assert.equal(poolId(key), keccak256(encodeAbiParameters(parseAbiParameters('(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)'), [key])));
  assert.notEqual(poolId(key), poolId({ ...key, hooks: '0x0000000000000000000000000000000000000000' }));
});
for (const extended of [false, true]) for (const zeroForOne of [false, true]) {
  test(`swap encoding: ${extended ? 'extended' : 'standard'}, ${zeroForOne ? 'buy' : 'sell'}`, () => {
    const input = zeroForOne ? key.currency0 : key.currency1;
    const output = zeroForOne ? key.currency1 : key.currency0;
    const [actions, params] = decodeAbiParameters(parseAbiParameters('bytes, bytes[]'), swapInput(key, input, 100n, 90n, extended));
    assert.equal(actions, '0x060c0f');
    const tuple = extended
      ? '(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks), bool, uint128, uint128, uint256, bytes'
      : '(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks), bool, uint128, uint128, bytes';
    const [swap] = decodeAbiParameters(parseAbiParameters(`(${tuple})`), params[0]);
    assert.equal(swap[0].hooks.toLowerCase(), key.hooks);
    assert.equal(swap[0].fee, key.fee);
    assert.equal(swap[1], zeroForOne);
    assert.equal(swap[2], 100n); assert.equal(swap[3], 90n);
    if (extended) assert.equal(swap[4], 0n);
    assert.equal(swap.at(-1), '0x');
    const settle = decodeAbiParameters(parseAbiParameters('address, uint256'), params[1]);
    const take = decodeAbiParameters(parseAbiParameters('address, uint256'), params[2]);
    assert.equal(settle[0].toLowerCase(), input); assert.equal(settle[1], 100n);
    assert.equal(take[0].toLowerCase(), output); assert.equal(take[1], 90n);
  });
}
test('wallet rejection and ERC-20 custom errors have recovery instructions', () => {
  assert.match(errorMessage({ code: 4001 }), /declined.*try again/i);
  assert.match(errorMessage({ cause: { data: { errorName: 'ERC20InsufficientAllowance' } } }), /approve your wallet/);
  assert.match(errorMessage({ data: { errorName: 'ERC20InsufficientBalance' } }), /reduce the amount/i);
});
