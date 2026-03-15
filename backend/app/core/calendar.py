from datetime import datetime, time
from typing import Tuple
from app.constants import NSE_HOLIDAYS_2026

class MarketCalendar:
    """
    Utility to handle Indian market session timings and holidays.
    """
    
    @staticmethod
    def get_market_status(target_dt: datetime = None) -> Tuple[str, str]:
        """Returns the current trading status and reason."""
        now = target_dt or datetime.now()
        today_str = now.strftime("%Y-%m-%d")
        
        # Check Weekend
        if now.weekday() >= 5: # Sat=5, Sun=6
            return "CLOSED", "Weekend"
        
        # Check Holiday
        if today_str in NSE_HOLIDAYS_2026:
            return "CLOSED", "Market Holiday"
            
        # Check Hours
        m_start = now.replace(hour=9, minute=15, second=0, microsecond=0)
        m_end = now.replace(hour=15, minute=30, second=0, microsecond=0)
        
        if now < m_start:
            return "CLOSED", "Pre-Market"
        if now > m_end:
            return "CLOSED", "Post-Market"
            
        return "OPEN", "Live Trading"

    @staticmethod
    def is_market_open(target_dt: datetime = None) -> bool:
        status, _ = MarketCalendar.get_market_status(target_dt)
        return status == "OPEN"
