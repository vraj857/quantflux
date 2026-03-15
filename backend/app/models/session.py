from sqlalchemy import Column, Integer, String, DateTime, JSON
from app.database import Base
from datetime import datetime

class BrokerSession(Base):
    """
    Stores active and historical broker sessions.
    This allows the platform to persist login states across restarts.
    """
    __tablename__ = "broker_sessions"

    id = Column(Integer, primary_key=True, index=True)
    broker = Column(String, index=True)  # "FYERS" or "ZERODHA"
    access_token = Column(String)  # Should ideally be encrypted in production
    refresh_token = Column(String, nullable=True)
    
    # Session Metadata
    user_name = Column(String, nullable=True)
    user_id = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    
    # Store any extra broker-specific payload (e.g. login response JSON)
    extra_data = Column(JSON, nullable=True)
    
    is_active = Column(Integer, default=1)  # 1=Active, 0=Expired/Logged Out
