# Worker Report

## Summary
SOT-1135「ダッシュボードを開けない」。表示文言「ページの読み込みに失敗しました／最新版の取得に失敗しました。
再読み込みしてください。」は `frontend/src/components/RouteErrorBoundary.tsx` のフォールバック UI
（i18n `error.routeTitle`/`error.routeBody`/`error.reload`）。ダッシュボード(`/`)は `React.lazy` で
動的 import されるため、根本原因は **lazy チャンクのロード失敗（stale/失敗チャンク）** と判断。
自動 reload が 1 回走っても復旧しないケースに対する復旧強化を実装した。

> 注: フォールバック実行の開示（監査用）。本 Issue のタスク確認（initial task check）担当の Codex CLI は
> usage-limit cooldown のため `scripts/ai/run_codex.sh` が非応答コード `75` で即時終了した
> （Worker Non-Response Fallback Policy の「worker unavailable」に該当）。リトライしても cooldown 継続
> （残り約112時間）で無意味なため、Claude Code がタスク確認・調査・修正・検証を直接実施した。
> 品質ゲート（build/typecheck/lint）は通常どおり適用。

## Root Cause（調査結果）
- ダッシュボードは `App.tsx` の `const DashboardPage = lazy(() => import('./pages/DashboardPage'))` /
  `<Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />`。`<Suspense><Routes>` は
  `RouteErrorBoundary` で包まれている。
- バックエンド/各エンドポイントの失敗ではルートはクラッシュしない（DashboardPage は全クエリ結果を
  `?? []` で既定化し、新規チャート G1–G7 も空データガードを持つ）。→ レンダリング時の決定的例外は考えにくい。
- build(`tsc -b && vite build`) / lint(`eslint .`) ともに green。helper（dashboardData.ts）も undefined ガード済み。
- 本症状は同アプリで再発中（SOT-1110 と同一文言）。SOT-1126（ダッシュボードの lazy チャンク群を大幅増加）
  のデプロイ直後に発生。文言はチャンクロード失敗向けのフォールバック。
- `RouteErrorBoundary.componentDidCatch` の自動復旧は `window.location.reload()`。これは heuristically/
  CDN キャッシュされた **古い index.html**（削除済みチャンクハッシュを参照）をそのまま再利用しうるため、
  1 回の reload では復旧せずフォールバック表示のまま固定される（=「再読み込みしても直らない」）。

## Changed Files
- `frontend/src/components/RouteErrorBoundary.tsx` — stale-chunk エラー時の自動復旧を
  cache-bust reload に変更。ワンショット query `?cb=<timestamp>` を付けて `location.replace` し、
  必ず最新の index.html を取得させる（別 URL = キャッシュキー回避）。起動時に `stripCacheBustParam()` で
  当該 query を URL から除去（履歴を汚さない）。リロード一回制限（sessionStorage `ssr_chunk_reload`,
  pathname 単位）は維持しループしない。非 stale エラーは従来どおりフォールバック表示のみ。

## Commands Run
- `npm run build`（frontend, `tsc -b && vite build`）→ exit 0
- `npm run lint`（frontend, `eslint .`）→ exit 0
- フロントエンドに unit test スクリプトなし / e2e 該当なし。

## Acceptance Criteria
- [x] Root cause identified（lazy チャンクのロード失敗 + 単純 reload がキャッシュ済み index.html を
  バイパスしない復旧ギャップ）
- [x] 自動復旧をキャッシュバスト reload に強化（最新 index.html を確実に取得）
- [ ] 本番でダッシュボードがフォールバックなしで開く（**要 redeploy** で有効化。SOT-1126/1134 の
  デプロイ反映も必要）

## Risks
- 本修正はデプロイ後に有効。既にフォールバックで固まっている端末は、初回のみ手動ハードリロードが必要な
  場合がある（以後は cache-bust 復旧が機能）。
- service worker/PWA は無し（影響なし）。
- 万一原因がチャンク以外の決定的レンダリング例外だった場合は本修正では復旧しない（その場合は別途
  例外箇所の特定が必要）が、静的調査では該当箇所を確認できなかった。

## Next Action
READY_FOR_REVIEW
