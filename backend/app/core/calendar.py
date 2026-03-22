from datetime import datetime, time, timedelta
from typing import Tuple
from app.constants import NSE_HOLIDAYS_2026

class MarketCalendar:
    """
    Utility to handle Indian market session timings and holidays.
    """
    
    @staticmethod
    def get_market_status(target_dt: datetime = None) -> Tuple[str, str]:
        """Returns the current trading status and reason (IST)."""
        # Force IST (+5:30)
        now_utc = target_dt or datetime.utcnow()
        now_ist = now_utc + timedelta(hours=5, minutes=30) if not target_dt else now_utc
        
        today_str = now_ist.strftime("%Y-%m-%d")
        curr_time = now_ist.time()

        # Check Weekend
        if now_ist.weekday() >= 5:
            return "CLOSED", "Weekend"
        
        # Check Holiday
        if today_str in NSE_HOLIDAYS_2026:
            return "CLOSED", "Market Holiday"
            
        # Check Hours (09:15 to 15:30 IST)
        m_start = time(9, 15)
        m_end = time(15, 30)
        
        if curr_time < m_start:
            return "CLOSED", "Pre-Market"
        if curr_time > m_end:
            return "CLOSED", "Post-Market"
            
        return "OPEN", "Live Trading"

    @staticmethod
    def is_market_open(target_dt: datetime = None) -> bool:
        status, _ = MarketCalendar.get_market_status(target_dt)
        return status == "OPEN"
