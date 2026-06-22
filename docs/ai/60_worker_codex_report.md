# Worker Report

## Summary
`frontend/src/App.tsx` の lazy route tree を `RouteErrorBoundary` で包み、ページ遷移時の lazy chunk ロード失敗や遷移先ページの描画例外が root route tree を空白化しないようにしました。

Chunk stale 系エラー（`ChunkLoadError` / dynamic import failure / `Loading chunk` など）は、`sessionStorage` の `ssr_chunk_reload` に pathname 単位で記録し、同一パスでは一度だけ自動 reload します。再失敗または通常の描画例外では、既存 `PageError` と同系統の中央寄せ fallback UI と「再読み込み」ボタンを表示するため、ブラックアウトを回避できます。

## Changed Files
- `frontend/src/components/RouteErrorBoundary.tsx` — route 用 Error Boundary を新規追加。stale chunk 判定、一度だけの自動 reload、i18n 対応 fallback UI を実装。
- `frontend/src/App.tsx` — `RouteErrorBoundary` を import し、`key={location.pathname}` で `<Suspense><Routes /></Suspense>` をラップ。既存 nav/layout/route 定義は維持。
- `frontend/src/i18n/messages.ts` — ja/en に `error.routeTitle`、`error.routeBody`、`error.reload` を追加。

## Commands Run
- `cd frontend && npm run lint` — exit 0。
- `cd frontend && npm run build` — exit 0。`tsc -b && vite build` 成功。
- `git diff --stat main...HEAD` — 空出力。未コミットの作業ツリー変更はこの形式には出ない状態。
- `git status --short` — app 実装差分は `frontend/src/App.tsx`、`frontend/src/i18n/messages.ts`、`frontend/src/components/RouteErrorBoundary.tsx` の3ファイル。加えて、このレポート `docs/ai/60_worker_codex_report.md` を更新。
- `git diff --stat` — tracked 差分は `docs/ai/60_worker_codex_report.md`、`frontend/src/App.tsx`、`frontend/src/i18n/messages.ts`。新規 `RouteErrorBoundary.tsx` は untracked として確認。
- `git diff --name-only -- frontend/dist` — 空出力。build による tracked `frontend/dist` 差分なし。

## Acceptance Criteria
- [x] ルートに Error Boundary 追加、chunk失敗で一度だけ自動リロード（ループ防止）
- [x] それ以外/再失敗時は回復UI（再読み込みボタン）でブラックアウト回避
- [x] lint pass / build pass
- [x] 変更3ファイル限定・デスクトップ不変

## Risks
- `ssr_chunk_reload` は pathname 単位でセッション中保持します。Suspense fallback の正常描画だけで早期クリアすると再 reload ループの余地があるため、ループ防止を優先しました。
- 実機スマホでの手動確認は未実施です。lint/build とコード上の回復経路は確認済みです。

## Next Action
READY_FOR_REVIEW
