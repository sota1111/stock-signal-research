# Worker Report

## Summary
SOT-1127「大カテゴリと時価総額上位10社が合わない」の FIX。

**Worker non-response / fallback disclosure (audit):**
- Non-responsive worker: Codex CLI（タスク確認・FIX とも）。
- Detected failure mode: `scripts/ai/run_codex.sh` が非応答コード `75` で即時終了（CODEX_COOLDOWN_ACTIVE: usage-limit cooldown, epoch 1782609660 まで）。
- Action: Worker Non-Response Fallback Policy に基づき Claude Code が初期タスク確認・実装・検証を直接実施した。Quality Gate は通常どおり適用。

## Root Cause
ダッシュボード（`frontend/src/pages/DashboardPage.tsx`）の「上位N社 時価総額」グラフは、選択中の大カテゴリ（`Theme.category`）で注目企業を絞り込んでから時価総額上位N社を取る。絞り込み関数 `filterCompaniesByCategory`（`frontend/src/pages/dashboardData.ts`）が `ids.some(id => categoryByThemeId.get(id) === category)`、すなわち「企業のタグ付けテーマの**いずれか**が該当大カテゴリに属する」企業をすべて含めていた。NVIDIA / Alphabet は AI Infrastructure / Quantum 等が主領域だが、medical imaging AI・ai drug discovery など Biotech 配下テーマにも付随的にタグ付けされているためフィルタを通過し、時価総額が巨大なため上位N社を占有していた。

## Fix
`filterCompaniesByCategory` を「dominant category 一致」に変更。新ヘルパー `dominantCategory(company, categoryByThemeId)` が、企業のタグ付けテーマを大カテゴリにマップして最頻の大カテゴリ1つを返す（同数タイは大カテゴリ名の昇順で決定的に解決、該当無しは null）。企業はその dominant category が選択中カテゴリと一致するときのみ含める。`category` 未選択時は従来どおり全件返却。

## Changed Files
- `frontend/src/pages/dashboardData.ts` — `dominantCategory` ヘルパー追加、`filterCompaniesByCategory` を dominant-category 判定に変更。

## Commands Run
- `cd frontend && npm run lint` → exit 0
- `cd frontend && npm run build`（tsc -b + vite）→ exit 0
- 実データ検証（backend/data/app.db, slug→category マップ）:
  - NVIDIA dominant = AI Infrastructure（Biotech タグは1のみ）→ Biotech から除外
  - Alphabet dominant = Quantum（Biotech タグ2）→ Biotech から除外
  - Biotech-dominant 企業は32社（Moderna / Pfizer / Vertex / CRISPR / Gilead / Novartis / AstraZeneca 等の実バイオ/製薬）→ グラフは空にならない

## Acceptance Criteria
- [x] Biotech 選択時に dominant が別領域の企業（NVIDIA/Alphabet 等）が除外される
- [x] 大カテゴリ未選択時は全企業を返す（挙動不変）
- [x] lint pass / build(tsc) pass

## Risks
- 各企業は1つの代表大カテゴリにのみ集計される。複数大カテゴリで横断的に意味を持つ企業は、dominant でない大カテゴリには出なくなる（要件「大カテゴリごとに企業を選定」に合致）。
- frontend には単体テストランナー（vitest）が未導入のため、検証は lint + tsc build + 実データシミュレーションで実施。

## Next Action
READY_FOR_REVIEW
