# Worker Report

## Summary
Performed a read-only code review for SOT-483. Inspected the local Docker Compose setup, Cloud Run service Dockerfile, Vite proxy config, FastAPI SPA/static serving, authentication, README instructions, environment example, Cloud Run job Dockerfile/scripts, and recent git history. Docker is not available in this DevContainer, so all acceptance checks are based on file contents only.

Overall: the local Docker Compose path and single-container `Dockerfile.service` design appear mostly aligned with the requested behavior by inspection. However, there is actionable work remaining around Cloud Run deployment documentation/scripts: README points to `scripts/gcp/deploy-service.sh`, but that script references a missing `cloudbuild.yaml`; Cloud Run auth env handling also appears incomplete because production deploy scripts do not set `AUTH_USERNAME`.

## Changed Files
- none (read-only task check)

## Commands Run
- `test -f docs/ai/00_project_context.md && sed -n '1,240p' docs/ai/00_project_context.md || true`
- `sed -n '1,240p' docker-compose.yml`
- `sed -n '1,260p' Dockerfile.service`
- `sed -n '1,240p' frontend/vite.config.ts`
- `sed -n '1,280p' backend/app/main.py`
- `sed -n '1,320p' README.md`
- `test -f .env.example && sed -n '1,240p' .env.example || true`
- `git -C /workspaces/stock-signal-research log --oneline -10`
- `test -f Dockerfile.jobs && sed -n '1,260p' Dockerfile.jobs || true`
- `rg -n "AUTH_USERNAME|AUTH_PASSWORD|VITE_API_URL|/api|docs|Cloud Run|5173|8080|Dockerfile.service|Dockerfile.jobs|sample|USE_SAMPLE_DATA" -S README.md frontend backend docker-compose.yml .env.example Dockerfile.service Dockerfile.jobs`
- `sed -n '320,620p' README.md`
- `sed -n '1,260p' frontend/src/api/index.ts`
- `sed -n '1,260p' frontend/src/contexts/AuthContext.tsx`
- `sed -n '1,260p' frontend/src/App.tsx`
- `rg --files scripts .github | sort`
- `sed -n '1,260p' scripts/gcp/deploy-service.sh`
- `sed -n '1,280p' scripts/gcp/deploy-jobs.sh`
- `sed -n '1,280p' scripts/deploy_local_gcp.sh`
- `sed -n '1,240p' backend/app/auth.py`
- `sed -n '140,230p' backend/app/seed.py`
- `test -f cloudbuild.yaml && sed -n '1,220p' cloudbuild.yaml || true`
- `find . -maxdepth 3 -name 'cloudbuild.yaml' -o -name 'cloudbuild*.yml' -o -name 'cloudbuild*.yaml'`
- `sed -n '1,220p' frontend/Dockerfile`
- `rg -n "def run_seed|seed_external_infos|USE_SAMPLE_DATA|Theme\\(" backend/app/seed.py`
- `sed -n '1,150p' backend/app/seed.py`

Git log checked:

```text
a25ab0d Merge pull request #8 from sota1111/feat/SOT-484-paper-collection
4829b6d fix(SOT-505): lint修正
16da077 feat(SOT-504): テーマ連動収集強化 - arXivをテーマ連動化 + Semantic Scholar追加
3dddb87 feat(SOT-503): PaperRepositoryによるSQLite/Firestore保存経路共通化
9853a3a Merge pull request #7 from sota1111/feat/SOT-483-local-fix
bc9260f fix(SOT-483): ローカル起動復旧 - ポート不整合修正・Cloud Run単一Service対応
952627a Merge pull request #6 from sota1111/feat/SOT-499-secret-manager
aafd0ea feat(SOT-499): Secret Manager対応 - deploy_local_gcp.sh更新・README追記
2f3e3d8 Merge pull request #5 from sota1111/feat/SOT-482-local-deploy
8533fda feat(SOT-492): GitHub Actions削除・deploy_local_gcp.sh追加・.env.example更新
```

