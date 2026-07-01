# Stock Signal Research

技術トレンドから株式投資の前兆を検知する情報収集・分析支援ツール。

論文・ニュース・企業情報・大口投資家動向を収集し、技術需要の前兆を検出して投資候補銘柄の発見を支援します。

> ⚠️ このツールは情報収集・分析支援を目的としています。投資判断はご自身の責任でお願いします。

---

## プロジェクト概要

- arXiv 等から論文情報を収集し、キーワード別に月次集計
- テーマ（AI、GPU、SSD/NVMe、HBM 等）ごとに前兆スコアを算出
- サプライチェーン連鎖（AI需要 → GPU → HBM → NVMe SSD → データセンター電力 → 光通信）を可視化
- 特許（USPTO）の年次出願件数・トップ出願人を集計・可視化
- 大口投資家（13F）の保有動向を記録・可視化（SEC EDGAR 由来の実データを seed）
- 株価・時価総額の推移（同梱データ）と論文トレンドのクロス分析・大カテゴリ別ビュー
- 論文トレンドと株価の lead-lag 相関・複合スコアで投資候補をランキング（`/candidates`）
- UI は日本語/英語のトグル切り替えに対応

---

## 認証情報なし開発クイックスタート

**GCP・APIキーなしで即座にローカル動作確認が可能です。**

サンプルデータモード（`USE_SAMPLE_DATA=true`）を使用するため、外部サービスへの接続は不要です。

```bash
# 1. リポジトリのクローン
git clone https://github.com/sota1111/stock-signal-research.git
cd stock-signal-research

# 2. 環境変数設定（デフォルトでサンプルデータモード有効）
cp .env.example .env

# 3. 起動
docker compose up --build
```

## 認証設定

このアプリは **サーバサイド Firebase REST 認証（案1）** を使用します。ブラウザは Firebase と
直接通信せず、サーバが Identity Toolkit REST (`accounts:signInWithPassword`) でメール/パスワードを
照合し、既存の HMAC 署名 Cookie を発行します。`.env` に以下の変数を設定してください。

| 変数名 | 説明 | 例 |
|--------|------|-----|
| FIREBASE_WEB_API_KEY | Firebase Web API Key（サーバ側のみ。ブラウザには露出しない） | AIza... |
| ALLOWED_USER_EMAILS | 許可するメール（カンマ区切り） | user@example.com |
| AUTH_SECRET | セッション署名用シークレット | random-string |

### 動作確認方法

1. `cp .env.example .env` で環境変数ファイルを作成
2. Firebase Console で Email/Password 認証を有効にし、ユーザーを作成
3. `docker compose up --build` で起動
4. http://localhost:5173 にアクセス → ログイン画面にリダイレクトされる
5. Firebase で作成したメールアドレスとパスワードでログイン（照合はサーバ経由）
6. ログアウトはナビバー右上の「ログアウト」ボタンから

---

## 認証情報が不要な理由:
- `USE_SAMPLE_DATA=true` のとき、すべてのデータ収集はサンプルデータで代替されます
- Firestore・GCP・外部APIへの接続は行われません
- `SEMANTIC_SCHOLAR_API_KEY`, `NEWS_API_KEY`, `LLM_API_KEY` は未設定でOKです

---

## アーキテクチャ概要

```
frontend/          React 18 + TypeScript + Vite + Tailwind CSS + Recharts
                   （@tanstack/react-query, axios, react-router-dom v7, i18n ja/en）
backend/           Python 3.11 + FastAPI + SQLAlchemy
                   永続化: SQLite（APP_ENV=local のみ） / Firestore（APP_ENV=production）
docker-compose.yml フロント・バック同時起動
```

