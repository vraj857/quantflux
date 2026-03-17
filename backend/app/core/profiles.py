import logging
from typing import Dict, Optional, List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.profile import PhaseDNA

class ProfileManager:
    """
    Handles saving and loading of Phase DNA benchmarks.
    """
    
    @staticmethod
    async def get_dna(db: AsyncSession, symbol: str) -> Optional[Dict]:
        """Fetches the DNA profile for a symbol."""
        stmt = select(PhaseDNA).where(PhaseDNA.symbol == symbol)
        result = await db.execute(stmt)
        dna = result.scalars().first()
        return dna.benchmarks if dna else None

    @staticmethod
    async def save_dna(db: AsyncSession, symbol: str, benchmarks: Dict, period: str = "custom") -> bool:
        """Saves or updates the DNA profile for a symbol."""
        try:
            stmt = select(PhaseDNA).where(PhaseDNA.symbol == symbol)
            result = await db.execute(stmt)
            dna = result.scalars().first()
            
            if dna:
                dna.benchmarks = benchmarks
                dna.backtest_period = period
            else:
                dna = PhaseDNA(
                    symbol=symbol,
                    benchmarks=benchmarks,
                    backtest_period=period
                )
                db.add(dna)
                
            await db.commit()
            return True
        except Exception as e:
            logging.error(f"Error saving DNA for {symbol}: {e}")
            await db.rollback()
            return False

    @staticmethod
    async def get_all_active_dnas(db: AsyncSession) -> Dict[str, Dict]:
        """Returns all stored DNA profiles as a mapping for the sentinel."""
        stmt = select(PhaseDNA)
        result = await db.execute(stmt)
        dnas = result.scalars().all()
        return {d.symbol: d.benchmarks for d in dnas}
