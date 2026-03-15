import logging
from datetime import datetime, timedelta
from app.broker_management.base import IBroker
from app.core.aggregator import AggregationEngine
from typing import List

class ResilienceManager:
    """
    Handles WebSocket reconnections and gap filling.
    Ensures data continuity by fetching missed candles via REST API.
    """
    
    def __init__(self, broker: IBroker, aggregator: AggregationEngine):
        self.broker = broker
        self.aggregator = aggregator

    async def fill_all_gaps(self, symbols: List[str]):
        """
        Iterates through symbols and fills gaps since the last received tick.
        """
        now = datetime.now()
        for symbol in symbols:
            last_tick = self.broker.last_tick_times.get(symbol)
            if not last_tick:
                continue
            
            gap_duration = now - last_tick
            if gap_duration > timedelta(minutes=1):
                logging.info(f"Gap detected for {symbol}: {gap_duration.total_seconds() / 60:.2f} minutes.")
                await self._fill_gap(symbol, last_tick, now)

    async def _fill_gap(self, symbol: str, start: datetime, end: datetime):
        """Fetches and processes missed 1m candles."""
        try:
            # Standardize date format for broker history APIs
            start_str = start.strftime("%Y-%m-%d %H:%M:%S")
            end_str = end.strftime("%Y-%m-%d %H:%M:%S")
            
            candles = await self.broker.fetch_history(symbol, "1", start_str, end_str)
            if candles:
                await self.aggregator.catch_up(symbol, candles)
                logging.info(f"Gap filled for {symbol} with {len(candles)} 1m candles.")
        except Exception as e:
            logging.error(f"Failed to fill gap for {symbol}: {e}")
