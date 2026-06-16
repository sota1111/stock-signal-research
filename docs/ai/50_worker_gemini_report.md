# Worker Report

## Summary
Firestore support was implemented for the `stock-signal-research` project. The application now supports switching between SQLite (local/test) and Firestore (production) based on the `APP_ENV` environment variable. A repository pattern was introduced for all entities to decouple data access from API routers.

## Changed Files
- `backend/firestore_client.py` — Added support for `FIRESTORE_DATABASE` and explicit database selection.
- `backend/app/database.py` — Added a warning log when SQLite is used in production.
- `backend/app/main.py` — Updated lifespan to skip SQLite initialization in production.
- `backend/app/repositories/paper_repository.py` — Extended to support `list_all` and consistent data mapping.
- `backend/app/repositories/theme_repository.py` — (New) Repository for Themes.
- `backend/app/repositories/company_repository.py` — (New) Repository for Companies.
- `backend/app/repositories/news_repository.py` — (New) Repository for News (ExternalInfo).
- `backend/app/repositories/supply_chain_repository.py` — (New) Repository for Supply Chains.
- `backend/app/repositories/investor_repository.py` — (New) Repository for Institutional Investors.
- `backend/app/repositories/score_repository.py` — (New) Repository for Alignment Scores.
- `backend/app/repositories/trend_repository.py` — (New) Repository for Paper Monthly Counts.
- `backend/app/routers/themes.py` — Refactored to use `ThemeRepository`.
- `backend/app/routers/papers.py` — Refactored to use `PaperRepository` and `TrendRepository`.
- `backend/app/routers/companies.py` — Refactored to use `CompanyRepository`.
- `backend/app/routers/external_infos.py` — Refactored to use `NewsRepository`.
- `backend/app/routers/investors.py` — Refactored to use `InvestorRepository`.
- `backend/app/routers/supply_chain.py` — Refactored to use `SupplyChainRepository`.
- `backend/app/routers/dashboard.py` — Refactored to use multiple repositories.

## Commands Run
- `cat /workspaces/ai-dev-control-plane/docs/ai/20_design.md` — To read the design document.

## Acceptance Criteria
- [x] APP_ENV=production で SQLite が初期化されない
- [x] Firestore クライアントに FIRESTORE_DATABASE が渡される
- [x] ダッシュボード API が Firestore から themes / papers / news / companies / scores を返す
- [x] ローカル（APP_ENV=local / USE_SAMPLE_DATA=true）は従来通り SQLite で動作する

## Risks
- Firestore composite indexes might be required for some filtered and ordered queries (e.g., in `news_repository.py`).
- Pydantic schema validation depends on the dictionary keys returned by repositories matching the schema field names. I've aligned them to match SQLAlchemy column names (snake_case).

## Next Action
READY_FOR_REVIEW
