import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { decodeAbiParameters, decodeFunctionData, parseAbiParameters } from 'viem';
import { previewServer } from '../scripts/serve.mjs';
import { account, config, injectWallet, mockChain, owner, recipient, tokenAbi } from './mock-chain.mjs';
import { routerAbi, permitAbi } from '../src/protocol.ts';

const server = previewServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/preview/`;
const executablePath = process.env.PACHU_CHROMIUM || '/opt/ms-playwright/chromium-1247/chrome-linux64/chrome';
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const results = [];
const assertText = async (page, text) => { await page.getByText(text, { exact: false }).first().waitFor({ timeout: 12000 }); };
async function fixture({ wallet = true, options, alter } = {}) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage(); const chain = mockChain(); alter?.(chain.state);
  await page.route(/https:\/\/(ethereum-rpc\.publicnode\.com|eth\.drpc\.org)/, chain.route);
  // Any unexpected external request is blocked: tests cannot send a real transaction.
  await page.route(url => url.protocol === 'https:' && !config.network.rpcUrls.some(rpc => url.href.startsWith(rpc)), route => route.abort());
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (wallet) await injectWallet(page, chain, options);
  await page.goto(url); await page.getByRole('heading', { name: 'Trade PACHU', exact: true }).waitFor();
  await assertText(page, 'active liquidity detected');
  const connect = async () => { await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click(); if (!options?.chainId || options.chainId === '0x1') await assertText(page, '2,000,000 PACHU'); };
  return { page, context, chain, connect, errors };
}
async function test(name, fn) {
  try { await fn(); results.push({ name, status: 'passed' }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, status: 'failed', error: error.message }); console.error(`FAIL ${name}: ${error.stack}`); }
}
try {
  await test('Disconnected controls, missing wallet recovery, keyboard disclosure', async () => {
    const { page, context, chain, errors } = await fixture({ wallet: false });
    await page.getByText('Token tools', { exact: false }).first().click();
    assert.equal(await page.getByRole('button', { name: 'Review on-chain state' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click();
    await assertText(page, 'No browser wallet found'); assert.equal(chain.state.sends.length, 0);
    await page.locator('.skip-link').focus(); await page.keyboard.press('Enter'); assert.match(page.url(), /#main$/);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('Wrong chain fails closed; missing-chain addition uses exact handoff', async () => {
    const f = await fixture({ options: { chainId: '0x5' } }); const { page, context } = f;
    await f.connect(); await assertText(page, 'Wrong network: chain 5');
    assert.equal(await page.getByRole('button', { name: 'Get quote' }).count(), 0);
    await page.evaluate(() => { window.walletMock.unknownChain = true; });
    await page.getByRole('button', { name: 'Switch to Ethereum', exact: true }).first().click();
    await assertText(page, '2,000,000 PACHU');
    const add = await page.evaluate(() => window.walletMock.requests.find(r => r.method === 'wallet_addEthereumChain'));
    assert.deepEqual(add.params, [config.walletAddChain]); await context.close();
  });
  await test('Connection rejection recovers, wallet account/chain changes invalidate readiness', async () => {
    const { page, context } = await fixture();
    await page.evaluate(() => { window.walletMock.rejectConnect = true; });
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click();
    await assertText(page, 'Request declined');
    assert.equal(await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().isEnabled(), true);
    await page.evaluate(() => { window.walletMock.rejectConnect = false; });
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().click();
    await assertText(page, '2,000,000 PACHU');
    await page.evaluate(() => window.walletMock.changeChain('0x5')); await assertText(page, 'Wrong network');
    await page.evaluate(() => window.walletMock.changeAccount(null));
    await page.getByRole('button', { name: 'Connect wallet', exact: true }).first().waitFor(); await context.close();
  });
  await test('Native buy: live balance, quote as eth_call, exact key/minimum/value; no approvals', async () => {
    const { page, context, chain, connect, errors } = await fixture(); await connect();
    await page.getByLabel('You pay').fill('0.1'); await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await assertText(page, 'Minimum received:');
    await page.locator('.trade-card').screenshot({ path: new URL('../../docs/evidence/buy-quote.webp', import.meta.url).pathname, type: 'webp' });
    assert.equal(chain.state.sends.length, 0); assert.equal(chain.state.quotes, 1);
    await page.getByRole('button', { name: 'Swap ETH for PACHU', exact: true }).click();
    await assertText(page, 'Confirmed on Ethereum');
    assert.equal(chain.state.sends.length, 1);
    const tx = chain.state.sends[0]; assert.equal(tx.to.toLowerCase(), config.network.uniswapV4.universalRouter);
    assert.equal(BigInt(tx.value), 10n ** 17n);
    const decoded = decodeFunctionData({ abi: routerAbi, data: tx.data });
    assert.equal(decoded.functionName, 'execute'); assert.equal(decoded.args[0], '0x10');
    const [actions, params] = decodeAbiParameters(parseAbiParameters('bytes, bytes[]'), decoded.args[1][0]); assert.equal(actions, '0x060c0f');
    const [swap] = decodeAbiParameters(parseAbiParameters('((address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, bool zeroForOne, uint128 amountIn, uint128 amountOutMinimum, bytes hookData)'), params[0]);
    assert.equal(swap.poolKey.hooks.toLowerCase(), config.poolKey.hooks); assert.equal(swap.poolKey.fee, 12500);
    assert.equal(swap.amountOutMinimum, 995n * 10n ** 18n); assert.equal(swap.zeroForOne, true);
    assert.deepEqual(errors, []); await context.close();
  });
  await test('Sell: exact ERC-20 approval, receipt lock, Permit2 router approval, then zero-value swap', async () => {
    const { page, context, chain, connect } = await fixture(); await connect();
    await page.getByRole('button', { name: 'Sell PACHU', exact: true }).click(); await page.getByLabel('You pay').fill('1000');
    await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await page.getByRole('button', { name: 'Approve PACHU to Permit2', exact: true }).waitFor();
    await page.locator('.trade-card').screenshot({ path: new URL('../../docs/evidence/sell-approval.webp', import.meta.url).pathname, type: 'webp' });
    assert.equal(await page.getByRole('button', { name: 'Swap PACHU for ETH', exact: true }).count(), 0);
    chain.state.holdReceipt = true; await page.getByRole('button', { name: 'Approve PACHU to Permit2', exact: true }).click();
    await assertText(page, 'Submitted. Waiting for confirmation');
    assert.equal(await page.getByRole('button', { name: 'Waiting for confirmation…', exact: true }).isDisabled(), true);
    assert.equal(chain.state.sends.length, 1);
    chain.state.holdReceipt = false;
    await page.getByRole('button', { name: 'Check confirmation' }).click();
    await page.getByRole('button', { name: 'Approve router allowance', exact: true }).waitFor({ timeout: 20000 });
    const approval = decodeFunctionData({ abi: tokenAbi, data: chain.state.sends[0].data });
    assert.equal(approval.functionName, 'approve'); assert.equal(approval.args[0].toLowerCase(), config.network.uniswapV4.permit2); assert.equal(approval.args[1], 1000n * 10n ** 18n);
    await page.getByRole('button', { name: 'Approve router allowance', exact: true }).click();
    await page.getByRole('button', { name: 'Swap PACHU for ETH', exact: true }).waitFor({ timeout: 20000 });
    const permit = decodeFunctionData({ abi: permitAbi, data: chain.state.sends[1].data });
    assert.equal(permit.args[1].toLowerCase(), config.network.uniswapV4.universalRouter); assert.equal(permit.args[2], 1000n * 10n ** 18n);
    await page.getByRole('button', { name: 'Swap PACHU for ETH', exact: true }).click();
    await page.locator('[data-transaction="swap"]').filter({ hasText: 'Confirmed' }).waitFor({ timeout: 20000 });
    assert.equal(chain.state.sends.length, 3); assert.equal(BigInt(chain.state.sends[2].value || 0), 0n); await context.close();
  });
  await test('Expired Permit2 allowance requires router approval despite sufficient amount', async () => {
    const { page, context, connect } = await fixture({ alter: s => { s.tokenAllowance = 10n ** 25n; s.routerAllowance = 10n ** 25n; s.routerExpiration = 1; } });
    await connect(); await page.getByRole('button', { name: 'Sell PACHU', exact: true }).click(); await page.getByLabel('You pay').fill('1000');
    await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await page.getByRole('button', { name: 'Approve router allowance', exact: true }).waitFor(); await context.close();
  });
  await test('Input precision, low balance, slippage and quote errors prevent signing', async () => {
    const { page, context, chain, connect } = await fixture(); await connect();
    for (const [amount, slippage, message] of [['0.0000000000000000001', '0.5', 'at most 18 decimal'], ['11', '0.5', 'Insufficient ETH'], ['0.1', '10', 'Set slippage between']]) {
      await page.getByLabel('You pay').fill(amount); await page.getByLabel('Slippage limit').fill(slippage); await page.getByRole('button', { name: 'Get quote', exact: true }).click(); await assertText(page, message);
    }
    chain.state.quoteRevert = true; await page.getByLabel('Slippage limit').fill('0.5'); await page.getByRole('button', { name: 'Get quote', exact: true }).click(); await assertText(page, 'Check the amount');
    assert.equal(chain.state.sends.length, 0); await context.close();
  });
  await test('Swap simulation revert and wallet signing rejection recover without a broadcast', async () => {
    const { page, context, chain, connect } = await fixture(); await connect();
    await page.getByLabel('You pay').fill('0.1'); await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await page.getByRole('button', { name: 'Swap ETH for PACHU', exact: true }).waitFor();
    chain.state.executeRevert = true; await page.getByRole('button', { name: 'Swap ETH for PACHU', exact: true }).click();
    await assertText(page, 'Check the amount'); assert.equal(chain.state.sends.length, 0);
    chain.state.executeRevert = false; await page.evaluate(() => { window.walletMock.rejectSign = true; });
    await page.getByRole('button', { name: 'Get quote', exact: true }).click(); await page.getByRole('button', { name: 'Swap ETH for PACHU', exact: true }).click();
    await assertText(page, 'Request declined'); assert.equal(chain.state.sends.length, 0); await context.close();
  });
  await test('Transfer, approve/revoke and transferFrom use the attested ABI with reviewed state', async () => {
    const { page, context, chain, connect } = await fixture(); await connect();
    await page.locator('.token-tools > summary').click();
    await page.getByLabel('Recipient address').fill('invalid'); await page.getByLabel('Amount (PACHU)', { exact: true }).fill('10');
    await page.getByRole('button', { name: 'Review on-chain state' }).click(); await assertText(page, 'valid, nonzero Ethereum');
    assert.equal(await page.getByRole('button', { name: 'Transfer PACHU', exact: true }).count(), 0);
    await page.getByLabel('Recipient address').fill(` ${recipient} `); await page.getByRole('button', { name: 'Review on-chain state' }).click();
    await page.getByRole('button', { name: 'Transfer PACHU', exact: true }).click(); await assertText(page, 'Confirmed on Ethereum');
    assert.equal(decodeFunctionData({ abi: tokenAbi, data: chain.state.sends[0].data }).functionName, 'transfer');
    await page.getByLabel('Action', { exact: true }).selectOption('approve'); await page.getByLabel('Spender address').fill(recipient); await page.getByLabel('Amount (PACHU)', { exact: false }).fill('20');
    await page.getByRole('button', { name: 'Review on-chain state' }).click(); await page.getByRole('button', { name: 'Set or revoke allowance', exact: true }).click();
    await page.locator('.token-tools .transaction-status').filter({ hasText: 'Confirmed' }).last().waitFor();
    await page.getByLabel('Amount (PACHU)', { exact: false }).fill('30'); await page.getByRole('button', { name: 'Review on-chain state' }).click(); await assertText(page, 'Revoke the existing allowance first');
    await page.getByLabel('Amount (PACHU)', { exact: false }).fill('0'); await page.getByRole('button', { name: 'Review on-chain state' }).click(); await page.getByRole('button', { name: 'Revoke PACHU allowance', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.tool-review')); assert.equal(chain.state.customAllowance, 0n);
    await page.getByLabel('Action', { exact: true }).selectOption('transferFrom'); await page.getByLabel('Token owner address').fill(owner); await page.getByLabel('Recipient address').fill(recipient); await page.getByLabel('Amount (PACHU)', { exact: false }).fill('10');
    await page.getByRole('button', { name: 'Review on-chain state' }).click(); await page.getByRole('button', { name: 'Transfer from an owner', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.tool-review'));
    assert.equal(chain.state.sends.length, 4); assert.equal(decodeFunctionData({ abi: tokenAbi, data: chain.state.sends[3].data }).functionName, 'transferFrom'); await context.close();
  });
  await test('Live verification fails closed after missing code or RPC chain mismatch', async () => {
    const { page, context, chain, connect } = await fixture(); await connect();
    chain.state.missingCode = true; await page.getByRole('button', { name: 'Refresh contract state', exact: true }).click(); await assertText(page, 'no deployed code');
    assert.equal(await page.getByRole('button', { name: 'Get quote', exact: true }).isDisabled(), true);
    chain.state.missingCode = false; chain.state.chainId = 5; await page.getByRole('button', { name: 'Refresh contract state', exact: true }).click(); await assertText(page, 'different network');
    assert.equal(chain.state.sends.length, 0); await context.close();
  });
  await test('Modified ABI causes configuration error and no transaction controls', async () => {
    const context = await browser.newContext(); const page = await context.newPage();
    await page.route('**/abi/LaunchToken.json', route => route.fulfill({ contentType: 'application/json', body: '[]' }));
    await page.goto(url); await assertText(page, 'ABI does not match'); assert.equal(await page.getByRole('button', { name: 'Connect wallet' }).count(), 0); await context.close();
  });
  await test('Keyboard-only connection and native swap, with a visible focus indicator', async () => {
    const { page, context, chain } = await fixture();
    async function tabTo(id) {
      for (let i = 0; i < 40; i++) {
        const matches = await page.evaluate(id => id.startsWith('#') ? document.activeElement?.id === id.slice(1) : document.activeElement?.textContent === id, id);
        if (matches) return;
        await page.keyboard.press('Tab');
      }
      throw new Error(`Keyboard could not reach ${id}`);
    }
    await tabTo('Connect wallet');
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineWidth); assert.equal(outline, '3px');
    await page.keyboard.press('Enter'); await assertText(page, '2,000,000 PACHU');
    await tabTo('#trade-amount'); await page.keyboard.type('0.1');
    await tabTo('Get quote'); await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Swap ETH for PACHU', exact: true }).waitFor();
    await tabTo('Swap ETH for PACHU'); await page.keyboard.press('Enter');
    await page.locator('[data-transaction="swap"]').filter({ hasText: 'Confirmed' }).waitFor();
    assert.equal(chain.state.sends.length, 1); await context.close();
  });
  await test('Public RPC fallback recovers; total RPC failure disables trading with recovery', async () => {
    const { page, context, chain, connect } = await fixture(); await connect();
    await page.route('https://ethereum-rpc.publicnode.com/**', route => route.abort());
    await page.getByRole('button', { name: 'Refresh contract state', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh contract state', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Get quote', exact: true }).isEnabled(), true);
    chain.state.rpcDown = true;
    await page.getByRole('button', { name: 'Refresh contract state', exact: true }).click();
    await page.getByRole('button', { name: 'Refresh contract state', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Get quote', exact: true }).isDisabled(), true);
    assert.equal(chain.state.sends.length, 0); await context.close();
  });
  await test('Inputs changing during a quote discard the older result', async () => {
    const { page, context, chain, connect } = await fixture(); await connect();
    // Account and chain events can arrive while user inputs are locked for an RPC request.
    chain.state.quoteRevert = false;
    await page.route('https://ethereum-rpc.publicnode.com/**', async route => { await new Promise(resolve => setTimeout(resolve, 200)); await chain.route(route); });
    await page.getByLabel('You pay').fill('0.1'); await page.getByRole('button', { name: 'Get quote', exact: true }).click();
    await page.evaluate(() => window.walletMock.changeChain('0x5'));
    await assertText(page, 'Wrong network');
    await page.getByRole('button', { name: 'Switch to Ethereum', exact: true }).first().waitFor();
    assert.equal(await page.getByRole('button', { name: 'Swap ETH for PACHU', exact: true }).count(), 0);
    assert.equal(chain.state.sends.length, 0); await context.close();
  });
} finally {
  await browser.close(); await new Promise(resolve => server.close(resolve));
  await mkdir(new URL('../../docs/evidence/', import.meta.url), { recursive: true });
  await writeFile(new URL('../../docs/evidence/interactions.json', import.meta.url), JSON.stringify({ checkedAt: new Date().toISOString(), mode: 'Production export at /preview/, mocked RPC and injected wallet; no real funds or broadcasts', tests: results }, null, 2) + '\n');
}
if (results.some(r => r.status === 'failed')) process.exitCode = 1;
