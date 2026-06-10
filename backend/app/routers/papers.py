from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/papers", tags=["papers"])

@router.get("/", response_model=List[schemas.PaperResponse])
def read_papers(theme_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.Paper)
    if theme_id:
        query = query.filter(models.Paper.theme_id == theme_id)
    return query.all()

@router.post("/", response_model=schemas.PaperResponse)
def create_paper(paper: schemas.PaperCreate, db: Session = Depends(get_db)):
    db_paper = models.Paper(**paper.model_dump())
    db.add(db_paper)
    db.commit()
    db.refresh(db_paper)
    return db_paper

@router.get("/monthly", response_model=List[schemas.PaperMonthlyCountResponse])
def read_paper_monthly_counts(theme_id: Optional[str] = None, db: Session = Depends(get_db)):
    query = db.query(models.PaperMonthlyCount)
    if theme_id:
        query = query.filter(models.PaperMonthlyCount.theme_id == theme_id)
    return query.all()
