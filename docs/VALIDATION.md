# Frontend validation and interface review

Worker report, 2026-10-07 Asia/Taipei (timestamped evidence uses UTC). These are local contributor checks, not independent network certification. The publication control plane has not run here, and this assignment does not publish or redeploy anything.

## Scope and assumptions

One static Pachu page, the supplied motion identity, Ethereum deployment reads, browser-wallet connection, exact-input ETH/PACHU trading and all three ERC-20 write functions. The handoff's pool key controls fee, currency order, spacing and the initialization guard. No fee/address was inferred from the older launch manifest. The approved 88% allocation is labeled as an approved allocation; this UI does not reconstruct or attest the factory's distribution transactions.

The AI agent's introduction describes its character and digital identity; no autonomous service capability, roadmap, economic return or USD price is invented. The public repository URL and approved media URL come from the supplied inputs. One light theme and English copy are implemented. Full checksummed addresses are used; ENS, QR/WalletConnect connections, liquidity management and distributor claims are not added because this assignment supplies only the token implementation ABI and its launch pool, with no project controls for those flows.

The static export is served at `/preview/` for browser checks. The guide's `test/scratch/browser/preview.json` was unavailable in this installation; the supplied browser tool successfully reached a bounded foreground preview from `web/scripts/serve.mjs`. The separate Playwright suite creates and closes its own foreground server and browser. MCP default screenshots/snapshots are temporary tooling output and are moved to `test/scratch/`; only selected evidence in `docs/evidence/` is delivered.

## Build and integrity checks

| Actual check | Result |
| --- | --- |
| `npm install --cache /tmp/pachu-npm-cache --save-exact …` / exact dev dependencies | Installed normally; npm reported zero vulnerabilities at installation. Lockfile retained. No security-audit certification is claimed. |
| `npm run typecheck` (also invoked by the final build) | Pass, strict TypeScript, exit 0. |
| `npm run build` | Pass, Vite relative base, final index and local assets exported. Vite reports a nonfatal >500kB JavaScript chunk warning: main JS is ~542kB uncompressed / ~165kB gzip. No missing CSS import or build error remains. |
| `npm test` | Pass, 6 tests: complete pool ID binding, standard/extended encodings in both directions, wallet/custom-error recovery text. |
| `npm run test:browser` | Pass, 14 interaction scenarios against the final production export; `evidence/interactions.json`. No real transactions. |
| `npm run validate:export` | Pass: exact configuration, pinned-source ABI bytes and canonical Keccak hash, complete SHA-256 inventory, no extra top-level manifest fields. |
| `node scripts/live-read.mjs` | Public chain/code/token/pool reads and one quoter simulation succeeded; `evidence/live-read.json`. |
| Ignore rules / path inspection | Only `web/.gitignore` is budgeted. Dependencies and caches are ignored at nested paths. No submodule or root build/configuration change. |

The final inventory has **8 assets, 880,618 asset bytes**, and **883,907 total export bytes including the manifest**. It includes index HTML, both JS chunks, CSS, favicon, the implementation ABI, video and poster. Every asset is below 8 MiB, with ample room below the 128-asset limit and the two-copy HTTP budget. The manifest excludes itself. `sourceCommit`, `launchId`, `attestationHash`, contract set and hashes match the pinned handoff; `poolKey`, `network`, and `walletAddChain` are copied unchanged. The runtime loads this same manifest and referenced ABI. No private credentials or independently hardcoded router/address map is present.

Original source/configuration and root lockfiles are preserved. The ABI exported at `dist/abi/LaunchToken.json` is byte-identical to the implementation-derived ABI at deployed source commit `17debaf1d107fcd9f184c03fa52fcc6447406b25`; canonical Keccak is `38880b8e56d42ce900f744a7908c7139632a49f1c3f33385c64ceaed29d37bee`.

## Interaction coverage

The production browser suite checks:

