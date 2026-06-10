from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from ..database import get_db
from .. import models, schemas

router = APIRouter(prefix="/themes", tags=["themes"])

@router.get("/", response_model=List[schemas.ThemeResponse])
def read_themes(db: Session = Depends(get_db)):
    return db.query(models.Theme).order_by(models.Theme.precursor_score.desc()).all()

@router.post("/", response_model=schemas.ThemeResponse)
def create_theme(theme: schemas.ThemeCreate, db: Session = Depends(get_db)):
    db_theme = models.Theme(**theme.model_dump())
    db.add(db_theme)
    db.commit()
    db.refresh(db_theme)
    return db_theme

@router.get("/{theme_id}", response_model=schemas.ThemeResponse)
def read_theme(theme_id: str, db: Session = Depends(get_db)):
    db_theme = db.query(models.Theme).filter(models.Theme.id == theme_id).first()
    if db_theme is None:
        raise HTTPException(status_code=404, detail="Theme not found")
    return db_theme

@router.put("/{theme_id}", response_model=schemas.ThemeResponse)
def update_theme(theme_id: str, theme: schemas.ThemeUpdate, db: Session = Depends(get_db)):
    db_theme = db.query(models.Theme).filter(models.Theme.id == theme_id).first()
    if db_theme is None:
        raise HTTPException(status_code=404, detail="Theme not found")
    
    for var, value in theme.model_dump(exclude_unset=True).items():
        setattr(db_theme, var, value)
    
    db.commit()
    db.refresh(db_theme)
    return db_theme

@router.delete("/{theme_id}")
def delete_theme(theme_id: str, db: Session = Depends(get_db)):
    db_theme = db.query(models.Theme).filter(models.Theme.id == theme_id).first()
    if db_theme is None:
        raise HTTPException(status_code=404, detail="Theme not found")
    
    db.delete(db_theme)
    db.commit()
    return {"message": "Theme deleted"}
