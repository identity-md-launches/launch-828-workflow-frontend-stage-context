import { useEffect, useRef, useState } from 'react';
import { formatUnits } from 'viem';
import type { Runtime } from './config';
import { AddressView, amountText, External, WalletButton } from './components';
import { poolId } from './protocol';
import { useLiveState } from './state';
import { useTransactions, useWallet } from './wallet';
import { Trade } from './Trade';
import { TokenTools } from './TokenTools';

const repository = 'https://github.com/identity-md-launches/launch-823-pachutoken';
function MotionIdentity() {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => { setReduced(media.matches); if (media.matches) ref.current?.pause(); };
    change(); media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return <figure className="identity">
    <div className="identity-top"><span>Character study / 001</span><span>Pachu in motion</span></div>
    <div className="video-frame"><video ref={ref} src="./media/pachu.mp4" poster="./media/pachu.webp" muted loop playsInline preload="metadata" aria-label="Pachu’s illustrated character moving with a sword, wearing an orange coat" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setError('Motion unavailable. The still image shows Pachu’s identity.')} />
      <button type="button" className="motion-button" aria-pressed={playing} onClick={async () => { if (playing) ref.current?.pause(); else try { await ref.current?.play(); } catch { setError('Unable to play the clip. Try again.'); } }}>{playing ? 'Pause motion' : 'Play motion'} <span aria-hidden="true">{playing ? 'Ⅱ' : '▷'}</span></button>
    </div>
    <figcaption><span>A little character. A world of possibility.</span><span className="small">{reduced ? 'Motion off by preference' : 'Play when you’re ready'}</span></figcaption>
    {error && <p className="error" role="alert">{error}</p>}
  </figure>;
}
export default function App({ runtime }: { runtime: Runtime }) {
  const wallet = useWallet(runtime);
  const state = useLiveState(runtime, wallet.correctChain ? wallet.account : undefined);
  const tx = useTransactions(runtime, wallet, () => state.refresh(true));
  const { data } = state;
  const ready = Boolean(wallet.account && wallet.correctChain && state.verified && data && Date.now() - data.updated < 30000);
  const tradeReady = ready && Boolean(data && data.sqrtPrice > 0n && data.liquidity > 0n);
  const [copied, setCopied] = useState('');
  return <>
    <a className="skip-link" href="#main">Skip to content</a>
    <div className="page-shell">
      <header className="header"><a className="wordmark" href="#main" aria-label="Pachu home"><span className="brand-mark" aria-hidden="true">p</span>pachu<span className="wordmark-dot" aria-hidden="true">.</span></a>
        <nav aria-label="Main navigation"><a href="#about">Meet Pachu</a><a href="#launch">The launch</a><a href="#trade">Trade</a></nav>
        {wallet.account && wallet.correctChain ? <button className="button wallet-button" type="button" onClick={wallet.disconnect}>Disconnect wallet</button> : <WalletButton wallet={wallet} name={runtime.config.network.name} className="button wallet-button" />}
      </header>
      <main id="main">
        <section className="hero" id="about" aria-labelledby="hero-title">
          <div className="hero-copy"><div className="eyebrow"><span className="status-dot" aria-hidden="true" />An AI agent with a character of its own</div>
            <h1 id="hero-title">A little character.<br /><em>A new chapter.</em></h1>
            <p className="hero-description">Meet Pachu. An AI agent exploring digital identity through a playful character, a signature motion, and a token on Ethereum.</p>
            <a className="hero-link" href="#trade">Explore PACHU <span aria-hidden="true">↘</span></a>
            <p className="hero-footnote">A consistent identity. An open beginning.</p>
          </div><MotionIdentity />
        </section>
        <section className="stats" aria-label="Launch overview">
          <div><span className="small">Fixed supply</span><strong title={data ? `${formatUnits(data.supply, data.decimals)} ${data.symbol}` : undefined}>{data ? amountText(data.supply, data.decimals, 0) : '1,000,000,000'} <span>PACHU</span></strong><p>Minted once. No further issuance.</p></div>
          <div><span className="small">Approved pool allocation</span><strong>88<span>%</span></strong><p>Of the launch supply.</p></div>
          <div><span className="small">Pool pairing</span><strong>{data?.pair.symbol || 'ETH'} <span>/ PACHU</span></strong><p>Uniswap v4 · Ethereum mainnet.</p></div>
        </section>
        <div className="market-layout">
          <section className="launch-copy" id="launch" aria-labelledby="launch-title"><span className="eyebrow">On chain, in the open</span><h2 id="launch-title">Small character.<br />Clear foundations.</h2><p className="muted">PACHU is a standard, fixed-supply token. Its contract has no owner powers, transfer tax, pause, or upgrade.</p>
            <div className="launch-status"><span className="small">Launch status</span><p className="status-text" role="status">{state.verified && data ? data.sqrtPrice > 0n ? data.liquidity > 0n ? 'Pool initialized · active liquidity detected' : 'Pool initialized · no active liquidity detected' : 'Token deployed · pool not initialized' : 'Deployment attested · live state unverified'}</p><p className="small muted">{data ? `Last read at block ${data.block.toLocaleString()}.` : 'Checking the supplied public RPCs.'} {state.error ? 'Live verification unavailable.' : ''}</p></div>
            {state.error && <p className="error" role="alert">{state.error}</p>}
            <button className="button quiet" type="button" disabled={state.loading} onClick={() => void state.refresh(true)}>{state.loading ? 'Reading chain…' : 'Refresh contract state'}</button>
            <div className="wallet-state" aria-labelledby="wallet-title"><h3 id="wallet-title">Your wallet</h3>{wallet.account ? <><AddressView runtime={runtime} address={wallet.account} label="connected wallet" />{!wallet.correctChain ? <p className="error">Wrong network: chain {wallet.chainId}. Switch to {runtime.config.network.name} to continue.</p> : <div className="balances"><p><span>PACHU balance</span><strong title={data?.tokenBalance === undefined ? undefined : formatUnits(data.tokenBalance, data.decimals)}>{amountText(data?.tokenBalance, data?.decimals)} PACHU</strong></p><p><span>{data?.pair.symbol || 'ETH'} balance</span><strong>{amountText(data?.pairBalance, data?.pair.decimals)} {data?.pair.symbol || 'ETH'}</strong></p></div>}</> : <p className="small muted">Connect a browser wallet to see your balance and use the token. You keep control of every transaction.</p>}
              {wallet.error && <p className="error" role="alert">{wallet.error}</p>}
            </div>
          </section>
          <Trade runtime={runtime} wallet={wallet} data={data} ready={tradeReady} tx={tx} />
        </div>
        <section className="deployment" aria-labelledby="deployment-title"><div className="section-heading"><div><span className="eyebrow">Check the details</span><h2 id="deployment-title">The launch, by the numbers.</h2></div><External href={repository}>View public source</External></div>
          <div className="contract-grid"><div><h3>PACHU token</h3><AddressView runtime={runtime} address={runtime.token.address} label="PACHU token" /><p className="small muted">Address and ABI bound to the deployment attestation.</p></div><div><h3>Pool manager</h3><AddressView runtime={runtime} address={runtime.config.network.uniswapV4.poolManager} label="pool manager" /><p className="small muted">Uniswap v4 shares one manager; the pool is identified by its key.</p></div></div>
          <details className="pool-details"><summary>Inspect pool key and deployment</summary><dl><div><dt>Pool ID</dt><dd><code>{poolId(runtime.config.poolKey)}</code><button className="copy-button" type="button" onClick={async () => { try { await navigator.clipboard.writeText(poolId(runtime.config.poolKey)); setCopied('Pool ID copied.'); } catch { setCopied('Select and copy the pool ID.'); } }}>Copy pool ID</button><span role="status">{copied}</span></dd></div>
            <div><dt>Currency 0</dt><dd><code>{runtime.config.poolKey.currency0}</code> {data?.pair.symbol || 'ETH'} (native currency)</dd></div><div><dt>Currency 1</dt><dd><AddressView runtime={runtime} address={runtime.config.poolKey.currency1} label="currency 1" /></dd></div>
            <div><dt>Pool key fee</dt><dd>{runtime.config.poolKey.fee / 10000}% ({runtime.config.poolKey.fee})</dd></div><div><dt>Live LP fee</dt><dd>{data ? `${data.lpFee / 10000}%` : 'Not verified'}</dd></div><div><dt>Tick spacing / current tick</dt><dd>{runtime.config.poolKey.tickSpacing} / {data?.tick ?? 'Not verified'}</dd></div>
            <div><dt>Initialization guard</dt><dd><AddressView runtime={runtime} address={runtime.config.poolKey.hooks} label="initialization guard" /></dd></div>
            <div><dt>Swap router</dt><dd><AddressView runtime={runtime} address={runtime.config.network.uniswapV4.universalRouter} label="swap router" /></dd></div>
            <div><dt>Permit2</dt><dd><AddressView runtime={runtime} address={runtime.config.network.uniswapV4.permit2} label="Permit2" /></dd></div>
            <div><dt>Deployed source</dt><dd><External href={`${repository}/commit/${runtime.config.sourceCommit}`}><code>{runtime.config.sourceCommit}</code></External></dd></div>
            <div><dt>Attestation hash</dt><dd><code>{runtime.config.attestationHash}</code></dd></div>
            <div><dt>Runtime configuration</dt><dd><a href="./imd-deployment.json">Open deployment manifest</a></dd></div>
          </dl></details>
        </section>
        <TokenTools runtime={runtime} wallet={wallet} data={data} ready={ready} tx={tx} />
      </main>
      <footer><a className="wordmark" href="#main">pachu.</a><p>A character of its own. On Ethereum.</p><div><External href={repository}>Source code</External><External href={`${runtime.config.network.explorer}/address/${runtime.token.address}`}>PACHU on Etherscan</External></div></footer>
    </div>
  </>;
}
