# Pachu frontend

This contribution delivers the public PACHU frontend for the attested Ethereum deployment. Vite, React, TypeScript and viem build one static page with hash navigation and a relative base. Source, dependencies and build configuration are contained in `web/`; the complete prebuilt site is in repository-root `dist/`.

The publisher can host `dist/` directly on IPFS or any static host. No server, credentials, environment variables, WalletConnect project ID, contract redeployment, or frontend rebuild is required to use the delivered export. Browser-wallet signing and public RPC reads happen at runtime. Public source publication and IPFS naming remain the publisher's stage.

## Install, build and preview

Use Node 24 (also used for the type-stripped protocol tests) and npm. From `web/`:

```sh
npm ci --cache /tmp/pachu-npm-cache
npm run typecheck
npm run build
npm run preview -- --host 127.0.0.1
```

`build` typechecks, rebuilds `../dist/`, then generates `dist/imd-deployment.json` from the final bytes. The manifest is generated last and excludes itself from the asset inventory. `dev` starts the source development server; build first to use the production preview. For a gateway-like subpath, run `node scripts/serve.mjs` and open `http://localhost:4173/preview/`. Stop that foreground preview with Ctrl+C. Do not open `index.html` directly through `file://`; JSON configuration is fetched over HTTP.

## Configuration and integrity

`dist/imd-deployment.json` is the app's **only runtime deployment configuration**. `src/config.ts` loads it, then loads the ABI file at each `abiPath`, and verifies canonical Keccak hashes before rendering transaction controls. Contract addresses, the chain ID, pool key, public RPC URLs and Uniswap addresses all come from this file. Protocol function interfaces in `src/protocol.ts` contain no deployment addresses.

`config/deployment.json` and `config/network.json` retain the supplied build handoffs so rebuilding does not depend on temporary `.imd/reads/` files. They are build inputs, not a second runtime address map. The generator compares them to pinned inputs when present, copies the complete contract set, pool key, `network` and `walletAddChain` unchanged, rejects inventory drift, checks asset limits, and compares the token ABI byte-for-byte to `git show <sourceCommit>:docs/abi/LaunchToken.json`. Keep Git history containing the pinned source commit when rebuilding.

The deployed source commit is `17debaf1d107fcd9f184c03fa52fcc6447406b25`. The implementation-derived LaunchToken ABI hash is `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee` (Keccak of compact JSON with recursively sorted object keys and unchanged array order). Public handoff addresses are not secrets. The legacy admission fee of 3000 is not used; every quote and swap uses the attested pool key, including fee 12500 and its nonzero initialization guard.

## Supported flows

- Browser wallets exposing an EIP-1193 `window.ethereum` provider. Connection, rejection, disconnection, account changes, wrong-chain detection, switching, and unknown-chain addition use the supplied parameters. There is no automatic account connection. Disconnect removes this site's session; it does not revoke wallet permissions or allowances.
- Public RPC fallback, live metadata, total supply, wallet token/native balances, pool slot/liquidity/LP fee, block number, explorer links, address copy and pool inspection. Reads poll every 12 seconds while visible, matching Ethereum block cadence rather than issuing duplicate reads every few seconds. Contract-code checks run on connection/manual refresh/transaction confirmation and at most once per minute during ordinary polling. Signing always rechecks the account, both chain IDs, target code and contract simulation.
- Exact-input buy/sell through the handoff's quoter and Universal Router. Quotes use `eth_call` simulation, expire after 45 seconds, bind to wallet/chain/direction/inputs, and apply a 0.1–5% slippage limit (0.5% default). No invented USD price is shown. Estimated exchange rates are derived from each quote.
- Native input sends precisely the input value, with no approval. ERC-20 input reads fresh allowances and presents exact-amount token approval to Permit2, then exact-amount Permit2 approval to the configured router with a 30-minute expiration, then the swap. Only the currently needed step is actionable. Standard and extended router tuple encodings are tested; this launch uses the standard tuple.
- Token tools expose all deployed write functions: `transfer`, `approve` (including zero-value revocation), and `transferFrom`. Review reads balances and relevant allowances before signing. Replacing a different nonzero allowance requires revocation first. Nonzero full addresses are validated and checksummed; ENS name input/resolution is not implemented.
- Each write is simulated before signing and remains locked through receipt confirmation and refresh. Rejections/reverts are shown inline. A submitted transaction with an unknown outcome remains locked and offers an explorer link and a receipt-check action. Transient pending state is session-local; closing/reloading the page loses local transaction tracking, so inspect wallet history before retrying.

## Validation

