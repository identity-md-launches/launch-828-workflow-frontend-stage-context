import { useEffect, useRef, useState } from 'react';
import { formatUnits, parseUnits, type Address } from 'viem';
import type { Runtime } from './config';
import { amountText, External, TransactionStatus, WalletButton } from './components';
import { currencyAbi, errorMessage, isNative, permitAbi, quoteAbi, routerAbi, swapInput } from './protocol';
import type { LiveState } from './state';
import type { Transactions, Wallet } from './wallet';

export function parseAmount(text: string, decimals: number, allowZero = false) {
  if (!/^\d+(\.\d+)?$/.test(text.trim()) || (text.split('.')[1]?.length || 0) > decimals) throw new Error(`Enter a ${allowZero ? 'nonnegative' : 'positive'} amount with at most ${decimals} decimal places.`);
  const amount = parseUnits(text.trim(), decimals);
  if (amount < 0n || (!allowZero && amount === 0n)) throw new Error('Enter an amount greater than zero.');
  return amount;
}
type Quote = { amountIn: bigint; amountOut: bigint; minimum: bigint; key: string; time: number };
export function Trade({ runtime, wallet, data, ready, tx }: { runtime: Runtime; wallet: Wallet; data?: LiveState; ready: boolean; tx: Transactions }) {
  const [sell, setSell] = useState(false);
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('0.5');
  const [quote, setQuote] = useState<Quote>();
  const [quoting, setQuoting] = useState(false);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState('');
  const [allowances, setAllowances] = useState<{ token: bigint; router: bigint; expiration: number; key: string }>();
  const [now, setNow] = useState(Date.now());
  const sequence = useRef(0);
  const quoteLock = useRef(false);
  const actionLock = useRef(false);
  const pair = data?.pair;
  const input = sell ? runtime.token.address : pair?.address;
  const inputSymbol = sell ? (data?.symbol || 'PACHU') : (pair?.symbol || 'ETH');
  const outputSymbol = sell ? (pair?.symbol || 'ETH') : (data?.symbol || 'PACHU');
  const decimals = sell ? data?.decimals : pair?.decimals;
  const outDecimals = sell ? pair?.decimals : data?.decimals;
  const balance = sell ? data?.tokenBalance : data?.pairBalance;
  const key = `${sell}:${amount}:${slippage}:${wallet.account}:${wallet.chainId}`;
  const validQuote = quote?.key === key && now - quote.time < 45000 && now - (data?.updated || 0) < 30000;
  const { config, client } = runtime;
  const hasBalance = balance !== undefined && quote !== undefined && quote.amountIn <= balance;
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => { sequence.current++; setQuote(undefined); setAllowances(undefined); setError(''); }, [key]);

  async function readAllowances(address: Address, quoteKey: string) {
    if (isNative(address) || !wallet.account) return;
    const [token, router] = await Promise.all([
      client.readContract({ address, abi: address.toLowerCase() === runtime.token.address.toLowerCase() ? runtime.token.abi : currencyAbi, functionName: 'allowance', args: [wallet.account, config.network.uniswapV4.permit2] }),
      client.readContract({ address: config.network.uniswapV4.permit2, abi: permitAbi, functionName: 'allowance', args: [wallet.account, address, config.network.uniswapV4.universalRouter] }),
    ]);
    setAllowances({ token: token as bigint, router: router[0], expiration: router[1], key: quoteKey });
    return { token: token as bigint, router: router[0], expiration: router[1] };
  }
  async function getQuote() {
    if (!ready || !input || decimals === undefined || quoteLock.current) return;
    quoteLock.current = true; setQuoting(true); setError(''); setQuote(undefined);
    const current = ++sequence.current;
    try {
      const amountIn = parseAmount(amount, decimals);
      if (amountIn > (1n << 128n) - 1n) throw new Error('Amount is too large for this pool. Reduce it.');
      if (amountIn > (balance || 0n)) throw new Error(`Insufficient ${inputSymbol} balance. Reduce the amount.`);
      if (!/^\d+(\.\d{1,2})?$/.test(slippage) || Number(slippage) < 0.1 || Number(slippage) > 5) throw new Error('Set slippage between 0.1% and 5%, with at most two decimal places.');
      await tx.assertWallet();
      const response = await client.simulateContract({ address: config.network.uniswapV4.quoter, abi: quoteAbi, functionName: 'quoteExactInputSingle', args: [{ poolKey: config.poolKey, zeroForOne: input.toLowerCase() === config.poolKey.currency0.toLowerCase(), exactAmount: amountIn, hookData: '0x' }], account: wallet.account });
      const amountOut = response.result[0];
      const minimum = amountOut * BigInt(10000 - Math.round(Number(slippage) * 100)) / 10000n;
      if (minimum <= 0n || amountOut > (1n << 128n) - 1n) throw new Error('Quote cannot be safely executed. Try another amount.');
      if (current !== sequence.current) return;
      await readAllowances(input, key);
      if (current !== sequence.current) return;
      setQuote({ amountIn, amountOut, minimum, key, time: Date.now() }); setNow(Date.now());
    } catch (e) { if (current === sequence.current) setError(errorMessage(e)); }
    finally { quoteLock.current = false; setQuoting(false); }
  }
  const needsToken = input && !isNative(input) && validQuote && (!allowances || allowances.key !== key || allowances.token < quote!.amountIn);
  const needsRouter = input && !isNative(input) && validQuote && !needsToken && (!allowances || allowances.router < quote!.amountIn || allowances.expiration <= Math.floor(now / 1000));
  const actionId = needsToken ? 'trade-token-approve' : needsRouter ? 'trade-router-approve' : 'swap';
  async function act() {
    if (!ready || !validQuote || !hasBalance || !quote || !input || actionLock.current) return;
    actionLock.current = true; setActing(true);
    setError('');
    try {
      await tx.assertWallet();
      const allowance = await readAllowances(input, key);
      if (!isNative(input)) {
        const liveTokenShort = !allowance || allowance.token < quote.amountIn;
        const liveRouterShort = !allowance || allowance.router < quote.amountIn || allowance.expiration <= Math.floor(Date.now() / 1000);
        if (Boolean(needsToken) !== liveTokenShort || Boolean(needsRouter) !== (!liveTokenShort && liveRouterShort)) throw new Error('Allowance changed. Review the current approval step and try again.');
      }
      if (Date.now() - quote.time >= 45000) throw new Error('Quote expired. Get a new quote before continuing.');
      if (needsToken) {
        await tx.send(actionId, { address: input, abi: input.toLowerCase() === runtime.token.address.toLowerCase() ? runtime.token.abi : currencyAbi, functionName: 'approve', args: [config.network.uniswapV4.permit2, quote.amountIn] });
      } else if (needsRouter) {
        await tx.send(actionId, { address: config.network.uniswapV4.permit2, abi: permitAbi, functionName: 'approve', args: [input, config.network.uniswapV4.universalRouter, quote.amountIn, Math.floor(Date.now() / 1000) + 1800] });
      } else {
        const inputData = swapInput(config.poolKey, input, quote.amountIn, quote.minimum, config.network.uniswapV4.extendedSwapParams);
        await tx.send(actionId, { address: config.network.uniswapV4.universalRouter, abi: routerAbi, functionName: 'execute', args: ['0x10', [inputData], BigInt(Math.floor(Date.now() / 1000) + 180)], value: isNative(input) ? quote.amountIn : 0n });
        setQuote(undefined);
      }
      await readAllowances(input, key);
    } catch (e) { setError(errorMessage(e)); }
    finally { actionLock.current = false; setActing(false); }
  }
  const busy = tx.busy || quoting || acting;
  const stage = !wallet.account ? 'Connect' : !wallet.correctChain ? 'Switch network' : !validQuote ? 'Quote' : needsToken || needsRouter ? 'Approve' : 'Swap';
  return <section className="trade-card" aria-labelledby="trade-title" id="trade">
    <div className="section-heading"><h2 id="trade-title">Trade PACHU</h2><span className="pill">Uniswap v4</span></div>
    <p className="small muted">The attested {pair?.symbol || 'ETH'}/PACHU pool on {config.network.name}.</p>
    <div className="segmented" aria-label="Trade direction">
      <button type="button" aria-pressed={!sell} disabled={busy} onClick={() => setSell(false)}>Buy PACHU</button>
      <button type="button" aria-pressed={sell} disabled={busy} onClick={() => setSell(true)}>Sell PACHU</button>
    </div>
    <div className="amount-box">
      <label htmlFor="trade-amount">You pay <strong>{inputSymbol}</strong></label>
      <input id="trade-amount" name="trade-amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} disabled={busy} onChange={e => setAmount(e.target.value)} aria-describedby="trade-balance trade-error" aria-invalid={Boolean(error)} />
      <p id="trade-balance" className="small">Balance: <span title={balance === undefined ? undefined : formatUnits(balance, decimals || 18)}>{amountText(balance, decimals)} {inputSymbol}</span></p>
    </div>
    <div className="receive-box"><span>You receive (estimated)</span><strong>{validQuote ? amountText(quote?.amountOut, outDecimals, 8) : '—'} <span>{outputSymbol}</span></strong></div>
    <div className="slippage-row"><label htmlFor="slippage">Slippage limit</label><div><input id="slippage" name="slippage" inputMode="decimal" value={slippage} disabled={busy} onChange={e => setSlippage(e.target.value)} aria-describedby="slippage-help trade-error" aria-invalid={Boolean(error)} /><span>%</span></div></div>
    <p id="slippage-help" className="small muted">0.1–5%. Quotes expire after 45 seconds. Network fees are extra.</p>
    {validQuote && quote && <div className="quote-details"><p>Minimum received: <strong>{formatUnits(quote.minimum, outDecimals || 18)} {outputSymbol}</strong></p><p>Rate: 1 {inputSymbol} ≈ {new Intl.NumberFormat('en', { maximumSignificantDigits: 6 }).format(Number(formatUnits(quote.amountOut, outDecimals || 18)) / Number(amount))} {outputSymbol}</p><p>{needsToken ? `Step 1 of 3: allow Permit2 to spend exactly ${amount} ${inputSymbol}.` : needsRouter ? `Step 2 of 3: allow the router to spend exactly ${amount} ${inputSymbol} through Permit2 for 30 minutes.` : `Swap ${amount} ${inputSymbol} for at least ${formatUnits(quote.minimum, outDecimals || 18)} ${outputSymbol}.`}</p></div>}
    {quote && !validQuote && <p className="small" role="status">Quote expired or inputs changed. Get a new quote.</p>}
    {error && <p id="trade-error" className="error" role="alert">{error}</p>}
    {!wallet.account || !wallet.correctChain ? <WalletButton wallet={wallet} name={config.network.name} className="button primary full" /> : !validQuote ? <button className="button primary full" type="button" disabled={!ready || busy} onClick={() => void getQuote()}>{quoting ? 'Getting quote…' : 'Get quote'}</button> : <button className="button primary full" type="button" disabled={!ready || !hasBalance || busy} onClick={() => void act()}>{tx.busy || acting ? 'Waiting for confirmation…' : needsToken ? `Approve ${inputSymbol} to Permit2` : needsRouter ? 'Approve router allowance' : `Swap ${inputSymbol} for ${outputSymbol}`}</button>}
    <p className="small muted">Current step: {stage}. {wallet.account && wallet.correctChain && !ready ? 'Waiting for verified, initialized pool state.' : ''}</p>
    {['trade-token-approve', 'trade-router-approve', 'swap'].map(id => <TransactionStatus key={id} id={id} tx={tx} runtime={runtime} />)}
    <p className="small muted">USD context is unavailable; no price source was supplied.</p>
    <External href={`https://app.uniswap.org/swap?chain=${config.chainId}&inputCurrency=${pair && !isNative(pair.address) ? pair.address : 'ETH'}&outputCurrency=${runtime.token.address}`} className="trade-link">Open PACHU on Uniswap</External>
  </section>;
}
