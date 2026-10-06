import { useState } from 'react';
import { formatUnits, getAddress, type Address } from 'viem';
import type { Runtime } from './config';
import type { Transactions, Wallet } from './wallet';

export function amountText(value: bigint | undefined, decimals = 18, maximumFractionDigits = 6) {
  if (value === undefined) return '—';
  const exact = formatUnits(value, decimals);
  const number = Number(exact);
  if (number > 0 && number < 10 ** -maximumFractionDigits) return `< ${10 ** -maximumFractionDigits}`;
  return new Intl.NumberFormat('en', { maximumFractionDigits }).format(number);
}
export function External({ href, children, className = '' }: { href: string; children: React.ReactNode; className?: string }) {
  return <a href={href} className={className} target="_blank" rel="noopener noreferrer">{children}<span aria-hidden="true"> ↗</span><span className="sr-only"> (opens in a new tab)</span></a>;
}
export function AddressView({ address, runtime, label }: { address: Address; runtime: Runtime; label: string }) {
  const [feedback, setFeedback] = useState('');
  const checksum = getAddress(address);
  return <div className="address-view">
    <External href={`${runtime.config.network.explorer}/address/${checksum}`}><span className="sr-only">View {label} on the explorer: </span><code>{checksum}</code></External>
    <button className="copy-button" type="button" aria-label={`Copy ${label} address`} onClick={async () => {
      try { await navigator.clipboard.writeText(checksum); setFeedback('Address copied.'); }
      catch { setFeedback('Copy unavailable. Select and copy the address above.'); }
    }}>Copy</button>
    {feedback && <span className="small" role="status">{feedback}</span>}
  </div>;
}
export function WalletButton({ wallet, name, className = '' }: { wallet: Wallet; name: string; className?: string }) {
  return <button type="button" className={className} disabled={wallet.busy} onClick={() => void (wallet.account && !wallet.correctChain ? wallet.switchChain() : wallet.connect())}>
    {wallet.busy ? 'Waiting for wallet…' : wallet.account && !wallet.correctChain ? `Switch to ${name}` : 'Connect wallet'}
  </button>;
}
export function TransactionStatus({ id, tx, runtime }: { id: string; tx: Transactions; runtime: Runtime }) {
  const state = tx.transactions[id];
  if (!state) return null;
  return <div data-transaction={id} className={`transaction-status ${state.phase === 'error' ? 'error' : ''}`} role={state.phase === 'error' ? 'alert' : 'status'}>
    <p>{state.text}</p>
    {state.hash && <External href={`${runtime.config.network.explorer}/tx/${state.hash}`}>View transaction</External>}
    {state.phase === 'pending' && <button type="button" className="button quiet" onClick={() => void tx.check(id)}>Check confirmation</button>}
  </div>;
}
