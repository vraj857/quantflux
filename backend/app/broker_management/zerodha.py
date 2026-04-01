from app.infrastructure.logging import ql_logger as logging
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.broker_management.base import IBroker
from app.core.rate_limiter import TokenBucket

try:
    from kiteconnect import KiteConnect, KiteTicker
except ImportError:
    KiteConnect = None
    KiteTicker = None

class ZerodhaAdapter(IBroker):
    def __init__(self, api_key: str, api_secret: str):
        self.api_key = api_key
        self.api_secret = api_secret
        self.access_token: Optional[str] = None
        self.api: Optional[Any] = None
        self.kws: Optional[Any] = None
        self.on_tick_callback: Optional[callable] = None
        self._last_tick_times: Dict[str, datetime] = {}
        
        # Zerodha Rate Limit: ~3 requests per second for standard users
        self.rate_limiter = TokenBucket(rate=3, capacity=3)

    @property
    def last_tick_times(self) -> Dict[str, datetime]:
        return self._last_tick_times

    async def authenticate(self, credentials: Dict[str, Any]) -> str:
        """Exchanges request_token for access_token."""
        request_token = credentials.get("request_token")
        if not request_token:
            raise ValueError("request_token is required for Zerodha authentication")

        self.api = KiteConnect(api_key=self.api_key)
        
        # Use to_thread for blocking SDK calls
        data = await asyncio.to_thread(
            self.api.generate_session, 
            request_token, 
            api_secret=self.api_secret
        )
        
        self.access_token = data.get("access_token")
        self.api.set_access_token(self.access_token)
        return self.access_token

    async def get_profile(self) -> Dict[str, Any]:
        await self.rate_limiter.consume()
        profile = await asyncio.to_thread(self.api.profile)
        return {
            "name": profile.get("user_name"),
            "client_id": profile.get("user_id"),
            "email": profile.get("email")
        }

    async def fetch_history(self, symbol: str, interval: str, start: str, end: str) -> List[Dict[str, Any]]:
        await self.rate_limiter.consume()
        # Zerodha needs instrument_token, not symbol string for history
        # Mapping should happen in the core engine fetching from our Instrument model
        token = symbol # Assume token is passed if it's an int/string digit
        
        res = await asyncio.to_thread(
            self.api.historical_data,
            instrument_token=token,
            from_date=start,
            to_date=end,
            interval=interval
        )
        return res # Kite returns [{'date': ..., 'open': ...}] which is close to our standard

    async def start_ticker(self, symbols: List[str], on_tick: callable):
        self.on_tick_callback = on_tick
        self.kws = KiteTicker(api_key=self.api_key, access_token=self.access_token)
        
        # Map tokens: symbols here should be the instrument tokens for Zerodha
        self.tokens_to_subscribe = [int(s) for s in symbols if str(s).isdigit()]

        self.kws.on_connect = self._on_connect
        self.kws.on_ticks = self._on_ticks
        self.kws.connect(threaded=True)

    def _on_connect(self, ws, response):
        logging.info("Zerodha Adapter connected to WS")
        if self.tokens_to_subscribe:
            ws.subscribe(self.tokens_to_subscribe)
            ws.set_mode(ws.MODE_FULL, self.tokens_to_subscribe)

    def _on_ticks(self, ws, ticks):
        if self.on_tick_callback:
            for t in ticks:
                token = t['instrument_token']
                self._last_tick_times[str(token)] = datetime.now()
                # Standardize tick
                tick = {
                    "symbol": token,
                    "ltp": t.get('last_price'),
                    "volume": t.get('volume_traded', 0),
                    "timestamp": t.get('exchange_timestamp')
                }
                loop = asyncio.get_event_loop()
                asyncio.run_coroutine_threadsafe(self.on_tick_callback(tick), loop)

    async def stop_ticker(self):
        if self.kws:
            await asyncio.to_thread(self.kws.close)

    def is_connected(self) -> bool:
        return self.access_token is not None

    async def get_quotes(self, symbols: List[str]) -> List[Dict[str, Any]]:
        """Implementation using self.api.quote."""
        if not self.api: return []
        await self.rate_limiter.consume()
        try:
            # Map back to Kite tokens if passed as strings
            kite_syms = [int(s) if str(s).isdigit() else s for s in symbols]
            res = await asyncio.to_thread(self.api.quote, kite_syms)
            
            results = []
            for token, q in res.items():
                ohlc = q.get("ohlc", {})
                results.append({
                    "symbol": str(token),
                    "ltp": q.get("last_price", 0),
                    "open": ohlc.get("open", 0),
                    "high": ohlc.get("high", 0),
                    "low": ohlc.get("low", 0),
                    "close": q.get("last_price", 0),
                    "volume": q.get("volume", 0),
                    "change": q.get("last_price", 0) - ohlc.get("close", 0),
                    "change_pct": round(((q.get("last_price", 0) - ohlc.get("close", 0)) / ohlc.get("close", 1)) * 100, 2),
                    "high_52week": q.get("ohlc", {}).get("high", 0), # Placeholder
                    "low_52week": q.get("ohlc", {}).get("low", 0)
                })
            return results
        except Exception as e:
            logging.error(f"Zerodha get_quotes exception: {e}")
            return []

    async def validate_token(self) -> bool:
        try:
            profile = await self.get_profile()
            is_valid = bool(profile and profile.get("client_id"))
            if not is_valid:
                logging.warning(f"Zerodha token validation failed: Profile returned {profile}")
            return is_valid
        except Exception as e:
            logging.error(f"Zerodha token validation exception: {e}")
            return False