データフロー:
```
Browser → Vite Dev Server (localhost:5173)
        → proxy /api → FastAPI (localhost:8080)
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
- バックエンド API: http://localhost:8080
- API ドキュメント: http://localhost:8080/docs

### ローカル起動

**バックエンド:**
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
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
| ログイン | `/login` | サーバサイド Firebase REST 認証によるログイン |
| ダッシュボード | `/` | 急増テーマ・急増キーワード・注目企業・サプライチェーン連鎖・株価/論文クロス分析・大カテゴリ別ビューを表示 |
| 前兆検知 | `/signals` | 急増テーマ TOP5・外部情報との一致度（前兆候補）を表示 |
| サプライチェーン | `/supply-chain` | サプライチェーン連鎖（前兆→波及）の関係を表示 |
| リサーチ | `/research` | テーマ・論文・特許を 1 つに統合したタブ画面（`?tab=themes\|papers\|patents`、SOT-1145） |
| 株価 | `/stock` | 銘柄別の株価・時価総額・テクニカルシグナルのバックテストを表示 |
| 個別銘柄 | `/individual-stock` | 個別銘柄の詳細を表示 |
| 投資家 | `/investors` | 大口投資家（13F）の保有動向を表示 |
| 投資候補 | `/candidates` | lead-lag 相関・複合スコアによる投資候補ランキングを表示（前兆スコア vs 実株価変動の一致度を統合、SOT-1147） |
| 一覧 | `/list` | テーマ・論文・企業・大口投資家を一覧表示（タブ切り替え） |
| テーマ詳細 | `/themes/:id` | 月次論文数推移グラフ・サプライチェーン・関連論文を表示 |

> ログイン以外の画面は認証必須（`PrivateRoute`）です。
>
> **旧 URL（後方互換リダイレクト）**: `/papers` → `/research?tab=papers`、`/patents` → `/research?tab=patents`、`/evaluation` → `/candidates`、`/status` / `/input` / `/research-seeds` → `/`（SOT-1145 / 1147 / 1148 の統合により独立画面は廃止）。

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
| patents | 特許（USPTO） |
| patent_yearly_counts | 特許の年次出願件数集計 |
| companies | 企業（恩恵度スコア・直接/間接分類） |
| supply_chains | サプライチェーン関係 |
| institutional_investors | 大口投資家（13F 由来の実データを seed） |
| external_infos | 外部情報リンク |
| alignment_scores | 前兆スコアと株価変動の一致度スコア |
| stock_prices | 株価履歴（キャッシュ） |
| research_seeds | 初期リサーチ（seed）テーマ |

詳細は `backend/app/models.py` および `backend/app/schemas.py` を参照。

---

## 収集データ一覧（ローカル収集アーティファクト）

ローカルで収集して `backend/data/` 配下にコミット済みのデータ群です。起動時に `backend/app/seed.py` が
これらの JSON を読み込み DB（local: SQLite / production: Firestore）へ投入、または実行時にサービス層が
直接読み込みます。各収集スクリプトは `backend/scripts/` にあります。

| データ | 収集元（ソース） | 件数・年範囲 | 保存先ファイル | 収集スクリプト |
|--------|------------------|--------------|----------------|----------------|
| 論文 (Papers) | arXiv（被引用数は Semantic Scholar で付与） | 9,560 件 / 100 テーマ / 2000–2026 | `backend/data/collected-papers.json` | `collect_dashboard_papers.py` |
| 特許 (Patents) | USPTO Patent Public Search (PPUBS) | 2,292 件 / 29 テーマ＋年次集計 30 テーマ / 2000–2026 | `backend/data/collected-patents.json` | `collect_dashboard_patents.py` |
| 大口投資家 / 13F | SEC EDGAR Form 13F-HR | 主要機関投資家 30 社（Vanguard, BlackRock, State Street, Geode, FMR, JPMorgan, Goldman Sachs, Morgan Stanley, Bank of America, Wellington ほか）× 半導体関連銘柄 / 過去約10年・年次 | `backend/data/collected-investors.json` | `collect_investor_data.py` |
| 株価 (Stock Prices) | yfinance（オフライン収集 → 実行時読込） | 242 ティッカー（231 が価格系列、11 は価格なし） / 2000-01-03〜2026-06-19 | `backend/data/stock-prices.json` | `collect_stock_data.py`（個別: `fetch_stock_data.py`） |
| 時価総額履歴 (Market Cap History) | SEC EDGAR XBRL 発行済株式数 × 年末終値 | 米国上場 237 ティッカー中 199 をカバー / 2009 年以降 | `backend/data/market-cap-history.json` | `collect_market_cap_history.py` |
| テーマ/企業ユニバース (SOT-994) | ローカル定義（30→100 テーマ拡張） | 追加 70 テーマ / 10 カテゴリ、ユニーク企業 228（221 がティッカー付き） | `backend/data/sot994_universe.json` | `seed.py`・上記収集スクリプトが参照 |
| 初期リサーチ seed | 手動キュレーション（初期仮説） | 11 件（NVDA/AMD/TSM/TSLA/8035.T 等） | `backend/data/initial-research-seeds.json` | `seed.py` が `research_seeds` へ投入 |

補足:

- **論文** は `papers` テーブルへ投入されます。
- **特許** は `patents` と `patent_yearly_counts` へ投入されます。特許カバレッジは 30 ベーステーマで、100 テーマ全部ではありません。
- **株価** はダッシュボードの株価 API が `stock-prices.json` を直接読み込みます（実行時リーダー `backend/app/services/market_data.py`）。なお SQLite の `stock_prices` テーブルに seed されるのは合成ランダムウォークデータで、この収集アーティファクトとは別物です。
- **時価総額履歴** は米国上場のみで、XBRL 提供開始の制約により 2009 年以降をカバーします（非米国ティッカーは未カバー。実行時リーダー `backend/app/services/market_cap_history.py`）。
- **月次論文数**（3 テーマ・直近 120 ヶ月）と**サプライチェーン 6 エッジ**は `seed.py` がコード内で生成する合成/手動 seed であり、上記のローカル収集 JSON とは別物です。

---

## 投資前兆ダッシュボード用 統一シグナルレポート JSON

ダッシュボードで利用する統一シグナルレポート JSON を、既存 DB（local: SQLite / production: Firestore）の
論文・企業辞書からオフラインで集計して生成できます。**外部 API キーは不要**です。

レポートには次が含まれます:

- `paper_counts_by_year`: 年別の論文件数（既定で直近 10 年）
- `surging_keywords`: 直近年で急増したキーワード（`growth_rate`・関連論文 ID 付き）
- `top_companies`: 注目企業 TOP5（`score`・`evidence`＝根拠論文 ID 付き。根拠のない企業は出力しない）
- `supply_chain_graph`: サプライチェーン連鎖（`node` / `edge` 形式、evidence 付き）

### A. CLI で JSON ファイルを生成する

```bash
cd /workspaces/stock-signal-research/backend

