from sqlalchemy import Column, Integer, String, BigInteger, UniqueConstraint
from app.database import Base

class Instrument(Base):
    """
    Master mapping table for symbols across different brokers.
    Maps internal simplified symbols (e.g., RELIANCE) to broker tokens/tickers.
    """
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)  # Internal symbol: "RELIANCE"
    exchange = Column(String, index=True)  # "NSE", "NFO", "BSE"
    
    # Zerodha Mapping
    kite_token = Column(BigInteger, unique=True, index=True, nullable=True)
    
    # Fyers Mapping
    fyers_ticker = Column(String, unique=True, index=True, nullable=True)
    
    # Metadata
    instrument_type = Column(String)  # "EQ", "FUT", "OPT"
    expiry = Column(String, nullable=True)
    
    __table_args__ = (
        UniqueConstraint('symbol', 'exchange', name='_sym_exch_uc'),
    )
