import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy import text
from sqlalchemy.orm import declarative_base

# Use aiosqlite for async support
DATABASE_URL = "sqlite+aiosqlite:///./market_slots_v2.db"

engine = create_async_engine(
    DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False},
)

# Enable WAL mode for SQLite async
async def init_async_db():
    async with engine.begin() as conn:
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        # Ensure the PhaseDNA model is imported so it's registered in metadata
        from app.models.profile import PhaseDNA
        await conn.run_sync(Base.metadata.create_all)

# Global session maker
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)

Base = declarative_base()

async def get_async_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
