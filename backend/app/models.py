from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.sql import func
from .database import Base
import uuid


def generate_uuid():
    return str(uuid.uuid4())


class Theme(Base):
    __tablename__ = "themes"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, index=True, nullable=False)
    category = Column(String, nullable=False)
    description = Column(String)
    precursor_score = Column(Float, default=0.0)
    is_trending = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Paper(Base):
    __tablename__ = "papers"
    id = Column(String, primary_key=True, default=generate_uuid)
    paper_id = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    url = Column(String)
    authors = Column(String)  # Stored as JSON string
    published_at = Column(String)
    abstract = Column(String)
    extracted_keywords = Column(String)  # Stored as JSON string
    theme_id = Column(String, ForeignKey("themes.id"), nullable=True)
    source = Column(String, default="manual")
    citation_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PaperMonthlyCount(Base):
    __tablename__ = "paper_monthly_counts"
    id = Column(String, primary_key=True, default=generate_uuid)
    theme_id = Column(String, ForeignKey("themes.id"), nullable=False)
    keyword = Column(String, nullable=False)
    year_month = Column(String, nullable=False)
    count = Column(Integer, default=0)
    prev_month_count = Column(Integer, default=0)
    prev_year_count = Column(Integer, default=0)
    mom_change_pct = Column(Float, default=0.0)
    yoy_change_pct = Column(Float, default=0.0)


class Patent(Base):
    """SOT-960: USPTO Patent Public Search 由来の実特許データ。
    論文(Paper)と並ぶ前兆指標として、テーマ別の特許動向を表示する。"""
    __tablename__ = "patents"
    id = Column(String, primary_key=True, default=generate_uuid)
    patent_id = Column(String, unique=True, index=True, nullable=False)
    patent_number = Column(String)
    title = Column(String, nullable=False)
    published_at = Column(String)  # "YYYY-MM-DD"
    theme_id = Column(String, ForeignKey("themes.id"), nullable=True)
    assignee = Column(String)
    inventors = Column(String)
    cpc = Column(String)
    kind = Column(String)  # "USPAT" | "US-PGPUB"
    url = Column(String)
    source = Column(String, default="ppubs")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PatentYearlyCount(Base):
    """テーマ×年の特許マッチ件数(PPUBSの実numResults)。年次トレンドのバーに使う。"""
    __tablename__ = "patent_yearly_counts"
    id = Column(String, primary_key=True, default=generate_uuid)
    theme_id = Column(String, ForeignKey("themes.id"), nullable=False)
    year = Column(String, nullable=False)
    count = Column(Integer, default=0)


class Company(Base):
    __tablename__ = "companies"
    id = Column(String, primary_key=True, default=generate_uuid)
    name = Column(String, unique=True, index=True, nullable=False)
    ticker = Column(String, nullable=True)
    description = Column(String)
    benefit_score = Column(Float, default=0.0)
    benefit_type = Column(String, default="indirect")
    theme_ids = Column(String)  # Stored as JSON string


class SupplyChain(Base):
    __tablename__ = "supply_chains"
    id = Column(String, primary_key=True, default=generate_uuid)
    from_theme_id = Column(String, ForeignKey("themes.id"), nullable=False)
    to_theme_id = Column(String, ForeignKey("themes.id"), nullable=False)
    relationship = Column(String, nullable=False)
    description = Column(String)
    order = Column(Integer, default=0)
    # SOT-1124: 構造化サプライチェーン edge のメタ情報
    relation_type = Column(String, default="depends_on")
    confidence = Column(Float, default=0.5)
    evidence = Column(String)  # JSON string (list of evidence strings)
    created_at = Column(String)  # ISO date


class InstitutionalInvestor(Base):
    __tablename__ = "institutional_investors"
    id = Column(String, primary_key=True, default=generate_uuid)
    investor_name = Column(String, nullable=False)
    company_id = Column(String, ForeignKey("companies.id"), nullable=False)
    ownership_pct = Column(Float, default=0.0)
    change_pct = Column(Float, default=0.0)
    report_date = Column(String)
    report_type = Column(String)
    notes = Column(String)
    # SOT-1120: 13F の保有内訳を notes 文字列に潰さず独立カラムで保持する。
    cusip = Column(String)
    ticker = Column(String)
    shares = Column(Integer)        # 保有株数
    value_usd = Column(Float)       # 評価額(USD)
    quarter_delta = Column(Integer)  # 前期(四半期)比の保有株数の符号付き差分。初回は0。


class ExternalInfo(Base):
    __tablename__ = "external_infos"
    id = Column(String, primary_key=True, default=generate_uuid)
    info_id = Column(String, unique=True, index=True, nullable=False)
    info_type = Column(String, nullable=False)  # "news" | "announcement" | "earnings" | "filing"
    title = Column(String, nullable=False)
    url = Column(String)
    summary = Column(String)
    source_name = Column(String)
    published_at = Column(String)
    related_company = Column(String)
    theme_id = Column(String, ForeignKey("themes.id"), nullable=True)
    relevance_score = Column(Float, default=0.0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AlignmentScore(Base):
    __tablename__ = "alignment_scores"
    id = Column(String, primary_key=True, default=generate_uuid)
    theme_id = Column(String, ForeignKey("themes.id"), unique=True, nullable=False)
    score = Column(Float, default=0.0)
    news_score = Column(Float, default=0.0)
    announcement_score = Column(Float, default=0.0)
    earnings_score = Column(Float, default=0.0)
    confidence = Column(Float, default=0.0)
    evidence_count = Column(Integer, default=0)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())


class StockPrice(Base):
    __tablename__ = "stock_prices"
    id = Column(String, primary_key=True, default=generate_uuid)
    ticker = Column(String, index=True, nullable=False)
    date = Column(String, nullable=False)   # "YYYY-MM-DD"
    close = Column(Float, nullable=False)
    company_id = Column(String, ForeignKey("companies.id"), nullable=True)


class ResearchSeed(Base):
    """過去履歴から抽出した初期リサーチseedデータ。
    投資助言ではなく、調査・仮説検証用データとして扱う。"""
    __tablename__ = "research_seeds"
    id = Column(String, primary_key=True, default=generate_uuid)
    seed_id = Column(String, unique=True, index=True, nullable=False)
    source_type = Column(String)  # "history" | "memo" | "manual" | "web" | "paper" | "stock"
    source_reference = Column(String)
    symbol = Column(String, nullable=True)
    company_name = Column(String, nullable=True)
    theme = Column(String, nullable=False)
    related_keywords = Column(String)  # Stored as JSON string (list[str])
    summary = Column(String)
    papers = Column(String)  # Stored as JSON string (list[dict])
    stock_events = Column(String)  # Stored as JSON string (list[dict])
    hypothesis = Column(String, nullable=True)
    reason_to_track = Column(String)
    confidence = Column(String)  # "low" | "medium" | "high"
    seed_created_at = Column(String)  # source ISO string
    seed_updated_at = Column(String)  # source ISO string
    created_at = Column(DateTime(timezone=True), server_default=func.now())