1. Disconnected controls, missing-wallet recovery, skip link and disclosure access.
2. Wrong-chain gating and 4902 switch failure followed by the **exact** wallet-add-chain object and a second switch.
3. Connection rejection, recovery, account change and chain change invalidation.
4. Native buy: live mock balance, quoter `eth_call` only, actual router calldata decoded to assert `0x10`/`0x060c0f`, the nonzero guard, exact input/value and 0.5% minimum. No token approvals.
5. Sell: token approval to configured Permit2, receipt lock against repeat submission, fresh allowance read, Permit2 approval to the configured router, then a swap with zero transaction value.
6. Expired Permit2 permission despite sufficient allowance amount.
7. Excess precision, low balance, invalid slippage and quote reverts; no signing.
8. Router simulation revert and wallet signing rejection; no broadcast and usable recovery.
9. Transfer, allowance creation, blocked nonzero replacement, zero revocation, and delegated transfer with owner balance/allowance review; real attested ABI used.
10. Missing contract code and configured RPC chain mismatch; writes disabled.
11. Modified token ABI; bootstrap fails closed before transaction controls appear.
12. Keyboard-only connect/quote/swap using Tab, type and Enter; focus indicator observed.
13. First public RPC failure followed by the configured fallback, then total RPC failure with disabled trading and refresh recovery.
14. Chain change during an outstanding quote; its old result is discarded.

The tests intercept every configured RPC and mock the wallet's signing response. They assert transaction targets, amounts, approval arguments, decoded swap parameters and transaction counts. Their successful receipts are **mock receipts**, not mined swaps. Unexpected external requests are blocked. Tests did not use keys or a funded wallet.

## Live read evidence

At UTC `2026-10-06T18:07:08.181Z`, the configured public RPC reported chain ID 1 and block 26,135,019. Every supplied token/protocol/guard address returned nonempty code. LaunchToken returned Pachu, PACHU, 18 decimals and `10^27` supply units. The attested pool ID is `0xc620ea53e6e65f09f188a116decc44703e84c1af2738e4b30a42d0d885216aec`; it returned nonzero initialization price and active liquidity, tick 183988 and LP fee 12500. The read-only quote simulation for 0.001 ETH returned `96520429318573668843246` PACHU minor units and a 37,543 gas estimate. These observations can change with chain state; they are not fixed quotes or guarantees of execution.

Explorer source verification, deployment transaction receipts, complete allocation accounting, funded router execution, actual wallet signing and mining/replacement/cancellation behavior were not independently verified. The site identifies handoff-bound addresses and performs code checks; it does not claim an independent bytecode/security audit.

## Consolidated Better Interface review

The pinned workflow, core principles in all six domains, relevant media/form/focus/contrast guidance and implemented-design documentation method were read and applied during implementation. Coverage is consolidated by root cause. Reading a guide alone is not counted as a rendered check.

| Domain | Coverage | Evidence and limitations |
| --- | --- | --- |
| Accessibility | Checked | Native landmarks, headings, labels/select/details, skip link, `aria-pressed`, status/error regions, field focus on invalid address, 44–48px controls, copy target, visible 3px focus ring, reduced-motion pause and no autoplay. Keyboard connection through swap exercised. Screen-reader, physical touch and full accessibility compliance are not verified. |
| Layout | Checked | Desktop 1440×1000, intermediate 820×1000, mobile 320×900; no horizontal overflow at normal text size. Root text enlargement to 32px checked at 720, 820 and 320px; 320px defect fixed and rechecked. Full addresses and native disclosures remain reachable. Native browser 200% zoom, RTL mirror and localization/pseudo-localization are not verified; no alternate locale is implemented. |
| Writing | Checked | Connect/switch/quote/approve/swap vocabulary, expected spend/minimum, short recoverable errors, truthful attested/live/unverified states and no fabricated dollar prices. Checked labels against handlers. No unsupported agent promises. |
| Typography | Checked | Actual rendered serif/sans fallback stacks, descending heading levels, body/description measure, tabular amounts, address wrapping, mobile input sizes. Enlarged text reflows. Platform-font appearance across operating systems is not verified. |
| Colors | Checked | Semantic source tokens plus rendered text, input boundaries and focus ratios in `evidence/contrast.json`. All sampled active text pairs ≥4.5:1; input boundaries 3.44:1 and page control border 3.24:1. Only the implemented light theme was reviewed. Disabled opacity, unimplemented themes, every native-select/menu state and video imagery as content are excluded from contrast-compliance claims. |
| UI | Checked | Card nesting/radii, image outline, border vs shadow roles, primary-action hierarchy, direction selection, disabled/loading/pending/confirmed/error states and restrained .96 press feedback. Motion play/pause exercised. Custom overlays, entrance animations and theme transitions are not applicable. |

### Findings, corrections and rechecks

