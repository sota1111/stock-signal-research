from sqlalchemy import Column, String, Float, Boolean, DateTime, ForeignKey, Integer, JSON
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
