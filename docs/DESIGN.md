# Pachu implemented design

This records the final source, not a proposed visual direction. It is located in `docs/` because the assignment's root `DESIGN.md` requirement conflicts with its stronger path budget. Source of truth: `web/src/styles.css`, `App.tsx`, `components.tsx`, `Trade.tsx`, and `TokenTools.tsx`. Evidence and coverage limits are in `VALIDATION.md`.

## Overview

Pachu uses a quiet editorial page: warm paper surfaces, forest text, generous spacing, serif display type and the supplied illustrated motion identity. The character's orange/green artwork supplies visual variety; action and status text remain calm. Identity comes before launch details and trading. There is one page with anchor navigation, not a dashboard or separate routes. No decorative entrance animation, custom modal, theme switch, external font or image service is required.

## Colors

Primitives and semantic aliases are declared at `web/src/styles.css:1`.

| Role | Semantic token | Value / source primitive |
| --- | --- | --- |
| Page | `--color-page` | `--cream-100`, `#f4f1e9` |
| Cards and fields | `--color-surface` | `--cream-50`, `#faf8f3` |
| Selected/inset surfaces | `--color-inset` | `--cream-200`, `#e9e5da` |
| Text | `--color-text` | `--forest-900`, `#273b32` |
| Secondary text | `--color-secondary` | `--neutral-600`, `#64685e` |
| Decorative structure | `--color-border` | `--cream-400`, `#a6aa9c` |
| Control boundaries | `--color-control-border` | `--neutral-500`, `#828879` |
| Primary fill | `--color-accent` | `--forest-900`, `#273b32` |
| Primary hover and focus | `--color-accent-hover`, `--color-focus` | `--forest-700`, `#3e5445` |
| Primary text | `--color-on-accent` | `--cream-50`, `#faf8f3` |
| Error text | `--color-error` | `--brick-700`, `#943e2f` |

Measured rendered WCAG 2 ratios: body 10.58:1; secondary copy 5.05:1 on the page / 5.37:1 on a card; primary action 11.26:1; error text 6.22:1 on the page; control borders 3.44:1 on cards / 3.24:1 on the page. The focus ring measures 6.52–7.73:1 against the inspected adjacent surfaces. See `evidence/contrast.json`. Decorative borders intentionally remain lighter. Disabled controls use opacity .58 and are excluded from active-control contrast claims. This is one light theme; dark and localized variants are not implemented.

## Typography

`--font-display` requests Georgia, then Times New Roman, then a generic serif. `--font-body` requests Arial, then Helvetica, then sans-serif. Address/code text uses Courier New/monospace. These are platform fonts; the worker's rendering demonstrates the fallback stack, not that every device supplies Georgia or Arial.

| Role | Implemented size | Weight / line height |
| --- | --- | --- |
| Body | `--text-body: 1rem` | 400 / 1.55 |
| Small copy | `--text-small: .8125rem` | 400 / 1.55 |
| Hero description | `--text-lead: 1.125rem` | 400 / 1.65 |
| Hero heading | `clamp(3rem, 5.35vw, 4.8rem)`; 2.85rem at ≤420px | 400 / 1.1, italic second line |
| Section heading | `clamp(2rem, 3.1vw, 2.75rem)` | 400 / 1.1 |
| Trade heading | 1.65rem | 400 / 1.1 |
| Tool heading | 1.75rem | 400 / 1.1 |
| Subheading | 1rem | 600 / inherited 1.55 |
| Labels/actions | .875rem, smaller wallet label at ≤420px | 400 or 600 / inherited |
| Inputs | 1rem; amount input 2.1rem | 400 / inherited |

Headings use -.035em letter spacing and balanced wrapping. Eyebrows are uppercase through CSS with .06em tracking. Hero description is limited to 39ch (48ch on the single-column layout); launch prose uses 42ch. Paragraphs use pretty wrapping. Headings, supply and addresses can break long strings rather than force overflow at text enlargement. Dynamic amounts use tabular numbers; exact balance units remain available in titles, review copy or quotes. There is no global selection suppression. Normal body text starts at 16px, all form inputs are at least 16px at the normal root size, and address text stays selectable.

## Layout and responsiveness

