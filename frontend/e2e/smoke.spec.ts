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
