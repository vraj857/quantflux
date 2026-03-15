from sqlalchemy import Column, Integer, String, Float, Date, UniqueConstraint
from app.database import Base

class SlotData(Base):
    """
    Stores aggregated custom-interval OHLCV data.
    Ensures that data for specific symbols and timeframes is persisted and unique.
    """
    __tablename__ = "slot_data"
    
    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    date = Column(Date, index=True)
    slot_label = Column(String)
    open = Column(Float)
    high = Column(Float)
    low = Column(Float)
    close = Column(Float)
    volume = Column(Integer)
    percent_change = Column(Float)
    volume_strength = Column(Float)
    phase = Column(String, nullable=True)

    __table_args__ = (
        UniqueConstraint('symbol', 'date', 'slot_label', name='_symbol_date_slot_uc'),
    )