`.page-shell` caps the page at 1280px with 48px inline padding. The header groups the wordmark, navigation and wallet control. The hero is a two-column `minmax(0, …)` grid with a 64px gap; stats use three columns with a 32px gap. The market section pairs launch/wallet context with a trade card, separated by 96px. Main vertical steps are 24/28/32px within groups and 44/48/72/80px between sections. Full-width controls remain inset within cards.

- At ≤1000px: inline page margins become 32px; hero gap 36px; market gap 48px; header/nav spacing tightens.
- At ≤760px: header wraps and navigation becomes a full-width third row; hero, stats, market and contract details become one column. Trade/media max-width is 560px. Definition-list keys stack above values, and footer links wrap.
- At ≤420px: page margins become 20px; wordmark and wallet label shrink; card padding becomes 20px; the identity card uses 12px padding and an 18px radius. Identity labels can wrap.

Desktop 1440px, intermediate 820px and mobile 320px were inspected as rendered output. At 320px the stats become a vertical list and full addresses wrap. Text enlargement was tested separately by changing the root to 32px; this is not browser-native zoom. Content order remains the DOM reading order. Anchors, disclosure summaries and controls stay in normal flow; there is no fixed bar obscuring content.

## Surfaces, depth and shapes

The page is mostly flat, with one-pixel structural dividers. The identity and trade cards use a small ambient shadow, e.g. `0 2px 2px #00000005, 0 14px 48px #00000009` for the identity. Their normal outer radius is 24px. Identity padding 18px and media radius 6px are concentric; at the narrow breakpoint padding/radius are 12px/18px. Buttons and inset trade fields use 12px radii, slippage uses 8px, tool fields 10px, tool review 14px, and the tools disclosure 18px. Pills are fully rounded. Images use a one-pixel black outline at 10% opacity, inset so it does not change layout. No backdrop blur or decorative gradient is implemented.

## Components and patterns

| Component / source | Purpose and implemented states |
| --- | --- |
| `MotionIdentity` in `App.tsx` | Local poster/video figure, descriptive media label, play/pause button and error copy. No autoplay. Changing reduced-motion preference pauses the clip. |
| `External` in `components.tsx` | External links with an arrow, safe new-tab attributes and a screen-reader new-tab suffix. |
| `AddressView` in `components.tsx` | Full checksum address, explorer destination, 44px copy target and persistent copy/recovery feedback. No fabricated ENS name. |
| `WalletButton` in `components.tsx` | Connect/switch action with its own waiting state; no inaccessible custom chooser. |
| `TransactionStatus` in `components.tsx` | Persistent simulation/signing/pending/confirmed/error text, explorer link and receipt recheck. Status uses text and live regions rather than color alone. |
| `Trade` in `Trade.tsx` | Native button direction selector with `aria-pressed`, labeled amount/slippage fields, balance, estimated output, exact minimum, derived rate and one primary action for the current step. Errors stay beside the form; action/input locks cover allowance checking through confirmation. |
| `TokenTools` in `TokenTools.tsx` | Native disclosure and select expose all token writes; full address and amount inputs; state review before signing; nonzero allowance replacement requires revocation. Invalid addresses focus the address field. |
| `.button`, `.quiet`, `.primary`, `.full` in `styles.css` | 48px ordinary actions; border/hover variants; native disabled states; 3px focus ring at 4px offset. Primary emphasis belongs to the trade step. |
| `.pool-details` in `App.tsx` / CSS | Native disclosure containing the full key, pool ID, source commit, live fee, guard, configured protocols and runtime manifest link. No fictitious pool contract address. |

Keyboard paths use native buttons, links, select, inputs and details. A skip link leads to `main`. Focus uses a project token; forced-colors mode uses `Highlight`. Optional press scaling is .96, with 150ms named-property transitions only under `prefers-reduced-motion: no-preference`. No animation library or `will-change` hint is used. Native-device, screen-reader and browser-native zoom behavior have not been verified.

## Reuse rules

Start new sections inside `.page-shell`, with semantic headings and spacing between groups. Reuse `.button` and choose the current trade action for primary emphasis. Use the control-border token for interactive boundaries and the structural-border token for dividers. Keep full addresses reachable through `AddressView` and keep copied/transaction/error feedback persistent. Read deployed values from the runtime manifest and contracts; do not introduce another address map or hardcoded exchange rate. Put any new page behind a hash anchor unless its static HTML is explicitly exported. Rebuild the manifest after every export change.
