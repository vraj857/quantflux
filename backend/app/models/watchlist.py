from sqlalchemy import Column, Integer, String, UniqueConstraint
from app.infrastructure.database.base import Base

class WatchlistMember(Base):
    """
    Stores symbols associated with specific user-defined watchlists.
    """
    __tablename__ = "watchlist_members"

    id = Column(Integer, primary_key=True, index=True)
    list_name = Column(String, index=True) # e.g., "Default", "Alpha-1"
    symbol = Column(String, index=True)    # Internal symbol or EXCHANGE:SYMBOL
    
    __table_args__ = (
        UniqueConstraint('list_name', 'symbol', name='_list_sym_uc'),
    )
