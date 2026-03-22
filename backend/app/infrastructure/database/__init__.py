import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from .base import Base

# Use aiosqlite for async support
DATABASE_URL = "sqlite+aiosqlite:///./market_slots_v4.db"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

# Enable WAL mode for SQLite async
async def init_async_db():
    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        # Register all models for schema creation
        from app.models.profile import PhaseDNA
        from app.models.session import BrokerSession
        from app.models.watchlist import WatchlistMember
        from app.models.trade import TradeLog
        from app.models.instrument import Instrument
        from app.models.slot import SlotData
        await conn.run_sync(Base.metadata.create_all)

# Global session maker
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


async def get_async_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