# 標準出力に出力（最小）
APP_ENV=local python scripts/generate_signal_report.py --query "solid state battery"

# 期間と出力先を指定してファイル生成
APP_ENV=local python scripts/generate_signal_report.py \
  --query "AI infrastructure" --from-year 2016 --to-year 2025 \
  --out data/signal_report.json
```

主な引数:

| 引数 | 説明 | 既定値 |
|------|------|--------|
| `--query` | 集計対象テーマ/キーワード（必須） | - |
| `--from-year` | 集計開始年 | 直近 10 年 |
| `--to-year` | 集計終了年 | 現在年 |
| `--top-n` | 注目企業の最大件数 | 5 |
| `--surge-top-n` | 急増キーワードの最大件数 | 10 |
| `--out` | 出力先 JSON ファイル | 未指定なら標準出力 |

### B. API エンドポイントから取得する

```bash
# バックエンド起動後
curl "http://localhost:8080/api/dashboard/signal-report?query=AI%20infrastructure&from_year=2016&to_year=2025"
```

`GET /api/dashboard/signal-report` のクエリパラメータ:

| パラメータ | 説明 | 既定値 |
|------------|------|--------|
| `query` | 集計対象テーマ/キーワード（必須） | - |
| `from_year` | 集計開始年 | 直近 10 年 |
| `to_year` | 集計終了年 | 現在年 |
| `top_n` | 注目企業の最大件数（1–50） | 5 |
| `surge_top_n` | 急増キーワードの最大件数（1–100） | 10 |

レスポンススキーマは `backend/app/schemas.py` の `SignalReportResponse`、集計ロジックは
`backend/app/services/signal_report.py` を参照してください。サンプルデータ（`USE_SAMPLE_DATA=true`）でも動作確認できます。

---

## 株価・財務情報の取得（同梱データ / APIキー不要）

注目企業の株価・財務情報を返します。**外部 API キーは不要**で、**ランタイムでは外部ネットワーク取得を行いません**。
サーバはリポジトリに同梱した `backend/data/stock-prices.json`（過去約10年・日次終値＋財務スナップショット）を
読み込みます（SOT-941）。同梱データは開発時に `backend/scripts/collect_stock_data.py` で yfinance から一度
収集してコミットしたものです。`yfinance` はこの収集スクリプト専用の開発用依存で、ランタイム依存には含まれません。
日本株は数字の証券コードのみ指定すると自動で `.T` を付与します（例: `7203` → `7203.T`）。米国株はそのまま
ティッカーを指定します（例: `AAPL`）。同梱データに該当ティッカーが無い場合も例外は発生せず、`error` を設定した
同一形状の JSON を返します。

取得結果は次の統一 JSON 形状で返ります:

```json
{
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "currency": "USD",
  "period": { "years": 10, "from": "2016-06-20", "to": "2026-06-19" },
  "prices": [ { "date": "2016-06-20", "close": 24.5 } ],
  "financials": {
    "market_cap": 3000000000000, "trailing_pe": 30.5, "forward_pe": 28.1,
    "dividend_yield": 0.005, "fifty_two_week_high": 199.0, "fifty_two_week_low": 124.0
  },
  "source": "yfinance",
  "fetched_at": "2026-06-19T07:00:00+00:00",
  "error": null
}
```

> 取得に失敗した場合も例外は発生せず、`prices` が空・`financials` が null・`error` に理由が入った
> 同一形状で返ります。

### A. CLI で取得する

```bash
cd /workspaces/stock-signal-research/backend

