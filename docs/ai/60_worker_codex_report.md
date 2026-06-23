# Worker Report

## Summary
Initial task check for SOT-1137「文字の色」(背景が黒→白文字 / 白→黒文字).
**Worker non-response: Codex CLI exited 75 (usage-limit cooldown, until epoch 1782609660).**
Per Worker Non-Response Fallback Policy, Claude Code performed this task check directly.

Verdict: **actionable, no decomposition needed** (single cohesive frontend contrast fix).

Root cause: the frontend has a half-finished design-token system. `frontend/src/index.css` defines
surface tokens (`--surface`, `--surface-muted`) that auto-swap light↔dark via
`@media (prefers-color-scheme: dark)` and `.theme-dark`, but there is **no `--foreground` (text)
token**. Text colors are hardcoded everywhere as `text-gray-*` / `text-slate-*` (dark grays), and
backgrounds are mostly hardcoded `bg-white`. Only `ChartCard.tsx` uses `bg-surface` (which becomes
near-black `#161b22` in dark mode) — so its dark hardcoded text renders dark-on-dark. The app shell
(`App.tsx`) is hardcoded `bg-slate-50 text-slate-800`. Net effect under a dark OS/browser:
inconsistent, low-contrast text (dark text on dark surface) — exactly the user's complaint.

## Changed Files
- none (task check only)

## Commands Run
- `grep -rhoE "(text|bg)-(white|black|gray|slate|...)-[0-9]+" src` → bg-white×87, text-gray-500×89,
  text-gray-700×85, text-gray-400×67, text-gray-600×55, text-gray-800×32, text-white×25, etc.
- `grep -rho "bg-surface" src` → only 2 occurrences (ChartCard.tsx)
- Read `frontend/src/index.css` (no `--foreground` token), `tailwind.config.*`, `App.tsx`

## Findings
- Repo uses CSS-var tokens for surfaces/brand but NOT for text → text contrast is not theme-aware.
- Key files: `frontend/src/index.css` (tokens), `frontend/tailwind.config.*` (token→class mapping),
  `frontend/src/App.tsx` (shell `bg-slate-50 text-slate-800`), `frontend/src/components/**`,
  `frontend/src/pages/**` (hardcoded `text-gray-*` / `bg-white`).
- Recommended minimal fix (mirrors sibling-repo playbook): add swapping text tokens
  `--foreground` / `--muted-foreground` / `--border` to `index.css` (light = near-black,
  dark = near-white), expose as tailwind `foreground` / `muted-foreground` / `border`, set a base
  `body { background: var(--surface-muted); color: var(--foreground); }`, then sweep hardcoded
  `bg-white`→`bg-surface`, `text-gray-700/800/900`→`text-foreground`,
  `text-gray-400/500/600`→`text-muted-foreground`, app shell to token classes. Keep brand/up/down
  semantic colors. Guarantees: black bg→white text, white bg→black text in both themes.

## Acceptance Criteria
- [x] Issue is actionable
- [x] Black background → white text; white background → black text scope identified (files/lines)

## Risks
- Broad sweep across many components; risk of visual regression. Mitigate by tokenizing rather than
  per-element edits, and verifying both light and forced-dark (`.theme-dark`) render.

## Next Action
READY_FOR_REVIEW