```sh
npm test
npm run test:browser
npm run validate:export
node scripts/live-read.mjs
```

The worker browser script manages its own bounded HTTP server and Chromium session, serves the **production export** under `/preview/`, and mocks both public RPCs and the injected wallet. It never broadcasts. Set `PACHU_CHROMIUM` to a local Chromium executable; the worker default is `/opt/ms-playwright/chromium-1247/chrome-linux64/chrome`. Alternatively install Playwright's Chromium with `PLAYWRIGHT_BROWSERS_PATH=/tmp/pachu-browsers npx playwright install chromium` and set the executable path accordingly. Dependency/browser caches are not deliverables.

`live-read.mjs` performs only public reads and one quoter `eth_call`, writing timestamped evidence under `docs/evidence/`. It does not prove funded swap execution. Details, six-domain design review, findings and remaining limitations are in [`../docs/VALIDATION.md`](../docs/VALIDATION.md). The implemented design is in [`../docs/DESIGN.md`](../docs/DESIGN.md). The task's root `DESIGN.md` request conflicts with its stronger allowed-path rule; no root file was modified.

## Media and attribution

The site includes the supplied Higgsfield motion identity locally. Source URL: https://d3u0tzju9qaucj.cloudfront.net/234da064-93ed-416b-92bf-1844ab071271/11322e47-5f36-4aab-92d4-76c089d6d64f.mp4 . The 3,406,484-byte original has SHA-256 `b8a4fce43e7ec96a9951a7d7cf458b030fe71bf3245c7c064bc314c0985123d3`. The delivered H.264 copy preserves the complete 4.375-second motion at 900px width, removes audio and uses CRF 28; its WebP poster is a frame at 0.3 seconds. The original is not redundantly packaged. The local clip starts paused, has a visible play/pause control, and pauses when reduced motion is requested.

The design/review and documentation apply the pinned Better Interface guidance by Jakub Krehel (MIT, `267330e1adfc66a718fb65fa6918c1f06d0a689e`) and Paul Bakaus's Impeccable documentation method (Apache-2.0, `9d715cc4f5564a990ca8345abfdd5df6dc9b41c8`); [`../docs/INTERFACE-LICENSES.txt`](../docs/INTERFACE-LICENSES.txt) retains both notices/licenses. Ethereum UX guidance is adapted from Austin Griffith's ethskills at `06ea4efa08076ff04f6ca4945ef4a2ca881115b0`; see [`../docs/ETH-UX-LICENSE.txt`](../docs/ETH-UX-LICENSE.txt). These guides were read locally; their upstream sites were not fetched.

Protocol signatures and encoding were checked against the official [v4 routing guide](https://developers.uniswap.org/docs/protocols/v4/guides/swapping/routing), [IV4Quoter interface](https://github.com/Uniswap/v4-periphery/blob/main/src/interfaces/IV4Quoter.sol), and [StateView](https://github.com/Uniswap/v4-periphery/blob/main/src/lens/StateView.sol). Deployment addresses were taken exclusively from the pinned chain handoff. Dependencies are exact-pinned in `package-lock.json` with their normal package licenses; install them through npm. No vendored registry, dependency archive, cache or submodule is included.

## Submission and path budget

Only `web/**`, `dist/**`, and `docs/**` are delivered. The single explicit dotfile budget is **`web/.gitignore`**, as authorized by this task; it excludes dependencies, caches and test output at every nesting level. No other ignore file, root configuration, Solidity source, `lib/`, `remappings.txt`, `foundry.toml` or `.github/` is changed.

The worker's repository `.git` is read-only: `git add -- web dist docs` failed with `Unable to create .git/index.lock: Read-only file system`. To retain a real commit, the final source/export/evidence are committed on branch `frontend` in an isolated scratch clone and delivered in `docs/frontend.bundle`. The incremental bundle contains the complete scoped frontend commit and requires the existing base commit `17debaf1d107fcd9f184c03fa52fcc6447406b25`. Some older Git objects are absent from the worker checkout, so a full-history bundle could not be made. The bundle excludes itself to avoid recursive packaging. Its size is checked against 8 MiB. The original workspace HEAD remains the deployed source commit.

To review the committed tree, fetch the bundle into a writable checkout that already contains the pinned base commit:

```sh
git -C /path/to/review-checkout fetch /absolute/path/to/docs/frontend.bundle frontend
git -C /path/to/review-checkout checkout --detach FETCH_HEAD
```

The loose deliverables in this workspace match that commit. Hosting should use the loose `dist/` or the cloned commit's `dist/`, not the documentation bundle itself.
