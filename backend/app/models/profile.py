from sqlalchemy import Column, String, Float, JSON, DateTime, Integer
from app.database import Base
from datetime import datetime

class PhaseDNA(Base):
    """
    Stores the 'Phase DNA' (benchmarks) for a particular symbol.
    Extracted from historical backtesting and used for Live Sentinel.
    """
    __tablename__ = "phase_dna"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, unique=True, index=True)
    
    # JSON field to store dict of phase stats (benchmarks)
    # Format: { "Morning Phase": { "min_strength": 65, "min_vol": 10, ... }, ... }
    benchmarks = Column(JSON, nullable=False)
    
    # Metadata
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    backtest_period = Column(String, nullable=True)  # e.g., "1 Year", "30 Days"
    performance_score = Column(Float, default=0.0) # Overall rating derived from backtest

    def to_dict(self):
        return {
            "symbol": self.symbol,
            "benchmarks": self.benchmarks,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "backtest_period": self.backtest_period,
            "performance_score": self.performance_score
        }
