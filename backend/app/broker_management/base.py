from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import datetime

class IBroker(ABC):
    """
    Unified interface for multi-broker support in QuantFlux.
    This ensures the core engine is decoupled from broker-specific SDKs.
    """
    
    @abstractmethod
    async def authenticate(self, credentials: Dict[str, Any]) -> str:
        """
        Exchanges auth code or API keys for a valid access token.
        Returns the access token and stores it in the session.
        """
        pass

    @abstractmethod
    async def get_profile(self) -> Dict[str, Any]:
        """
        Returns a standardized user profile.
        Expected format: {'name': str, 'client_id': str, 'email': str}
        """
        pass

    @abstractmethod
    async def fetch_history(self, symbol: str, interval: str, start: str, end: str) -> List[Dict[str, Any]]:
        """
        Fetches historical OHLCV data. 
        Interval should be standardized (e.g., '1m', '5m', 'day').
        Returns a list of dicts: [{'date': datetime, 'open': float, ...}]
        """
        pass

    @abstractmethod
    async def start_ticker(self, symbols: List[str], on_tick: callable):
        """
        Initializes and starts the live WebSocket data stream.
        on_tick should be a callback that accepts standardized tick data.
        """
        pass

    @abstractmethod
    async def stop_ticker(self):
        """
        Gracefully stops the WebSocket and cleans up resources.
        """
        pass

    @abstractmethod
    def is_connected(self) -> bool:
        """Checks if the broker session and ticker are active."""
        pass

    @abstractmethod
    async def validate_token(self) -> bool:
        """Verifies if the current access token is still valid with the broker."""
        pass

    @abstractmethod
    async def get_quotes(self, symbols: List[str]) -> List[Dict[str, Any]]:
        """
        Fetches real-time or last-session quotes (LTP, OHLC, 52W High/Low).
        Returns a standardized list of quote objects.
        """
        pass

    @property
    @abstractmethod
    def last_tick_times(self) -> Dict[str, datetime]:
        """Tracks the timestamp of the last received tick per symbol."""
        pass
