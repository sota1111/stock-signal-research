from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/external-infos", tags=["external-infos"])

@router.get("/", response_model=List[schemas.ExternalInfoResponse])
def list_external_infos(
    theme_id: Optional[str] = Query(None),
    info_type: Optional[str] = Query(None),
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
):
    q = db.query(models.ExternalInfo)
    if theme_id:
        q = q.filter(models.ExternalInfo.theme_id == theme_id)
    if info_type:
        q = q.filter(models.ExternalInfo.info_type == info_type)
    return q.order_by(models.ExternalInfo.published_at.desc()).limit(limit).all()

@router.post("/", response_model=schemas.ExternalInfoResponse)
def create_external_info(item: schemas.ExternalInfoCreate, db: Session = Depends(get_db)):
    db_item = models.ExternalInfo(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item
