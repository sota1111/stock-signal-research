import type { Company, Theme, PatentYearlyCount, InstitutionalInvestor } from '../types'

export interface CompositeRow {
  rank: number
  company: Company
  /** 偏差値（平均50・標準偏差10）化した各成分。0〜100にクランプ済み。 */
  paper: number
  patent: number
  investor: number
  /** 各成分の偏差値（0〜100）を加重合成した複合スコア（偏差値スケール）。 */
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

/** 0（値なし）企業に割り当てる固定の偏差値。 */
const ZERO_DEVIATION = 20

/**
 * 各成分を偏差値（T-score）に変換する。
 *   偏差値 = 50 + 10 × (値 − 平均) ÷ 標準偏差
 * 平均なら 50、+1標準偏差で 60、−1標準偏差で 40。
 *
 * 平均・標準偏差は **非ゼロの値のみ**から算出する（0 の企業＝当該成分の実績なしを
 * 統計に含めると分布が歪み、少数の非ゼロ企業の偏差値が過大になるため）。
 * - raw 値が 0 の企業: 偏差値 20（固定, ZERO_DEVIATION）。
 * - 非ゼロの企業: 非ゼロ集合の母標準偏差を用いて偏差値を算出し、0〜100 にクランプ。
 *   非ゼロが 1 社のみ等で標準偏差が 0 の場合はゼロ除算を避け 50 を返す。
 * 非ゼロが 1 社も無い場合は全社 20 となる。
 */
function normalize(raw: Map<string, number>): Map<string, number> {
  const out = new Map<string, number>()
  if (raw.size === 0) return out
  const nonZero: number[] = []
  for (const v of raw.values()) if (v !== 0) nonZero.push(v)
  const n = nonZero.length
  let mean = 0
  let sd = 0
  if (n > 0) {
    let sum = 0
    for (const v of nonZero) sum += v
    mean = sum / n
    let variance = 0
    for (const v of nonZero) variance += (v - mean) ** 2
    variance /= n
    sd = Math.sqrt(variance)
  }
  for (const [k, v] of raw) {
    if (v === 0) {
      out.set(k, ZERO_DEVIATION)
      continue
    }
    const t = sd > 0 ? 50 + 10 * (v - mean) / sd : 50
    out.set(k, Math.min(100, Math.max(0, t)))
  }
  return out
}

/**
 * 論文・特許・投資家動向を統合した複合スコアで企業をランキングする。
 *
 * - 論文成分: 企業が紐づくテーマの precursor_score 平均（無ければ benefit_score を代用）
 * - 特許成分: 企業が紐づくテーマの特許件数合計
 * - 投資家成分: 当該企業の最新報告における機関投資家の保有比率合計
 *
 * 各成分を企業横断で偏差値（平均50・標準偏差10）化し、重み付き合成する。
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