# 米国株（標準出力に統一JSONを出力）
APP_ENV=local python scripts/fetch_stock_data.py --ticker AAPL --years 10

# 日本株（数字コードのみでも可。自動で .T 付与）／ファイル出力
APP_ENV=local python scripts/fetch_stock_data.py --ticker 7203 --out data/toyota.json

# 取得した株価を StockPrice テーブルへ保存（market_data_available の接続に利用）
APP_ENV=local python scripts/fetch_stock_data.py --ticker AAPL --save
```

主な引数:

| 引数 | 説明 | 既定値 |
|------|------|--------|
| `--ticker` | 銘柄コード/ティッカー（必須。日本株は数字コードのみでも可） | - |
| `--years` | 取得する過去年数 | 10 |
| `--out` | 出力先 JSON ファイル | 未指定なら標準出力 |
| `--save` | 取得株価を StockPrice テーブルへ保存 | 無効 |

### B. API エンドポイントから取得する

```bash
curl "http://localhost:8080/api/dashboard/stock?ticker=AAPL&years=10"
curl "http://localhost:8080/api/dashboard/stock?ticker=7203"
```

`GET /api/dashboard/stock` のクエリパラメータ:

| パラメータ | 説明 | 既定値 |
|------------|------|--------|
| `ticker` | 銘柄コード/ティッカー（必須） | - |
| `years` | 取得する過去年数（1–20） | 10 |

レスポンススキーマは `backend/app/schemas.py` の `StockDataResponse`、取得ロジックは
`backend/app/services/market_data.py` を参照してください。`--save` で `StockPrice` に保存した銘柄は、
統一シグナルレポートの `top_companies[].market_data_available` が `true` になります（`Company.ticker`
が設定されている場合）。

> **MCP について**: 本機能は同梱 JSON を読むだけのため MCP サーバや API キーの設定は不要です。
> Claude Code からは上記 CLI を実行するだけで株価・財務情報を取得できます。同梱データの再収集が必要な
> 場合のみ `backend/scripts/collect_stock_data.py` を開発環境で実行してください。

---

## 外部データ取得の有効化

MVPはサンプルデータのみで動作します。将来的に以下の外部APIと連携可能な設計です:

- **arXiv API**: `http://export.arxiv.org/api/query`（無料・APIキー不要）
- **Semantic Scholar API**: `https://api.semanticscholar.org/graph/v1`（無料・レート制限あり）
- **EDINET / SEC 13F**: 大口投資家データ取得（実装予定）

