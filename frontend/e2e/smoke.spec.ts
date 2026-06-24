import { test, expect, type Page } from '@playwright/test'

// バックエンドは起動しない。すべての `/api/**` リクエストをブラウザ層で横取りし、
// 決定的なレスポンスを返す（SOT-1154）。authed=false で 401 を返すと、AuthProvider が
// 未認証と判定して /login へリダイレクトする。
const EMPTY_DASHBOARD = {
  trending_themes: [],
  top_keywords: [],
  notable_companies: [],
  supply_chain_highlights: [],
  alignment_highlights: { high_alignment: [], paper_only: [] },
}

async function mockApi(page: Page, opts: { authed: boolean }) {
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/auth/me')) {
      await route.fulfill({ status: opts.authed ? 200 : 401, contentType: 'application/json', body: '{}' })
      return
    }
    if (pathname.endsWith('/auth/session') || pathname.endsWith('/auth/logout')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }
    if (pathname.endsWith('/dashboard/')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_DASHBOARD) })
      return
    }
    // それ以外のリスト系エンドポイントは空配列を返す。
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

test('未認証で / にアクセスすると /login へリダイレクトしフォームが表示される', async ({ page }) => {
  await mockApi(page, { authed: false })
  await page.goto('/')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
})

test('/login がメール・パスワード入力と送信ボタンを表示する', async ({ page }) => {
  await mockApi(page, { authed: false })
  await page.goto('/login')
  await expect(page.locator('input[type="email"]')).toBeVisible()
  await expect(page.locator('input[type="password"]')).toBeVisible()
  await expect(page.locator('button[type="submit"]')).toBeVisible()
})

test('認証済みで / がナビゲーション（ブランド・ログアウト）を表示する', async ({ page }) => {
  await mockApi(page, { authed: true })
  await page.goto('/')
  // ナビはルートのエラー境界の外側にあるため、ルート内容の読込状態に関わらず表示される。
  // フッターにも同名テキストがあるため nav 内に限定し exact 一致で特定する。
  const nav = page.locator('nav')
  await expect(nav.getByText('Stock Signal Research', { exact: true })).toBeVisible()
  await expect(nav.getByRole('button', { name: 'ログアウト' })).toBeVisible()
  await expect(page).not.toHaveURL(/\/login/)
})

test('モバイル幅でハンバーガーがドロワーを開閉する', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await mockApi(page, { authed: true })
  await page.goto('/')
  const hamburger = page.locator('button[aria-controls="mobile-nav-drawer"]')
  await expect(hamburger).toBeVisible()
  const drawer = page.locator('#mobile-nav-drawer')
  // バックエンド未起動のためダッシュボード内容がエラー境界に落ち、一度だけキャッシュバスト
  // リロードが走ることがある。リロードで開閉状態が破棄されても成功するよう、クリック＋表示確認を
  // toPass でリトライする（ナビ自体はエラー境界の外側で常に存在する）。
  await expect(async () => {
    await hamburger.click()
    await expect(drawer).toBeVisible({ timeout: 1500 })
  }).toPass({ timeout: 20000 })
})

// SOT-1135 回帰テスト: ダッシュボード `/` 本体が描画できること（ルートのエラー境界に落ちて
// 「最新版の取得に失敗しました」を出さないこと）を検証する。
// 以前は recharts の Radar/Polar チャートが `es-toolkit/compat/maxBy` 等の CJS interop バグ
// （Vite/Rollup の commonjs 変換が `var require_identity = require_identity();` を生成し
// `require_identity is not a function` を投げる）で描画時に例外を投げ、`/` 全体が空白になっていた。
// Radar が実際に描画される（=バグ経路を通る）よう、選択テーマに論文数を持たせたデータでモックする。
test('認証済みで / のダッシュボード本体（Radarを含む）が描画される', async ({ page }) => {
  const theme = { id: 't1', name: 'AI Infrastructure Theme', category: 'AI Infrastructure', precursor_score: 90 }
  const byPath: Record<string, unknown> = {
    '/dashboard/': {
      trending_themes: [theme],
      top_keywords: [],
      notable_companies: [], // 空にして per-ticker(stock/fundamentals) 取得を発生させない
      supply_chain_highlights: [],
      alignment_highlights: { high_alignment: [], paper_only: [] },
    },
    '/themes/': [theme],
    // Radar の論文軸に値を与え、hasData=true で RadarChart を実際に描画させる。
    '/dashboard/category-paper-counts': {
      category: theme.category,
      years: [2024],
      series: [{ theme_id: 't1', theme_name: theme.name, total: 120, counts: [120] }],
    },
    '/dashboard/category-paper-averages': { years: [], categories: [], generated_at: null },
    '/dashboard/theme-citation-matrix': {
      years: [2024],
      rows: [{ theme_id: 't1', theme_name: theme.name, cells: [7], total: 7 }],
      column_totals: [7],
      grand_total: 7,
    },
    '/dashboard/signal-report': {
      query: theme.name,
      period: {},
      paper_counts_by_year: [{ year: 2024, count: 30 }],
      surging_keywords: [],
      top_companies: [],
      supply_chain_graph: { nodes: [], edges: [] },
      paper_total: 30,
      generated_at: null,
    },
  }

  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }
    for (const [suffix, body] of Object.entries(byPath)) {
      if (pathname.endsWith(suffix)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        return
      }
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto('/')
  const main = page.locator('main')
  // 本体（ダッシュボード見出し）が描画され、ルートのエラー境界に落ちていないこと。
  await expect(main).toContainText('ダッシュボード')
  await expect(main).not.toContainText('最新版の取得に失敗')
  // Radar を含むチャート（SVG）が実際に描画されていること。
  await expect(main.locator('svg').first()).toBeVisible()
})
