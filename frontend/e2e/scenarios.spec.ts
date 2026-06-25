import { test, expect } from '@playwright/test'
import { mockApi } from './support/mockApi'

// ユーザー操作→画面遷移/表示のシナリオテスト（SOT-1259 / 親 SOT-1258）。
// 1シナリオ = 1ユーザーストーリー。認証済みでダッシュボード `/` を起点に、
// ヘッダーナビの各リンクをクリックして分析ページへ遷移し、URL と h1 見出しの可視を検証する。
// すべての `/api/**` は support/mockApi.ts で決定的にモックする。
//
// ナビ項目（日本語デフォルト）とリンク→URL→h1 の対応:
//   テーマ・論文・特許 → /research          → h1「テーマ・論文・特許」（旧 papers/patents 統合 SOT-1145）
//   個別株             → /individual-stock  → h1「個別株」
//   投資家             → /investors         → h1「投資家」
//   投資候補           → /candidates        → h1「投資候補」
//   株価               → /stock             → h1「株価」

type Scenario = {
  story: string
  navText: string
  urlPattern: RegExp
  heading: string
}

const SCENARIOS: Scenario[] = [
  {
    story: 'ダッシュボードから「テーマ・論文・特許」へ遷移できる',
    navText: 'テーマ・論文・特許',
    urlPattern: /\/research/,
    heading: 'テーマ・論文・特許',
  },
  {
    story: 'ダッシュボードから「個別株」へ遷移できる',
    navText: '個別株',
    urlPattern: /\/individual-stock/,
    heading: '個別株',
  },
  {
    story: 'ダッシュボードから「投資家」へ遷移できる',
    navText: '投資家',
    urlPattern: /\/investors/,
    heading: '投資家',
  },
  {
    story: 'ダッシュボードから「投資候補」へ遷移できる',
    navText: '投資候補',
    urlPattern: /\/candidates/,
    heading: '投資候補',
  },
  {
    story: 'ダッシュボードから「株価」へ遷移できる',
    navText: '株価',
    urlPattern: /\/stock/,
    heading: '株価',
  },
]

for (const sc of SCENARIOS) {
  test(sc.story, async ({ page }) => {
    await mockApi(page)
    await page.goto('/')

    // ナビはルートのエラー境界の外側にあり、認証済みなら常に表示される。
    // フッター等の同名テキストとの曖昧さを避けるため nav スコープに限定してクリックする。
    const nav = page.locator('nav')
    await nav.getByRole('link', { name: sc.navText, exact: true }).click()

    await expect(page).toHaveURL(sc.urlPattern)
    const main = page.locator('main')
    // 見出しの可視を先に待つ（自動リトライ）。これが通れば RouteErrorBoundary には落ちていない。
    await expect(main.getByRole('heading', { name: sc.heading, level: 1 })).toBeVisible()
    await expect(main).not.toContainText('最新版の取得に失敗')
  })
}