有効化方法: 論文収集ジョブ `backend/jobs/collect_papers.py`（および `backend/jobs/collect_news.py` / `daily_analysis.py`）を参照し、必要な設定を `.env` ファイルに追加してください。

---

## 制約事項

- MVPのため、論文データは自動収集せず手動登録またはサンプルデータのみ
- 大口投資家データはサンプルデータのみ（EDINET/SEC連携は未実装）
- 投資判断の直接推奨は行わない設計（前兆候補・関連候補として表示）
- SQLiteはローカル専用 (APP_ENV=local のみ). 本番環境 (APP_ENV=production) では Firestore を使用します

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

---

## クラウドデプロイ（GCP）

### アーキテクチャ概要（クラウド）

```
ローカル gcloud CLI（手動実行）
  └─► Artifact Registry（Dockerイメージ）
        ├─► Cloud Run Service（ダッシュボード / API）
        └─► Cloud Run Jobs
              ├─ collect-papers   (JST 06:00 毎日)
              ├─ collect-news     (JST 06:30 毎日)
              └─ daily-analysis   (JST 07:00 毎日)
                    ├─ aggregate-trends
                    └─ recalculate-scores
Firestore (default database)  ←→  Cloud Run Service / Jobs
Secret Manager                 ←   Cloud Run（認証情報取得）
Cloud Logging                  ←   全サービスのログ出力
```

### サービスの整理と正式名称

本プロジェクトでは、Cloud Run サービスの名称を以下の通りに統一・整理しています。

- **正式サービス**: `stock-signal-research`（フロント+API を同一サービスで配信、`Dockerfile.service` の production ステージを使用）
- **正式URL**: `https://stock-signal-research-iqrm6wvhfq-an.a.run.app`（`/login` 確認対象はこの1つ）
- **旧サービス**: `stock-signal-service` は旧名であり、現在は**削除候補**です。今後のデプロイ・ドキュメントでは使用しません。
- GitHub Actions ワークフロー（`deploy-cloudrun.yml`）と手動デプロイ用の `scripts/gcp/deploy-service.sh` の双方が、サービス名 `stock-signal-research` を直接指すよう統一されています（ワークフローはリテラルでピン留めしており、`CLOUD_RUN_SERVICE` secret は使用しません）。

### 前提条件

- GCP プロジェクト作成済み（課金有効化済み）
- `gcloud` CLI インストール・認証済み
- Docker インストール済み

### GCPセットアップ手順
### GCP Secret Manager セットアップ (Cloud Run本番デプロイ時)

Cloud Run へのデプロイ前に、以下の機密情報をSecret Managerに登録してください。

