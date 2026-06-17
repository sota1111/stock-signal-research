import os

def use_sqlite() -> bool:
    """Helper to determine if SQLite should be used based on APP_ENV."""
    return os.getenv("APP_ENV", "local") in ("local", "test")

from .company_repository import get_company_repository
from .theme_repository import get_theme_repository
from .stock_price_repository import get_stock_price_repository
from .news_repository import get_news_repository
from .score_repository import get_score_repository
from .investor_repository import get_investor_repository
from .trend_repository import get_trend_repository
from .supply_chain_repository import get_supply_chain_repository
from .paper_repository import get_paper_repository
