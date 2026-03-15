from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_async_db
from app.models.trade import TradeLog
from app.core.analytics import TradeAnalytics
from sqlalchemy import select
from typing import List, Dict, Any
import logging

router = APIRouter(prefix="/api/analytics", tags=["analytics"])

@router.get("/pnl-summary")
async def get_pnl_summary(db: AsyncSession = Depends(get_async_db)):
    """Calculates summary statistics for all trades in the database."""
    result = await db.execute(select(TradeLog))
    trades = result.scalars().all()
    
    # Convert ORM objects to dicts for the stats engine
    trade_dicts = []
    for t in trades:
        trade_dicts.append({
            "pnl": t.pnl,
            "side": t.side,
            "quantity": t.quantity,
            "broker": t.broker
        })
        
    engine = TradeAnalytics()
    summary = engine.calculate_net_pnl(trade_dicts)
    return summary

@router.post("/upload-csv")
async def upload_trade_csv(file: UploadFile = File(...), db: AsyncSession = Depends(get_async_db)):
    """Parses a broker CSV and saves trades to the database."""
    # Placeholder for CSV saving and parsing logic
    # In production, we'd save the file and use TradeAnalytics to scan it
    return {"status": "success", "filename": file.filename}
