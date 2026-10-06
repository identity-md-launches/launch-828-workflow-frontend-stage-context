import { useEffect, useState } from 'react';
import { formatUnits, getAddress, isAddress, zeroAddress, type Address } from 'viem';
import type { Runtime } from './config';
import { TransactionStatus } from './components';
import { errorMessage } from './protocol';
import type { LiveState } from './state';
import { parseAmount } from './Trade';
import type { Transactions, Wallet } from './wallet';

type Action = 'transfer' | 'approve' | 'transferFrom';
const labels: Record<Action, string> = { transfer: 'Transfer PACHU', approve: 'Set or revoke allowance', transferFrom: 'Transfer from an owner' };
export function TokenTools({ runtime, wallet, data, ready, tx }: { runtime: Runtime; wallet: Wallet; data?: LiveState; ready: boolean; tx: Transactions }) {
  const [action, setAction] = useState<Action>('transfer');
  const [target, setTarget] = useState('');
  const [owner, setOwner] = useState('');
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [review, setReview] = useState<{ key: string; args: readonly unknown[]; summary: string; time: number }>();
  const key = `${action}:${target}:${owner}:${amount}:${wallet.account}:${wallet.chainId}`;
  useEffect(() => { setReview(undefined); setError(''); }, [key]);
  function address(value: string, field: string): Address {
    const trimmed = value.trim();
    if (!isAddress(trimmed) || trimmed.toLowerCase() === zeroAddress) { document.getElementById(field)?.focus(); throw new Error('Enter a valid, nonzero Ethereum address. Paste the full 0x address.'); }
    return getAddress(trimmed);
  }
  async function inspect() {
    if (!ready || !wallet.account) return;
    setError(''); setReview(undefined); setReviewing(true);
    try {
      const recipient = address(target, 'tool-target');
      const from = action === 'transferFrom' ? address(owner, 'tool-owner') : wallet.account;
      let value: bigint;
      try { value = parseAmount(amount, data!.decimals, action === 'approve'); }
      catch (e) { document.getElementById('tool-amount')?.focus(); throw e; }
      if (value >= 1n << 256n) throw new Error('Amount is too large. Reduce it.');
      if (action !== 'approve' && recipient.toLowerCase() === runtime.token.address.toLowerCase()) throw new Error('Sending PACHU to its token contract makes it unrecoverable. Choose another recipient.');
      await tx.assertWallet();
      const read = (functionName: string, args: readonly unknown[]) => runtime.client.readContract({ address: runtime.token.address, abi: runtime.token.abi, functionName, args });
      const [balance, allowance] = await Promise.all([
        read('balanceOf', [from]),
        action === 'transfer' ? 0n : read('allowance', [from, action === 'approve' ? recipient : wallet.account]),
      ]) as bigint[];
      if (action !== 'approve' && value > balance) throw new Error('Owner balance is too low. Reduce the amount.');
      if (action === 'transferFrom' && value > allowance) throw new Error('Owner allowance for your wallet is too low. Ask the owner to approve your wallet first.');
      if (action === 'approve' && allowance > 0n && value > 0n && allowance !== value) throw new Error('Revoke the existing allowance first: set the amount to 0, confirm, then set the new amount.');
      const args = action === 'transferFrom' ? [from, recipient, value] : [recipient, value];
      const summary = action === 'approve'
        ? `Current allowance: ${formatUnits(allowance, data!.decimals)} PACHU. Set allowance for ${recipient} to ${formatUnits(value, data!.decimals)} PACHU. ${value === 0n ? 'This revokes future spending.' : 'This spender can spend that many tokens from your wallet.'}`
        : `Owner balance: ${formatUnits(balance, data!.decimals)} PACHU.${action === 'transferFrom' ? ` Allowance for your wallet: ${formatUnits(allowance, data!.decimals)} PACHU.` : ''} Send ${formatUnits(value, data!.decimals)} PACHU from ${from} to ${recipient}.`;
      setReview({ key, args, summary, time: Date.now() });
    } catch (e) { setError(errorMessage(e)); }
    finally { setReviewing(false); }
  }
  return <details className="token-tools" id="token-tools">
    <summary>Token tools <span>Transfer, approve and delegated transfer</span></summary>
    <div className="tools-content">
      <h2>Manage PACHU</h2>
      <p className="muted">Standard ERC-20 actions. Review the full address and allowance before confirming. Transfers cannot be undone.</p>
      <form onSubmit={e => { e.preventDefault(); void inspect(); }}>
        <label htmlFor="tool-action">Action</label>
        <select id="tool-action" disabled={tx.busy || reviewing} value={action} onChange={e => setAction(e.target.value as Action)}>
          {Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        {action === 'transferFrom' && <><label htmlFor="tool-owner">Token owner address</label><input id="tool-owner" name="owner" autoComplete="off" spellCheck={false} placeholder="0x…" value={owner} onChange={e => setOwner(e.target.value)} disabled={tx.busy || reviewing} aria-describedby="tool-error" aria-invalid={Boolean(error)} /></>}
        <label htmlFor="tool-target">{action === 'approve' ? 'Spender address' : 'Recipient address'}</label>
        <input id="tool-target" name="target" autoComplete="off" spellCheck={false} placeholder="0x…" value={target} onChange={e => setTarget(e.target.value)} onBlur={() => setTarget(value => value.trim())} disabled={tx.busy || reviewing} aria-describedby="tool-error" aria-invalid={Boolean(error)} />
        <label htmlFor="tool-amount">Amount (PACHU){action === 'approve' ? ' — enter 0 to revoke' : ''}</label>
        <input id="tool-amount" name="amount" inputMode="decimal" autoComplete="off" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} disabled={tx.busy || reviewing} aria-describedby="tool-error" aria-invalid={Boolean(error)} />
        <p className="small muted">USD context is unavailable. A network fee in ETH applies.</p>
        <p id="tool-error" className="error" role="alert">{error}</p>
        {!ready && <p className="small">Connect on {runtime.config.network.name} and refresh contract state to use these tools.</p>}
        <button type="submit" className="button quiet" disabled={!ready || tx.busy || reviewing}>{reviewing ? 'Reading state…' : 'Review on-chain state'}</button>
      </form>
      {review?.key === key && <div className="tool-review"><p>{review.summary}</p><button type="button" className="button quiet" disabled={!ready || tx.busy || reviewing} onClick={async () => {
        if (Date.now() - review.time > 60000) { setError('Review expired. Review on-chain state again before confirming.'); setReview(undefined); return; }
        const success = await tx.send(`tool-${action}`, { address: runtime.token.address, abi: runtime.token.abi, functionName: action, args: review.args });
        if (success) setReview(undefined);
      }}>{tx.busy ? 'Waiting for confirmation…' : action === 'approve' && review.args[1] === 0n ? 'Revoke PACHU allowance' : labels[action]}</button></div>}
      {(['transfer', 'approve', 'transferFrom'] as Action[]).map(id => <TransactionStatus key={id} id={`tool-${id}`} tx={tx} runtime={runtime} />)}
    </div>
  </details>;
}