```bash
# Secret の作成
echo -n "your-random-secret" | gcloud secrets create AUTH_SECRET --data-file=- --project=YOUR_PROJECT_ID
echo -n "user1@example.com,user2@example.com" | gcloud secrets create ALLOWED_USER_EMAILS --data-file=- --project=YOUR_PROJECT_ID
echo -n "APIキー" | gcloud secrets create stock-signal-semantic-scholar-api-key --data-file=- --project=YOUR_PROJECT_ID
echo -n "APIキー" | gcloud secrets create stock-signal-news-api-key --data-file=- --project=YOUR_PROJECT_ID
echo -n "APIキー" | gcloud secrets create stock-signal-llm-api-key --data-file=- --project=YOUR_PROJECT_ID
echo -n "トークン" | gcloud secrets create stock-signal-app-admin-token --data-file=- --project=YOUR_PROJECT_ID

# Cloud Run サービスアカウントに Secret Manager アクセス権を付与
# (デプロイ後、またはデフォルトのコンピュートSAに付与)
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:YOUR_PROJECT_NUMBER-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

ローカル開発では `.env` ファイルに値を直接設定してください。


gcloud を認証してから環境変数を設定し、各スクリプトを実行してください。

```bash
# gcloud 認証（初回または期限切れ時）
gcloud auth login
gcloud auth application-default login
gcloud config set project your-project-id
gcloud config set run/region asia-northeast1

export GCP_PROJECT_ID=your-project-id
export GCP_REGION=asia-northeast1
export GCP_SERVICE_ACCOUNT=stock-signal-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com

# 1. 必要APIを有効化
bash scripts/gcp/enable-apis.sh

# 2. Firestoreデータベース作成
bash scripts/gcp/create-firestore.sh

# 3. Secret Manager にシークレット登録
bash scripts/gcp/create-secrets.sh

# 4. IAM権限設定
bash scripts/gcp/set-iam.sh

# 5. Cloud Run Service デプロイ
bash scripts/gcp/deploy-service.sh

# 6. Cloud Run Jobs 作成
bash scripts/gcp/deploy-jobs.sh

# 7. Cloud Scheduler 作成（3ジョブ）
bash scripts/gcp/create-schedulers.sh
```

### Secret Manager 設定

以下のシークレットを登録してください。APIキーが未設定でもサンプルデータで動作可能です。

| シークレット名 | 説明 | 必須 |
|---|---|---|
| `FIREBASE_WEB_API_KEY` | Firebase Web API Key（サーバ側REST認証用） | Yes |
| `AUTH_SECRET` | セッション署名用シークレット | Yes |
| `ALLOWED_USER_EMAILS` | 許可するメールアドレス（カンマ区切り） | Yes |
| `SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar API キー | No（なければskip） |
| `NEWS_API_KEY` | ニュース API キー | No（なければskip） |
| `LLM_API_KEY` | LLM API キー（OpenAI等） | No（なければskip） |
| `APP_ADMIN_TOKEN` | 管理 API 認証トークン | 推奨 |

登録方法:

```bash
echo -n "your-api-key" | gcloud secrets create SEMANTIC_SCHOLAR_API_KEY \
  --project=$GCP_PROJECT_ID --data-file=-

echo -n "your-api-key" | gcloud secrets create NEWS_API_KEY \
  --project=$GCP_PROJECT_ID --data-file=-

echo -n "your-llm-key" | gcloud secrets create LLM_API_KEY \
  --project=$GCP_PROJECT_ID --data-file=-

echo -n "your-admin-token" | gcloud secrets create APP_ADMIN_TOKEN \
  --project=$GCP_PROJECT_ID --data-file=-
```

### 環境変数一覧

| 変数名 | 説明 | 必須 | デフォルト |
|---|---|---|---|
| `APP_ENV` | 実行環境（local / production） | Yes | `local` |
| `GCP_PROJECT_ID` | GCP プロジェクト ID | 本番必須 | - |
| `GCP_REGION` | GCP リージョン | 本番必須 | `asia-northeast1` |
| `FIRESTORE_DATABASE` | Firestore DB 名 | Yes | `(default)` |
| `USE_SAMPLE_DATA` | サンプルデータモード有効化 | No | `false`（ローカル開発: `.env.example` で `true`）|
| `JOB_NAME` | 実行するジョブ名 | Jobsのみ必須 | - |
| `SEMANTIC_SCHOLAR_API_KEY` | Semantic Scholar API キー | No | - |
| `NEWS_API_KEY` | ニュース API キー | No | - |
| `LLM_API_KEY` | LLM API キー | No | - |
| `APP_ADMIN_TOKEN` | 管理 API 認証トークン | 推奨 | - |
| `LOG_LEVEL` | ログレベル（DEBUG/INFO/WARNING） | No | `INFO` |

