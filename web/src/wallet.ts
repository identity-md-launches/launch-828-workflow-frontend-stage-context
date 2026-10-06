import { useEffect, useRef, useState } from 'react';
import { createWalletClient, custom, getAddress, type Abi, type Address, type Hash } from 'viem';
import type { Runtime } from './config';
import { errorMessage } from './protocol';

export type Provider = {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
  on?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
};
declare global { interface Window { ethereum?: Provider } }
export function useWallet(runtime: Runtime) {
  const [provider, setProvider] = useState<Provider>();
  const [account, setAccount] = useState<Address>();
  const [chainId, setChainId] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const connecting = useRef(false);
  useEffect(() => {
    if (!provider) return;
    const accountsChanged = (accounts: string[]) => setAccount(accounts[0] ? getAddress(accounts[0]) : undefined);
    const chainChanged = (chain: string) => setChainId(Number(chain));
    const disconnected = () => { setAccount(undefined); setChainId(undefined); };
    provider.on?.('accountsChanged', accountsChanged);
    provider.on?.('chainChanged', chainChanged);
    provider.on?.('disconnect', disconnected);
    return () => {
      provider.removeListener?.('accountsChanged', accountsChanged);
      provider.removeListener?.('chainChanged', chainChanged);
      provider.removeListener?.('disconnect', disconnected);
    };
  }, [provider]);
  async function connect() {
    if (connecting.current) return;
    connecting.current = true; setBusy(true); setError('');
    try {
      const injected = window.ethereum;
      if (!injected) throw new Error('No browser wallet found. Open this site in a wallet browser or install an Ethereum browser wallet, then try again.');
      const accounts = await injected.request({ method: 'eth_requestAccounts' }) as string[];
      if (!accounts[0]) throw new Error('No account shared. Unlock your wallet and connect an account.');
      const chain = await injected.request({ method: 'eth_chainId' });
      setProvider(injected); setAccount(getAddress(accounts[0])); setChainId(Number(chain));
    } catch (e) { setError(errorMessage(e)); }
    finally { connecting.current = false; setBusy(false); }
  }
  async function switchChain() {
    if (!provider || connecting.current) return;
    connecting.current = true; setBusy(true); setError('');
    const params = [{ chainId: `0x${runtime.config.chainId.toString(16)}` }];
    try {
      try { await provider.request({ method: 'wallet_switchEthereumChain', params }); }
      catch (e) {
        const error = e as { code?: number; message?: string; data?: { originalError?: { code?: number } } };
        if ((error.code === 4902 || error.data?.originalError?.code === 4902 || /unknown chain|unrecognized chain|not added/i.test(error.message || '')) && runtime.config.walletAddChain) {
          await provider.request({ method: 'wallet_addEthereumChain', params: [runtime.config.walletAddChain] });
          await provider.request({ method: 'wallet_switchEthereumChain', params });
        } else throw e;
      }
      setChainId(Number(await provider.request({ method: 'eth_chainId' })));
    } catch (e) { setError(errorMessage(e)); }
    finally { connecting.current = false; setBusy(false); }
  }
  const disconnect = () => { setProvider(undefined); setAccount(undefined); setChainId(undefined); setError(''); };
  return { provider, account, chainId, busy, error, connect, switchChain, disconnect, correctChain: chainId === runtime.config.chainId };
}
export type Wallet = ReturnType<typeof useWallet>;
export type ContractCall = { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint };
type Transaction = { phase: 'simulating' | 'signing' | 'pending' | 'confirmed' | 'error'; text: string; hash?: Hash };
export function useTransactions(runtime: Runtime, wallet: Wallet, refresh: () => Promise<void>) {
  const [transactions, setTransactions] = useState<Record<string, Transaction>>({});
  const locked = useRef(false);
  const runVersion = useRef(0);
  const currentId = useRef('');
  const [busy, setBusy] = useState(false);
  function update(id: string, transaction: Transaction) { setTransactions(prev => ({ ...prev, [id]: transaction })); }
  async function assertWallet() {
    if (!wallet.provider || !wallet.account) throw new Error('Connect your wallet before continuing.');
    const chainId = Number(await wallet.provider.request({ method: 'eth_chainId' }));
    const accounts = await wallet.provider.request({ method: 'eth_accounts' }) as string[];
    if (chainId !== runtime.config.chainId) throw new Error(`Switch to ${runtime.config.network.name} before continuing.`);
    if (accounts[0]?.toLowerCase() !== wallet.account.toLowerCase()) throw new Error('Wallet account changed. Reconnect and review the action again.');
    if (await runtime.client.getChainId() !== runtime.config.chainId) throw new Error('RPC network differs from deployment. Try refreshing state.');
  }
  async function send(id: string, call: ContractCall) {
    if (locked.current) return false;
    locked.current = true; setBusy(true);
    const run = ++runVersion.current;
    currentId.current = id;
    let hash: Hash | undefined;
    let receiptKnown = false;
    try {
      update(id, { phase: 'simulating', text: 'Checking this action on chain…' });
      await assertWallet();
      const code = await runtime.client.getCode({ address: call.address });
      if (!code || code === '0x') throw new Error('No contract code at this address. Action blocked.');
      const simulation = await runtime.client.simulateContract({ ...call, account: wallet.account! });
      await assertWallet();
      update(id, { phase: 'signing', text: 'Confirm the amount and network fee in your wallet.' });
      const client = createWalletClient({ chain: runtime.chain, account: wallet.account!, transport: custom(wallet.provider!) });
      hash = await client.writeContract(simulation.request);
      update(id, { phase: 'pending', text: 'Submitted. Waiting for confirmation…', hash });
      const receipt = await runtime.client.waitForTransactionReceipt({ hash, confirmations: 1, timeout: 120000 });
      receiptKnown = true;
      if (receipt.status !== 'success') throw new Error('Transaction reverted on chain. Review the explorer details before trying again.');
      await refresh();
      update(id, { phase: 'confirmed', text: 'Confirmed on Ethereum. State refreshed.', hash });
      return true;
    } catch (e) {
      // A receipt timeout is not proof of failure. Keep the lock until a receipt is found.
      if (hash && !receiptKnown) {
        update(id, { phase: 'pending', text: 'Confirmation is taking longer. Check the transaction before submitting again.', hash });
        return false;
      }
      update(id, { phase: 'error', text: errorMessage(e), hash });
      return false;
    } finally {
      if (runVersion.current === run && (!hash || receiptKnown)) { locked.current = false; setBusy(false); }
    }
  }
  async function check(id: string) {
    const transaction = transactions[id];
    if (!transaction?.hash) return;
    try {
      const receipt = await runtime.client.getTransactionReceipt({ hash: transaction.hash });
      await refresh();
      update(id, { ...transaction, phase: receipt.status === 'success' ? 'confirmed' : 'error', text: receipt.status === 'success' ? 'Confirmed on Ethereum. State refreshed.' : 'Transaction reverted. Review the explorer details.' });
      if (currentId.current === id) { runVersion.current++; locked.current = false; setBusy(false); }
    } catch { update(id, { ...transaction, text: 'No receipt yet. Check the explorer or check confirmation again.' }); }
  }
  return { transactions, busy, send, check, assertWallet };
}
export type Transactions = ReturnType<typeof useTransactions>;
