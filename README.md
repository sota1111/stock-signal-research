# Stock Signal Research

技術トレンドから株式投資の前兆を検知する情報収集・分析支援ツール。

論文・ニュース・企業情報・大口投資家動向を収集し、技術需要の前兆を検出して投資候補銘柄の発見を支援します。

> ⚠️ このツールは情報収集・分析支援を目的としています。投資判断はご自身の責任でお願いします。

---

## プロジェクト概要

- arXiv 等から論文情報を収集し、キーワード別に月次集計
- テーマ（AI、GPU、SSD/NVMe、HBM 等）ごとに前兆スコアを算出
- サプライチェーン連鎖（AI需要 → GPU → HBM → NVMe SSD → データセンター電力 → 光通信）を可視化
- 大口投資家の保有比率変化を記録（MVPはサンプルデータ）

---

## アーキテクチャ概要

```
frontend/          React 18 + TypeScript + Vite + Tailwind CSS + Recharts
backend/           Python 3.11 + FastAPI + SQLAlchemy + SQLite
docker-compose.yml フロント・バック同時起動
```

データフロー:
```
Browser → Vite Dev Server (localhost:5173)
        → proxy /api → FastAPI (localhost:8000)
                     → SQLite (backend/data/app.db)
```

---

## 起動方法

### Docker Compose（推奨）

```bash
git clone https://github.com/sota1111/stock-signal-research.git
cd stock-signal-research
docker compose up --build
```

- フロントエンド: http://localhost:5173
- バックエンド API: http://localhost:8000
- API ドキュメント: http://localhost:8000/docs

### ローカル起動

**バックエンド:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**フロントエンド（別ターミナル）:**
```bash
cd frontend
npm install
npm run dev
```

起動後、http://localhost:5173 をブラウザで開く。

---

## 画面説明

| 画面 | URL | 説明 |
|------|-----|------|
| ダッシュボード | `/` | 急増テーマ・急増キーワード・注目企業・サプライチェーン連鎖を表示 |
| 一覧 | `/list` | テーマ・論文・企業・大口投資家を一覧表示（タブ切り替え） |
| テーマ詳細 | `/themes/:id` | 月次論文数推移グラフ・サプライチェーン・関連論文を表示 |
| データ登録 | `/input` | テーマ・論文・企業を登録するフォーム |

---

## 主要機能の動作確認方法

1. **ダッシュボードの確認**
   - http://localhost:5173 を開く
   - 「急増テーマ TOP5」に `GPU memory bottleneck`, `SSD / NVMe`, `HBM` 等が表示されることを確認
   - 「急増キーワード ランキング」に前月比の増加率が表示されることを確認

2. **論文トレンドの確認**
   - 一覧画面 → テーマタブ → `GPU memory bottleneck` の「詳細」をクリック
   - 「月次論文数推移」グラフが表示されることを確認（2024年1月〜12月の推移）

3. **サプライチェーンの確認**
   - ダッシュボードの「サプライチェーン連鎖」セクションを確認
   - サプライチェーンの連鎖が表示されることを確認

4. **データ登録の確認**
   - 登録画面 → テーマ登録フォームで新しいテーマを入力・送信
   - 一覧画面に新テーマが追加されることを確認

---

## サンプルデータの内容

起動時に自動投入されるサンプルデータ:

**テーマ（7件）:**
- SSD / NVMe（Storage）
- GPU memory bottleneck（AI Infrastructure）
- HBM（Memory）
- KV cache offloading（AI Infrastructure）
- I/O bottleneck（AI Infrastructure）
- data center power（Infrastructure）
- robotics foundation model（Robotics）

**企業（10件）:**
NVIDIA, AMD, TSMC, Micron, Samsung, SK hynix, Kioxia, SanDisk, Tokyo Electron, Fujikura

**月次論文数（各テーマ 2024-01〜2024-12）:**
増加傾向を示すサンプルデータ（前兆検知の動作確認用）

**サプライチェーン構造:**
```
AI需要 → GPU memory bottleneck → HBM → SSD / NVMe → data center power → robotics foundation model
```

---

## データ構造

主要テーブル:

| テーブル | 説明 |
|---------|------|
| themes | テーマ（前兆スコア・トレンドフラグ付き） |
| papers | 論文（arXiv ID・要旨・キーワード） |
| paper_monthly_counts | 月次論文数集計（前月比・前年比） |
| companies | 企業（恩恵度スコア・直接/間接分類） |
| supply_chains | サプライチェーン関係 |
| institutional_investors | 大口投資家（サンプルデータ） |

詳細は `backend/app/models.py` および `backend/app/schemas.py` を参照。

---

## 外部データ取得の有効化

MVPはサンプルデータのみで動作します。将来的に以下の外部APIと連携可能な設計です:

- **arXiv API**: `http://export.arxiv.org/api/query`（無料・APIキー不要）
- **Semantic Scholar API**: `https://api.semanticscholar.org/graph/v1`（無料・レート制限あり）
- **EDINET / SEC 13F**: 大口投資家データ取得（実装予定）

有効化方法: `backend/app/services/fetcher.py` を参照し、必要な設定を `.env` ファイルに追加してください。

---

## 制約事項

- MVPのため、論文データは自動収集せず手動登録またはサンプルデータのみ
- 大口投資家データはサンプルデータのみ（EDINET/SEC連携は未実装）
- 投資判断の直接推奨は行わない設計（前兆候補・関連候補として表示）
- SQLiteはローカル専用。本番運用にはPostgreSQL等への移行を推奨

---

## 今後の追加予定機能

- arXiv / Semantic Scholar からの自動論文収集
- テーマ別ニュース収集・トレンド一致度計算
- EDINET / SEC 13F からの大口投資家データ自動取得
- メール・Slack 通知（急増テーマ検知時）
- テーマ別ヒートマップ可視化
- ウォッチリスト機能
- 定期バッチ実行（cron）

---

## 投資判断に関する注意事項

このツールは**情報収集・分析支援ツール**です。

- 表示される「前兆スコア」「恩恵度スコア」は参考指標であり、投資収益を保証するものではありません
- 投資判断はご自身の責任で行ってください
- 過去のトレンドが将来の株価動向を保証するものではありません
- 外部APIから取得したデータの正確性は保証されません
