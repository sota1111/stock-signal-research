# Worker Report (Claude Code Fallback)

## Fallback Disclosure (audit)
Gemini worker was NON-RESPONSIVE — `scripts/ai/run_gemini.sh` exited 75 (CLI crash: `IneligibleTierError`
free-tier unsupported; GEMINI_DISABLED=1 also set). Per the Worker Non-Response Fallback Policy, Claude
Code performed this implementation directly. All quality gates apply unchanged.

## Summary
SOT-995 提案B「/login」5改善を実装:
- B-1 失敗理由の明確化: `AuthContext.login` を HTTP ステータス分類（401→INVALID_CREDENTIALS / 403→FORBIDDEN_EMAIL / 429→TOO_MANY_ATTEMPTS / 5xx→SERVER_ERROR / fetch例外→NETWORK_ERROR）し `AuthError(code)` を throw。`LoginPage` でコード→i18n文言にマップ。
- B-2 パスワード表示トグル＋バリデーション: show/hide トグル、メール形式・必須のクライアント検証＋フィールドエラー表示（`noValidate`）。
- B-3 ログイン保持＋元ページ復帰: `AuthProvider` に `loading` 状態を追加し、`PrivateRoute` は認証チェック中はリダイレクトせず `PageLoading` を表示、未認証確定時のみ `state.from` 付きで `/login` へ。`LoginPage` はログイン成功/既認証時に元ページ（`state.from` または `?redirect`）へ遷移。`api/index.ts` の401リダイレクトに現在パスを付与。
- B-4 言語トグル: 既存（`<LanguageToggle variant="light" />`）。動作確認のみ、変更なし。
- B-5 簡易ヒーロー: ツール説明（タグライン＋説明＋特徴3点）を左カラムに追加（md以上で表示）。文言は i18n ja/en。

## Changed Files
- `frontend/src/contexts/authContextValue.ts` — `AuthError`/`AuthErrorCode` 追加、`loading` を型に追加
- `frontend/src/contexts/AuthContext.tsx` — `loading` 状態、login のステータス分類
- `frontend/src/App.tsx` — `PrivateRoute` の loading 待ち + `state.from` 保持
- `frontend/src/pages/LoginPage.tsx` — エラーコードマップ / パスワードトグル / 検証 / ヒーロー / 元ページ復帰
- `frontend/src/api/index.ts` — 401 リダイレクトに現在パス付与
- `frontend/src/i18n/messages.ts` — login 関連キーを ja/en に追加

## Commands Run
（検証は Codex に委譲: lint / build）

## Acceptance Criteria
- [x] B-1 失敗理由の分類表示
- [x] B-2 パスワード表示トグル＋入力バリデーション
- [x] B-3 ログイン保持＋元ページ復帰
- [x] B-4 言語トグル（既存）
- [x] B-5 簡易ヒーロー

## Risks
- 認証コントラクト（Cookieベース）は不変。`api/index.ts` の `localStorage.auth_token` 系は既存挙動を維持。

## Next Action
NEEDS_DEBUG
