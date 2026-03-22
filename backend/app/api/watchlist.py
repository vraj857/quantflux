from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database import get_async_db
from app.models.watchlist import WatchlistMember
from sqlalchemy import select, delete, distinct
from typing import List, Dict, Any, Set
import logging

from pydantic import BaseModel

router = APIRouter(prefix="/api/watchlist", tags=["watchlist"])

class WatchlistAddRequest(BaseModel):
    symbol: str
    name: str = "Default"

class WatchlistBulkRequest(BaseModel):
    text: str
    name: str = "Default"

class WatchlistRemoveRequest(BaseModel):
    symbol: str
    name: str = "Default"

@router.get("/names")
async def list_watchlist_names(db: AsyncSession = Depends(get_async_db)):
    """Returns all distinct watchlist collection names from DB."""
    # 1. Start with mandatory "Default"
    names: Set[str] = {"Default"}
        
    # 2. Extract from DB
    result = await db.execute(select(distinct(WatchlistMember.list_name)))
    db_names = [row[0] for row in result.all()]
    names.update(db_names)
    
    # 3. Sort (Default first, then others)
    sorted_names = sorted(list(names))
    if "Default" in sorted_names:
        sorted_names.remove("Default")
        sorted_names = ["Default"] + sorted_names
        
    return sorted_names

@router.get("/")
async def list_watchlist(name: str = "Default", db: AsyncSession = Depends(get_async_db)):
    """Lists all symbols in a given watchlist from DB."""
    result = await db.execute(select(WatchlistMember).filter(WatchlistMember.list_name == name))
    items = result.scalars().all()
    # Unique sorted symbols
    symbols = sorted(list(set([i.symbol for i in items])))
    return symbols

@router.post("/add")
async def add_to_watchlist(data: WatchlistAddRequest, db: AsyncSession = Depends(get_async_db)):
    """Adds a symbol to the watchlist."""
    symbols = [s.strip().upper() for s in data.symbol.replace(",", " ").split() if s.strip()]
    added = []
    for s in symbols:
        val = s if ":" in s else f"NSE:{s}"
        check = await db.execute(select(WatchlistMember).filter(WatchlistMember.list_name == data.name, WatchlistMember.symbol == val))
        if not check.scalar_one_or_none():
            member = WatchlistMember(list_name=data.name, symbol=val)
            db.add(member)
            added.append(val)
    await db.commit()
    return {"status": "success", "added": added}

@router.post("/bulk")
async def bulk_upload(data: WatchlistBulkRequest, db: AsyncSession = Depends(get_async_db)):
    """Bulk adds symbols to the watchlist from string."""
    symbols = [s.strip().upper() for s in data.text.replace(",", " ").split() if s.strip()]
    added = []
    for s in symbols:
        val = s if ":" in s else f"NSE:{s}"
        check = await db.execute(select(WatchlistMember).filter(WatchlistMember.list_name == data.name, WatchlistMember.symbol == val))
        if not check.scalar_one_or_none():
            member = WatchlistMember(list_name=data.name, symbol=val)
            db.add(member)
            added.append(val)
    await db.commit()
    return {"status": "success", "count": len(added)}

@router.post("/remove")
async def remove_from_watchlist(data: WatchlistRemoveRequest, db: AsyncSession = Depends(get_async_db)):
    """Removes a symbol from the watchlist."""
    await db.execute(delete(WatchlistMember).filter(WatchlistMember.list_name == data.name, WatchlistMember.symbol == data.symbol.upper()))
    await db.commit()
    return {"status": "success"}

@router.post("/delete-list")
async def delete_watchlist(name: str, db: AsyncSession = Depends(get_async_db)):
    """Deletes an entire watchlist collection by name."""
    if name == "Default":
        raise HTTPException(status_code=400, detail="Cannot delete the Default watchlist.")
    await db.execute(delete(WatchlistMember).filter(WatchlistMember.list_name == name))
    await db.commit()
    return {"status": "success", "deleted": name}

async def get_watchlist_symbols(name: str, db: AsyncSession) -> List[str]:
    """Internal helper to get symbols for a watchlist."""
    result = await db.execute(select(WatchlistMember).filter(WatchlistMember.list_name == name))
    return sorted(list(set([i.symbol for i in result.scalars().all()])))
