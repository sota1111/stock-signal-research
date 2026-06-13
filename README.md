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

このアプリはログイン認証が必要です。`.env` に以下の変数を設定してください。

| 変数名 | 説明 | 例 |
|--------|------|-----|
| AUTH_USERNAME | ログインユーザー名 | admin |
| AUTH_PASSWORD | ログインパスワード | changeme |
| AUTH_SECRET_KEY | JWT署名キー（必ず変更してください） | random-secret-string |

### 動作確認方法

1. `cp .env.example .env` で環境変数ファイルを作成（初回のみ）
2. `docker compose up --build` で起動
3. http://localhost:5173 にアクセス → ログイン画面にリダイレクトされる
4. `.env` に設定した `AUTH_USERNAME` / `AUTH_PASSWORD` でログイン
5. ログアウトはナビバー右上の「ログアウト」ボタンから

---

## 認証情報が不要な理由:
- `USE_SAMPLE_DATA=true` のとき、すべてのデータ収集はサンプルデータで代替されます
- Firestore・GCP・外部APIへの接続は行われません
- `SEMANTIC_SCHOLAR_API_KEY`, `NEWS_API_KEY`, `LLM_API_KEY` は未設定でOKです

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

---

## クラウドデプロイ（GCP）

### アーキテクチャ概要（クラウド）

```
GitHub Actions（main merge）
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

### 前提条件

- GCP プロジェクト作成済み（課金有効化済み）
- `gcloud` CLI インストール・認証済み
- Docker インストール済み
- GitHub リポジトリの Secrets 設定済み（後述）

### GCPセットアップ手順
### GCP Secret Manager セットアップ (Cloud Run本番デプロイ時)

Cloud Run へのデプロイ前に、以下の機密情報をSecret Managerに登録してください。

```bash
# Secret の作成
echo -n "パスワード" | gcloud secrets create stock-signal-auth-password --data-file=- --project=YOUR_PROJECT_ID
echo -n "秘密鍵" | gcloud secrets create stock-signal-auth-secret-key --data-file=- --project=YOUR_PROJECT_ID
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


環境変数を設定してから各スクリプトを実行してください。

```bash
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
| `USE_SAMPLE_DATA` | サンプルデータモード有効化 | No | `false` |
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

### GitHub Actions 設定

以下の GitHub Secrets を設定してください（Settings → Secrets and variables → Actions）:

| Secret 名 | 説明 |
|---|---|
| `GCP_PROJECT_ID` | GCP プロジェクト ID |
| `GCP_REGION` | デプロイリージョン（例: `asia-northeast1`） |
| `GCP_SERVICE_ACCOUNT` | Cloud Run 実行用サービスアカウント（例: `stock-signal-sa@project.iam.gserviceaccount.com`） |
| `GCP_WORKLOAD_IDENTITY_PROVIDER` | Workload Identity Federation プロバイダ URL |

Workload Identity Federation のセットアップ:

```bash
# Workload Identity Pool 作成
gcloud iam workload-identity-pools create github-pool \
  --project=$GCP_PROJECT_ID \
  --location=global \
  --display-name="GitHub Actions Pool"

# Pool ID 取得
POOL_ID=$(gcloud iam workload-identity-pools describe github-pool \
  --project=$GCP_PROJECT_ID --location=global --format="value(name)")

# Provider 作成
gcloud iam workload-identity-pools providers create-oidc github-provider \
  --project=$GCP_PROJECT_ID \
  --location=global \
  --workload-identity-pool=github-pool \
  --display-name="GitHub Actions Provider" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --issuer-uri="https://token.actions.githubusercontent.com"

# サービスアカウントへの権限付与
gcloud iam service-accounts add-iam-policy-binding \
  stock-signal-sa@${GCP_PROJECT_ID}.iam.gserviceaccount.com \
  --project=$GCP_PROJECT_ID \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/${POOL_ID}/attribute.repository/sota1111/stock-signal-research"
```

main ブランチへのマージ時に自動デプロイされます（`.github/workflows/deploy.yml`）。

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
- **サービスアカウントキーをリポジトリに置かない** — Workload Identity Federation を使用
- **Cloud Run Service は現在 unauthenticated アクセス許可**（MVP のため）。本番運用では IAP または認証ミドルウェアの追加を検討してください
- **管理 API** は `APP_ADMIN_TOKEN` による Bearer 認証で保護できます
- **個人情報・機密情報は表示しない**設計です（情報収集・分析支援ツール）
- Cloud Run 実行用サービスアカウントは最小権限（Firestore 読み書き、Secret Manager アクセスのみ）

### 投資助言に関する注意

このツールは**情報収集・分析支援**を目的としています。

- 表示されるスコアや指標は参考情報であり、投資収益を保証しません
- 投資判断はご自身の責任で行ってください
- 外部 API から取得したデータの正確性は保証されません