| Severity / domain | Source location | Observed problem and correction | Recheck |
| --- | --- | --- | --- |
| High / UI transaction state | `web/src/wallet.ts:87` | Receipt recheck could release an old waiter while a new action started. Added run-version ownership before unlocking; unknown receipt outcomes remain locked. | Mock sell flow covers receipt hold/recheck then both remaining steps; transaction counts and arguments pass. |
| Medium / UI transaction state | `web/src/Trade.tsx:77` | Preparing allowances left a short interval before the transaction hook's lock. Added synchronous action ref and local acting state, disabling the action and inputs from click through completion. | Pending-button lock and full approval sequence pass; signing rejection recovers. |
| Medium / Colors | `web/src/styles.css:6` | Reused structural border was measured at 2.24:1 against the input/card surface, below the 3:1 active-control threshold. Added a separate control-border role and kept decorative borders unchanged. | Final rendered input boundary 3.44:1; quiet button border 3.24:1; `contrast.json`. |
| Medium / Layout | `web/src/styles.css:43` | At 320px and 32px root text, hero/stat min-content sizing made the document 398px wide. Used zero-minimum grid tracks, bounded hero link, and long-string wrapping on headings/supply. | Final document scroll width 320px, no overflowing elements; `text-enlargement.json` and screenshot. No text is hidden. |
| Medium / UI responsiveness | `web/src/state.ts:26` | Source/observed RPC traffic repeated large bytecode requests on every refresh interval. Kept checks on connection/manual refresh/confirmation, cached ordinary checks for 60 seconds, and limited visible polling to one request cycle per 12 seconds with generation guards. | Wrong-chain/missing-code/manual refresh/fallback scenarios pass. Long-session production rate limiting is not verified. |

The early test harness also decoded a dynamic tuple as flat parameters; it was corrected to decode the actual single outer tuple. A sell assertion initially matched an older approval confirmation; status elements now have transaction-specific evidence selectors. These were test defects, not claimed contract failures. Final suites pass after the last CSS/source change.

### Browser evidence

Saved and inspected screenshots:

- `evidence/desktop-1440.webp`: full final page, normal desktop layout.
- `evidence/intermediate-820.webp`: final two-column intermediate layout.
- `evidence/mobile-320.webp`: final complete single-column page, wrapped addresses.
- `evidence/text-enlargement-320.webp`: final enlarged text; viewport remains 320px. Word wrapping can split the display heading at this extreme setting.
- `evidence/buy-quote.webp`: mock connected buy state with exact minimum and derived exchange rate.
- `evidence/sell-approval.webp`: mock connected sell state with only token approval actionable.

The actual MCP browser displayed the desktop/intermediate/mobile views, motion playback and visible keyboard focus. The mock quote/approval screenshots were captured by the interaction suite and then opened for visual inspection. Console report `evidence/browser-console.txt` contains zero errors/warnings. `evidence/browser-network.txt` records successful static/config/ABI/media loads from the subpath and public RPC responses. `mobile-layout.json`, `intermediate-layout.json`, `text-enlargement.json`, `reduced-motion.json` and `contrast.json` contain computed observations. Accessibility snapshots are not screen-reader sessions; narrowed viewports/text enlargement are not native zoom; emulated media are not physical-device tests.

## Delivery and remaining limits

Complete for the permitted frontend source/export/evidence scope, with two explicit delivery accommodations:

- The root `DESIGN.md` criterion conflicts with the stronger rule permitting writes only under `web/`, `dist/` and `docs/`. The actual design document is delivered at `docs/DESIGN.md`; no root document is created.
- The original `.git` filesystem is read-only; staging failed with `Unable to create .git/index.lock: Read-only file system`. The source/export/evidence are committed in an isolated scratch clone and delivered as `docs/frontend.bundle`, branch `frontend`. This incremental submission requires the supplied deployed-source base commit `17debaf1d107fcd9f184c03fa52fcc6447406b25`; older missing objects prevented a full-history bundle. The original workspace HEAD is unchanged. The bundle excludes itself; no submodule/dependency cache is included. Its exact commit and byte checks are emitted by the final local delivery audit, and the complete scoped bundle is below 8 MiB.

Live funded writes, persistent transaction restoration after page reload, wallet-provider variants, replacement/cancellation edge cases, ENS, physical devices, screen readers and native zoom remain untested or unimplemented as described above. No live domain was supplied, so absolute Open Graph image/canonical URLs are pending publication; title, description, favicon and relative hosting paths are implemented. The compressed main JavaScript chunk is a documented performance tradeoff, not a missing runtime asset. IPFS pinning/naming, GitHub publication and control-plane immutable/named asset/RPC checks belong to the subsequent publisher stage and are not claimed here.
