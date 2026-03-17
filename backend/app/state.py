from typing import Optional
from app.broker_management.base import IBroker
from app.core.aggregator import AggregationEngine

class AppState:
    """
    Global application state to hold active broker and aggregator instances.
    """
    def __init__(self):
        from app.core.execution import OrderManager
        self.active_broker: Optional[IBroker] = None
        self.aggregator = AggregationEngine(slot_minutes=25)
        self.active_broker_name: Optional[str] = None # "FYERS" or "ZERODHA"
        self.is_historical_mode: bool = False
        self.phase_dnas: dict = {} # symbol -> benchmarks mapping
        self.order_manager = OrderManager()

# Singleton instance
state = AppState()