ローカル開発時は `.env.example` をコピーして `.env` を作成してください:

```bash
cp .env.example .env
# .env を編集して実際の値を設定
```

### ローカルデプロイ（scripts/deploy_local_gcp.sh）

Cloud Run Service のビルド・デプロイは `scripts/deploy_local_gcp.sh` で一括実行できます:

```bash
# .env を準備して実行
cp .env.example .env
# .env を編集して GCP_PROJECT_ID 等を設定

source .env && bash scripts/deploy_local_gcp.sh
```

Cloud Run Jobs のデプロイは `scripts/gcp/deploy-jobs.sh` で実行してください。
スケジューラ設定は `scripts/gcp/create-schedulers.sh` を使用してください。

### GitHub Actions 設定（CI/CD → Cloud Run）

ワークフロー: `.github/workflows/deploy-cloudrun.yml`

- **トリガー**: `main` ブランチへの push（手動実行用に `workflow_dispatch` も対応）
- **認証方式**: Workload Identity Federation（JSON キーは使用しない）
- **権限**: `permissions: contents: read` / `id-token: write`
- **処理**: Docker build（`Dockerfile.service` の `production` ステージ）→ Artifact Registry push → Cloud Run deploy
- コンテナは **ポート 8080**（`$PORT`、Cloud Run のデフォルト）で listen するため、追加のポート設定は不要

Settings → Secrets and variables → Actions で以下の **必須 Secret（5件）** を設定:

| Secret 名 | 説明 |
|---|---|
| `GCP_PROJECT_ID` | GCP プロジェクト ID |
| `GCP_REGION` | Cloud Run / Artifact Registry のリージョン（例: `asia-northeast1`） |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation プロバイダのリソース名 |
| `GCP_SERVICE_ACCOUNT` | デプロイ用サービスアカウントのメールアドレス |
| `ARTIFACT_REGISTRY_REPOSITORY` | Artifact Registry リポジトリ名 |

> Cloud Run サービス名はワークフロー内にリテラル `stock-signal-research` でピン留めされているため、`CLOUD_RUN_SERVICE` secret は不要です。

### サンプルデータモード

外部 API キーなしで動作確認できます:

```bash
# ローカルでサンプルデータモードを有効化
echo "USE_SAMPLE_DATA=true" >> .env
docker compose up --build
```

`USE_SAMPLE_DATA=true` のとき:
- 外部 API（arXiv, Semantic Scholar, News API）を呼び出しません
- 組み込みのサンプルデータで処理を完了します
- API キーが未設定でもジョブが正常終了します

### ジョブの手動実行

```bash
# 論文収集ジョブ
gcloud run jobs execute collect-papers --region=asia-northeast1

# ニュース収集ジョブ
gcloud run jobs execute collect-news --region=asia-northeast1

# 日次分析ジョブ（集計 + スコア再計算）
gcloud run jobs execute daily-analysis --region=asia-northeast1

# 実行状況確認
gcloud run jobs executions list --job=collect-papers --region=asia-northeast1
```

### Cloud Logging でログを確認する

```bash
# Cloud Run Jobs のログ
gcloud logging read "resource.type=cloud_run_job" \
  --project=$GCP_PROJECT_ID --limit=50 --format="table(timestamp,textPayload)"

# Cloud Run Service のログ
gcloud logging read "resource.type=cloud_run_revision" \
  --project=$GCP_PROJECT_ID --limit=50 --format="table(timestamp,textPayload)"

# エラーのみ絞り込み
gcloud logging read "resource.type=cloud_run_job AND severity>=ERROR" \
  --project=$GCP_PROJECT_ID --limit=20
```

