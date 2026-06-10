import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createTheme, createPaper, createCompany, fetchThemes } from '../api'

const TABS = ['テーマ登録', '論文登録', '企業登録'] as const
type Tab = typeof TABS[number]

function Alert({ message, type }: { message: string; type: 'success' | 'error' }) {
  return (
    <div className={`p-3 rounded text-sm ${type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
      {message}
    </div>
  )
}

export default function InputPage() {
  const [tab, setTab] = useState<Tab>('テーマ登録')
  const qc = useQueryClient()

  const [themeForm, setThemeForm] = useState({ name: '', category: 'AI Infrastructure', description: '' })
  const [paperForm, setPaperForm] = useState({ title: '', url: '', published_at: '', abstract: '', theme_id: '', source: 'manual' })
  const [companyForm, setCompanyForm] = useState({ name: '', ticker: '', description: '', benefit_score: 50, benefit_type: 'direct' })

  const themeMutation = useMutation({
    mutationFn: createTheme,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['themes'] }); setThemeForm({ name: '', category: 'AI Infrastructure', description: '' }) },
  })

  const paperMutation = useMutation({
    mutationFn: createPaper,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['papers'] }); setPaperForm({ title: '', url: '', published_at: '', abstract: '', theme_id: '', source: 'manual' }) },
  })

  const companyMutation = useMutation({
    mutationFn: createCompany,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['companies'] }); setCompanyForm({ name: '', ticker: '', description: '', benefit_score: 50, benefit_type: 'direct' }) },
  })

  const { data: themes } = useQuery({ queryKey: ['themes'], queryFn: fetchThemes })

  const inputClass = "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
  const labelClass = "block text-sm font-medium text-gray-700 mb-1"

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-800 mb-6">データ登録</h1>
      <div className="flex gap-2 mb-6 border-b">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'テーマ登録' && (
        <form onSubmit={e => { e.preventDefault(); themeMutation.mutate(themeForm) }} className="bg-white rounded-lg shadow p-6 space-y-4 max-w-lg">
          <div>
            <label className={labelClass}>テーマ名 *</label>
            <input required className={inputClass} value={themeForm.name} onChange={e => setThemeForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>カテゴリ *</label>
            <select className={inputClass} value={themeForm.category} onChange={e => setThemeForm(f => ({ ...f, category: e.target.value }))}>
              {['AI Infrastructure', 'Storage', 'Memory', 'Infrastructure', 'Robotics', 'Other'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>説明</label>
            <textarea className={inputClass} rows={3} value={themeForm.description} onChange={e => setThemeForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          {themeMutation.isSuccess && <Alert message="テーマを登録しました" type="success" />}
          {themeMutation.isError && <Alert message="登録に失敗しました" type="error" />}
          <button type="submit" disabled={themeMutation.isPending} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
            {themeMutation.isPending ? '登録中...' : '登録'}
          </button>
        </form>
      )}

      {tab === '論文登録' && (
        <form onSubmit={e => { e.preventDefault(); paperMutation.mutate({ ...paperForm, paper_id: `manual-${Date.now()}` }) }} className="bg-white rounded-lg shadow p-6 space-y-4 max-w-lg">
          <div>
            <label className={labelClass}>タイトル *</label>
            <input required className={inputClass} value={paperForm.title} onChange={e => setPaperForm(f => ({ ...f, title: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>URL</label>
            <input type="url" className={inputClass} value={paperForm.url} onChange={e => setPaperForm(f => ({ ...f, url: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>公開日</label>
            <input type="date" className={inputClass} value={paperForm.published_at} onChange={e => setPaperForm(f => ({ ...f, published_at: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>テーマ</label>
            <select className={inputClass} value={paperForm.theme_id} onChange={e => setPaperForm(f => ({ ...f, theme_id: e.target.value }))}>
              <option value="">選択なし</option>
              {themes?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>ソース</label>
            <select className={inputClass} value={paperForm.source} onChange={e => setPaperForm(f => ({ ...f, source: e.target.value }))}>
              {['manual', 'arxiv', 'semantic_scholar'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelClass}>要旨</label>
            <textarea className={inputClass} rows={4} value={paperForm.abstract} onChange={e => setPaperForm(f => ({ ...f, abstract: e.target.value }))} />
          </div>
          {paperMutation.isSuccess && <Alert message="論文を登録しました" type="success" />}
          {paperMutation.isError && <Alert message="登録に失敗しました" type="error" />}
          <button type="submit" disabled={paperMutation.isPending} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
            {paperMutation.isPending ? '登録中...' : '登録'}
          </button>
        </form>
      )}

      {tab === '企業登録' && (
        <form onSubmit={e => { e.preventDefault(); companyMutation.mutate({ ...companyForm, ticker: companyForm.ticker || undefined }) }} className="bg-white rounded-lg shadow p-6 space-y-4 max-w-lg">
          <div>
            <label className={labelClass}>企業名 *</label>
            <input required className={inputClass} value={companyForm.name} onChange={e => setCompanyForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>ティッカー</label>
            <input className={inputClass} value={companyForm.ticker} onChange={e => setCompanyForm(f => ({ ...f, ticker: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>説明</label>
            <textarea className={inputClass} rows={3} value={companyForm.description} onChange={e => setCompanyForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div>
            <label className={labelClass}>恩恵度スコア (0-100)</label>
            <input type="number" min={0} max={100} className={inputClass} value={companyForm.benefit_score} onChange={e => setCompanyForm(f => ({ ...f, benefit_score: Number(e.target.value) }))} />
          </div>
          <div>
            <label className={labelClass}>恩恵タイプ</label>
            <select className={inputClass} value={companyForm.benefit_type} onChange={e => setCompanyForm(f => ({ ...f, benefit_type: e.target.value }))}>
              <option value="direct">direct（直接恩恵）</option>
              <option value="indirect">indirect（間接恩恵）</option>
            </select>
          </div>
          {companyMutation.isSuccess && <Alert message="企業を登録しました" type="success" />}
          {companyMutation.isError && <Alert message="登録に失敗しました" type="error" />}
          <button type="submit" disabled={companyMutation.isPending} className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50">
            {companyMutation.isPending ? '登録中...' : '登録'}
          </button>
        </form>
      )}
    </div>
  )
}