## Acceptance Criteria
- [ ] `cp .env.example .env` 後、`docker compose up --build` で正常起動する: cannot runtime verify without Docker. Code review looks mostly satisfied: `.env.example` exists, compose loads `.env`, backend uses `Dockerfile.service` target `backend`, frontend uses `frontend/Dockerfile`, ports are mapped as `8080:8080` and `5173:5173`. Risk: `env_file: .env` means compose requires the copied `.env` file, as documented.
- [ ] `http://localhost:5173` でログイン画面が表示される: cannot runtime verify. Code review supports this: frontend exposes 5173, `App.tsx` routes `/` through `PrivateRoute`, unauthenticated users are redirected to `/login`.
- [ ] `.env` の `AUTH_USERNAME` / `AUTH_PASSWORD` でログインできる: cannot runtime verify. Code review supports local compose: compose passes `AUTH_USERNAME`, `AUTH_PASSWORD`, and `AUTH_SECRET_KEY`; `backend/app/auth.py` validates against those env vars; frontend posts to `/api/auth/login`.
- [ ] ダッシュボードが表示され、サンプルデータが取得できる: cannot runtime verify. Code review supports this for a fresh local DB: compose sets `USE_SAMPLE_DATA=true`, `backend/app/main.py` runs `seed.run_seed()` on startup, seed data includes themes/companies/papers/monthly counts/investors, and frontend dashboard calls `/api/dashboard/`. Note: `seed_external_infos()` only runs when the DB has no existing themes because `run_seed()` returns early if any theme exists.
- [ ] ブラウザのNetworkで `/api` への通信が失敗していない: cannot runtime verify. Code review supports local development: frontend API base is `/api`, Vite proxies `/api` to `VITE_PROXY_TARGET`, and compose sets `VITE_PROXY_TARGET=http://backend:8080`.
- [x] backend API docs が README に記載したURLで表示できる (code review): README says `http://localhost:8080/docs`; FastAPI default docs are enabled and compose maps backend `8080:8080`.
- [ ] Cloud Run Service 用イメージをローカルで `docker build` できる: cannot runtime verify. Code review supports the intended image: `Dockerfile.service` default final stage is `production`, builds frontend via `npm ci`/`npm run build`, copies `frontend/dist` into `/app/dist`, and inherits backend CMD.
- [ ] Cloud Run Service 用コンテナをローカルで `PORT=8080` 指定して起動できる: cannot runtime verify. Code review supports this: `Dockerfile.service` backend CMD uses `uvicorn ... --port ${PORT:-8080}` and production inherits it.
- [x] 同一コンテナで `/` がReact画面、`/api` または `/docs` がFastAPIとして応答する (code review): `Dockerfile.service` production copies React build to `/app/dist`; `backend/app/main.py` mounts `/assets` and has a catch-all SPA route after API routes. `/docs` remains FastAPI docs because the catch-all is registered after FastAPI docs/API routes.
- [x] React Router の直接URLアクセスで404にならない (code review): `backend/app/main.py` catch-all `/{full_path:path}` returns `index.html` when `dist/index.html` exists, so direct URLs such as `/list`, `/themes/:id`, and `/input` should be served by the SPA in the single-container image.
- [ ] README のローカル起動手順、Cloud Run起動構成、ポート番号が実装と一致している: not fully met by code review. Local ports/instructions match compose (`5173`, `8080`, `/docs`). Cloud Run docs/scripts are inconsistent: README tells users to run `scripts/gcp/deploy-service.sh`, but that script calls `gcloud builds submit --config=cloudbuild.yaml` and no `cloudbuild.yaml` exists in the repo. README also says GitHub Actions deploy exists at `.github/workflows/deploy.yml`, but `.github` is absent. Additionally, the env var table says `USE_SAMPLE_DATA` default is `false`, while local quickstart relies on `.env.example` setting it to `true`.
- [ ] 既存の Cloud Run Jobs 用Dockerfileとジョブ起動方法が壊れていない: cannot runtime verify. Code review mostly supports this: `Dockerfile.jobs` remains separate and runs `python -m jobs.runner`; compose retains a `jobs` service under the `jobs` profile; README lists manual `gcloud run jobs execute ...` commands; `scripts/gcp/deploy-jobs.sh` builds with `Dockerfile.jobs`. No SOT-483 change was observed that obviously breaks the jobs Dockerfile.

## Risks
- Actionable: `scripts/gcp/deploy-service.sh` is broken as written because it references missing `cloudbuild.yaml`. Either add `cloudbuild.yaml`, update the script to build with `Dockerfile.service`, or update README to point only to `scripts/deploy_local_gcp.sh` if that is the intended supported path.
- Actionable: Cloud Run production auth appears incomplete. `backend/app/auth.py` requires `AUTH_USERNAME`, but `scripts/deploy_local_gcp.sh` and `scripts/gcp/deploy-service.sh` do not set `AUTH_USERNAME`; README Secret Manager setup also creates password/secret-key secrets but not a username secret or env var. Local compose is fine because it passes `AUTH_USERNAME`.
- Documentation risk: README still references `.github/workflows/deploy.yml`, but `.github` does not exist in the current repository. This may be from older deployment docs and can confuse review.
- Documentation risk: README environment table lists `USE_SAMPLE_DATA` default as `false`, but the local quickstart depends on `.env.example` setting `USE_SAMPLE_DATA=true`.
- Runtime not verified: Docker/compose/build/browser/network checks were not executed because Docker is unavailable in this DevContainer.

## Next Action
NEEDS_DEBUG