GCP コンソール: [Cloud Logging](https://console.cloud.google.com/logs)

### Firestore のデータを確認する

GCP コンソール: [Firestore](https://console.cloud.google.com/firestore)

コレクション一覧:

| コレクション | 説明 |
|---|---|
| `papers` | 収集した論文情報 |
| `news` | 収集したニュース情報 |
| `themes` | 技術テーマ |
| `companies` | 関連企業 |
| `trend_snapshots` | トレンド集計結果 |
| `scores` | テーマ別・企業別スコア |
| `jobs` | ジョブ実行履歴 |
| `notifications` | 通知履歴 |

### 想定コスト（月額）

MVP 構成での想定コスト（2024年時点の GCP 料金）:

| サービス | 使用量 | 無料枠 | 想定コスト |
|---|---|---|---|
| Cloud Run Service | min-instances=0、リクエスト時のみ | 月180万リクエスト | ~0円 |
| Cloud Run Jobs | 3ジョブ/日 × 約2分 × 30日 = 180分 | 月240分 | ~0円 |
| Cloud Scheduler | 3ジョブ | 月3ジョブ | ~0円 |
| Firestore | 軽量な read/write | 月50K読み取り/20K書き込み | ~0円 |
| Secret Manager | 4シークレット × 3回/日 | 月6アクセス | ~0円 |
| Artifact Registry | 約500MB | 0.5GB | ~数円 |
| **合計** | | | **~100円以下** |

> ⚠️ 無料枠は変更される場合があります。[GCP 料金計算ツール](https://cloud.google.com/products/calculator)で確認してください。

### Artifact Registry の古いイメージ削除

ストレージコスト削減のため、古いイメージを定期的に削除してください:

```bash
# イメージ一覧表示
gcloud artifacts docker images list \
  asia-northeast1-docker.pkg.dev/$GCP_PROJECT_ID/stock-signal-registry/stock-signal-research-app

# 30日以上前のイメージを削除
gcloud artifacts docker images list \
  asia-northeast1-docker.pkg.dev/$GCP_PROJECT_ID/stock-signal-registry/stock-signal-research-app \
  --filter="UPDATE_TIME < -P30D" --format="value(DIGEST)" | \
  xargs -I {} gcloud artifacts docker images delete \
    asia-northeast1-docker.pkg.dev/$GCP_PROJECT_ID/stock-signal-registry/stock-signal-research-app@{} \
    --quiet --delete-tags 2>/dev/null || true
```

### セキュリティ注意事項

- **`.env` をコミットしない** — `.gitignore` で除外済み
- **サービスアカウントキーをリポジトリに置かない** — `gcloud auth login` / `gcloud auth application-default login` で認証
- **Cloud Run Service は現在 unauthenticated アクセス許可**（MVP のため）。本番運用では IAP または認証ミドルウェアの追加を検討してください
- **管理 API** は `APP_ADMIN_TOKEN` による Bearer 認証で保護できます
- **個人情報・機密情報は表示しない**設計です（情報収集・分析支援ツール）
- Cloud Run 実行用サービスアカウントは最小権限（Firestore 読み書き、Secret Manager アクセスのみ）

## 本番DB（Firestore）初期化・データ移行

### Firestore データベース作成

scripts/gcp/create-firestore.sh を実行してFirestoreデータベースを作成します（初回のみ）。

### SQLite サンプルデータの Firestore への投入

ローカルの SQLite サンプルデータを Firestore に投入するには:

````bash
# ローカル SQLite を事前に初期化
APP_ENV=local USE_SAMPLE_DATA=true python -m uvicorn app.main:app --host 0.0.0.0 --port 8080 &
sleep 3; kill %1

# Firestore に移行
cd backend
APP_ENV=local GCP_PROJECT_ID=your-project-id python scripts/migrate_sqlite_to_firestore.py
````

### Firestore データの確認

```bash
# Cloud Run Jobs 実行後の確認
gcloud firestore documents list --collection=themes --project=your-project-id
```

### 投資助言に関する注意

このツールは**情報収集・分析支援**を目的としています。

- 表示されるスコアや指標は参考情報であり、投資収益を保証しません
- 投資判断はご自身の責任で行ってください
- 外部 API から取得したデータの正確性は保証されません
