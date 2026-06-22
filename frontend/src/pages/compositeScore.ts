import type { Company, Theme, PatentYearlyCount, InstitutionalInvestor } from '../types'

export interface CompositeRow {
  rank: number
  company: Company
  /** 0-100 正規化後の各成分。 */
  paper: number
  patent: number
  investor: number
  /** 0-100 の複合スコア。 */
  composite: number
}

// 透明な既定の重み。論文(前兆)を最重視し、特許・投資家動向を補助とする。
export const COMPOSITE_WEIGHTS = { paper: 0.4, patent: 0.3, investor: 0.3 }

/**
 * `Company.theme_ids` は任意文字列。JSON配列 / カンマ / 空白区切りのいずれにも耐える
 * 防御的パースで theme id の配列に正規化する。
 */
export function parseThemeIds(raw?: string): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed)) return parsed.map(String).map(s => s.trim()).filter(Boolean)
    } catch {
      // フォールスルーして区切り文字でパース
    }
  }
  return trimmed
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean)
}

function normalize(raw: Map<string, number>): Map<string, number> {
  let max = 0
  for (const v of raw.values()) max = Math.max(max, v)
  const out = new Map<string, number>()
  for (const [k, v] of raw) out.set(k, max > 0 ? (v / max) * 100 : 0)
  return out
}

/**
 * 論文・特許・投資家動向を統合した複合スコアで企業をランキングする。
 *
 * - 論文成分: 企業が紐づくテーマの precursor_score 平均（無ければ benefit_score を代用）
 * - 特許成分: 企業が紐づくテーマの特許件数合計
 * - 投資家成分: 当該企業の最新報告における機関投資家の保有比率合計
 *
 * 各成分を企業横断で 0-100 に正規化し、重み付き合成する。
 */
export function buildCompositeRanking(
  companies: Company[],
  themes: Theme[],
  patentYearly: PatentYearlyCount[],
  investors: InstitutionalInvestor[],
): CompositeRow[] {
  const themeById = new Map(themes.map(t => [t.id, t]))

  // テーマ別 特許件数合計
  const patentByTheme = new Map<string, number>()
  for (const p of patentYearly) {
    patentByTheme.set(p.theme_id, (patentByTheme.get(p.theme_id) ?? 0) + p.count)
  }

  // 企業別 投資家保有（最新報告のみ・投資家×企業ペアで最新を採用）
  const companyKey = (inv: InstitutionalInvestor) => inv.company_name ?? inv.company_id
  const latestByPair = new Map<string, InstitutionalInvestor>()
  for (const inv of investors) {
    const key = `${inv.investor_name}__${companyKey(inv)}`
    const cur = latestByPair.get(key)
    if (!cur || inv.report_date > cur.report_date) latestByPair.set(key, inv)
  }
  const ownershipByCompany = new Map<string, number>()
  for (const inv of latestByPair.values()) {
    const name = companyKey(inv)
    ownershipByCompany.set(name, (ownershipByCompany.get(name) ?? 0) + inv.ownership_pct)
  }

  // 企業ごとの raw 成分
  const paperRaw = new Map<string, number>()
  const patentRaw = new Map<string, number>()
  const investorRaw = new Map<string, number>()
  for (const c of companies) {
    const themeIds = parseThemeIds(c.theme_ids)
    const precursors = themeIds
      .map(id => themeById.get(id)?.precursor_score)
      .filter((v): v is number => typeof v === 'number')
    const paper = precursors.length > 0
      ? precursors.reduce((a, b) => a + b, 0) / precursors.length
      : c.benefit_score
    paperRaw.set(c.id, paper)
    patentRaw.set(c.id, themeIds.reduce((sum, id) => sum + (patentByTheme.get(id) ?? 0), 0))
    investorRaw.set(c.id, ownershipByCompany.get(c.name) ?? 0)
  }

  const paperN = normalize(paperRaw)
  const patentN = normalize(patentRaw)
  const investorN = normalize(investorRaw)

  return companies
    .map(c => {
      const paper = paperN.get(c.id) ?? 0
      const patent = patentN.get(c.id) ?? 0
      const investor = investorN.get(c.id) ?? 0
      const composite =
        paper * COMPOSITE_WEIGHTS.paper +
        patent * COMPOSITE_WEIGHTS.patent +
        investor * COMPOSITE_WEIGHTS.investor
      return { company: c, paper, patent, investor, composite, rank: 0 }
    })
    .sort((a, b) => b.composite - a.composite)
    .map((row, i) => ({ ...row, rank: i + 1 }))
}
