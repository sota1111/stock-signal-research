import type { Page } from '@playwright/test'

// シナリオ e2e 用の共通 API モック（SOT-1259 / SOT-1258）。
// バックエンドは起動せず、すべての `/api/**` をブラウザ層で横取りして決定的に応答する。
// smoke.spec.ts のモック方針を踏襲し、ダッシュボードは空オブジェクト、その他のリスト系は
// 空配列を返す。これによりナビ遷移シナリオが安定して通る。
const EMPTY_DASHBOARD = {
  trending_themes: [],
  top_keywords: [],
  notable_companies: [],
  supply_chain_highlights: [],
  alignment_highlights: { high_alignment: [], paper_only: [] },
}

// 配列ではなくオブジェクトを期待するエンドポイントだけ最小形を明示し、
// RouteErrorBoundary（「最新版の取得に失敗」）への落下を避ける。
const OBJECT_BODY_BY_SUFFIX: Record<string, unknown> = {
  '/dashboard/': EMPTY_DASHBOARD,
  // 投資候補ページ（/candidates）は data.summary.windows / data.companies を map するため、
  // 空配列ではなく SignalAlignmentResponse 形の空オブジェクトを返す。
  '/evaluation/signal-alignment': {
    baseline: '',
    summary: { baseline: '', windows: [] },
    companies: [],
  },
}

export async function mockApi(page: Page): Promise<void> {
  await page.route('**/api/**', async route => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname.endsWith('/auth/me')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }
    if (pathname.endsWith('/auth/session') || pathname.endsWith('/auth/logout')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
      return
    }
    for (const [suffix, body] of Object.entries(OBJECT_BODY_BY_SUFFIX)) {
      if (pathname.endsWith(suffix)) {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
        return
      }
    }
    // それ以外（リスト系）は空配列を返す。
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}
