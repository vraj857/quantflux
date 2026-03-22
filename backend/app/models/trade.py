from sqlalchemy import Column, Integer, String, Float, DateTime, Date
from app.infrastructure.database.base import Base
from datetime import datetime

class TradeLog(Base):
    """
    Standardized model for trade book analytics.
    Handles data uploaded from CSV or generated during live trading.
    """
    __tablename__ = "trade_logs"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    side = Column(String)  # "BUY" or "SELL"
    order_type = Column(String)  # "MIS", "CNC", "NRML"
    
    quantity = Column(Integer)
    price = Column(Float)
    trigger_price = Column(Float, nullable=True)
    
    order_id = Column(String, unique=True, index=True)
    exchange_order_id = Column(String, nullable=True)
    
    order_timestamp = Column(DateTime, index=True)
    trade_date = Column(Date, index=True)  # Useful for daily p&l grouping
    
    broker = Column(String) # "FYERS", "ZERODHA"
    broker_charges = Column(Float, default=0.0) # Calculated later by stats engine
    
    pnl = Column(Float, nullable=True) # Net P&L for closed positions
    status = Column(String)  # "COMPLETE", "REJECTED", "CANCELLED"
