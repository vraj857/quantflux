from app.infrastructure.logging import ql_logger as logging
import asyncio
from typing import List, Dict, Any, Optional
from app.broker_management.base import IBroker
from app.core.rate_limiter import TokenBucket
import os
from datetime import datetime, timedelta

try:
    from fyers_apiv3 import fyersModel
    from fyers_apiv3.FyersWebsocket import data_ws
except ImportError:
    fyersModel = None
    data_ws = None

class FyersAdapter(IBroker):
    def __init__(self, client_id: str, secret_key: str, redirect_uri: str):
        self.client_id = f"{client_id}-100" if "-" not in client_id else client_id
        self.secret_key = secret_key
        self.redirect_uri = redirect_uri
        self.access_token: Optional[str] = None
        self.api: Optional[Any] = None
        self.ws: Optional[Any] = None
        self.on_tick_callback: Optional[callable] = None
        self.ws_connected: bool = False
        self.symbols_to_subscribe: List[str] = []
        self._last_tick_times: Dict[str, datetime] = {}
        self.loop: Optional[asyncio.AbstractEventLoop] = None # Store main loop handle
        
        # Tiered Log Path
        from config import LOGS_DIR
        self.log_path = os.path.join(LOGS_DIR, "broker")
        if not os.path.exists(self.log_path):
            os.makedirs(self.log_path, exist_ok=True)
            
        # Fyers Rate Limit: ~10 requests per second for standard users
        self.rate_limiter = TokenBucket(rate=10, capacity=10)

    @property
    def last_tick_times(self) -> Dict[str, datetime]:
        return self._last_tick_times

    async def authenticate(self, credentials: Dict[str, Any]) -> str:
        """Exchanges auth_code for access_token."""
        auth_code = credentials.get("auth_code")
        if not auth_code:
            raise ValueError("auth_code is required for Fyers authentication")

        session = fyersModel.SessionModel(
            client_id=self.client_id,
            secret_key=self.secret_key,
            redirect_uri=self.redirect_uri,
            response_type="code",
            grant_type="authorization_code"
        )
        session.set_token(auth_code)
        
        # Use to_thread since generate_token is typically blocking
        response = await asyncio.to_thread(session.generate_token)
        
        if response.get("s") == "ok":
            self.access_token = response.get("access_token")
            self.api = fyersModel.FyersModel(
                client_id=self.client_id, 
                token=self.access_token, 
                is_async=False, 
                log_path=self.log_path
            )
            return self.access_token
        else:
            raise Exception(f"Fyers Authentication Failed: {response.get('message')}")

    async def get_profile(self) -> Dict[str, Any]:
        await self.rate_limiter.consume()
        profile = await asyncio.to_thread(self.api.get_profile)
        if profile.get("s") == "ok":
            data = profile.get("data", {})
            return {
                "name": data.get("name"),
                "client_id": data.get("fy_id"),
                "email": data.get("email_id")
            }
        return {}

    def _normalize_date(self, date_str: str) -> str:
        """Converts various date formats (DD/MM/YY, DD-MM-YYYY, YYYY-MM-DD HH:MM:SS) to YYYY-MM-DD."""
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d", "%d/%m/%y", "%d/%m/%Y", "%d-%m-%Y"):
            try:
                return datetime.strptime(date_str, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return date_str # Fallback

    def _normalize_symbol(self, symbol: str) -> str:
        """Appends -EQ only for cash stocks, leaving F&O symbols untouched."""
        if not symbol.startswith("NSE:") or "-" in symbol:
            return symbol
            
        # Use regex to identify F&O (YYYY MMM FUT or YYYY MMM STRIKE CE/PE)
        import re
        is_fo = bool(re.search(r"\d{2}[A-Z]{3}(FUT|\d+(CE|PE))$", symbol))
        if is_fo:
            return symbol
            
        return f"{symbol}-EQ"

    async def fetch_history(self, symbol: str, interval: str, start: str, end: str) -> List[Dict[str, Any]]:
        """Standardizes Fyers history response with support for 100-day chunking."""
        await self.rate_limiter.consume()
        
        fyers_symbol = self._normalize_symbol(symbol)
            
        start_date = datetime.strptime(self._normalize_date(start), "%Y-%m-%d")
        end_date = datetime.strptime(self._normalize_date(end), "%Y-%m-%d")
        
        # Fyers limit: 100 days for 1-minute data
        MAX_DAYS = 99 # Using slightly less for safety
        
        all_candles = []
        current_start = start_date
        
        while current_start <= end_date:
            current_end = min(current_start + timedelta(days=MAX_DAYS), end_date)
            
            data = {
                "symbol": fyers_symbol,
                "resolution": interval,
                "date_format": "1", # yyyy-mm-dd
                "range_from": current_start.strftime("%Y-%m-%d"),
                "range_to": current_end.strftime("%Y-%m-%d"),
                "cont_flag": "1"
            }
            
            res = await asyncio.to_thread(self.api.history, data=data)
            
            if res.get("s") == "ok":
                candles = res.get("candles", [])
                all_candles.extend(candles)
            else:
                logging.error(f"Fyers History Chunk Error [{current_start} - {current_end}]: {res}")
                # If one chunk fails, we return what we have so far
                break
                
            current_start = current_end + timedelta(days=1)
            # Sleep slightly between chunks to stay within rate limits for long fetches
            await asyncio.sleep(0.1)
            
        # Convert [[ts, o, h, l, c, v], ...] to list of dicts
        return [
            {
                "timestamp": c[0],
                "open": c[1],
                "high": c[2],
                "low": c[3],
                "close": c[4],
                "volume": c[5]
            } for c in all_candles
        ]

    async def start_ticker(self, symbols: List[str], on_tick: callable):
        # 1. Properly stop any existing socket
        if self.ws:
            logging.info("Stopping existing Fyers WS before restarting...")
            await self.stop_ticker()
            await asyncio.sleep(0.5) # Give it time to close

        self.on_tick_callback = on_tick
        self.loop = asyncio.get_running_loop() # Capture current loop for background callbacks
        access_token_full = f"{self.client_id}:{self.access_token}"
        
        self.symbols_to_subscribe = []
        self._reverse_symbol_map = {}
        for sym in symbols:
            fyers_sym = self._normalize_symbol(sym)
            self.symbols_to_subscribe.append(fyers_sym)
            self._reverse_symbol_map[fyers_sym] = sym
        
        self.ws = data_ws.FyersDataSocket(
            access_token=access_token_full,
            log_path=self.log_path,
            litemode=False,
            reconnect=True,
            on_connect=self._on_connect,
            on_message=self._on_message,
            on_error=self._on_error,
            on_close=self._on_close
        )
        # WS connect is blocking, run in thread
        import threading
        t = threading.Thread(target=self.ws.connect, daemon=True)
        t.start()

    def _on_connect(self):
        self.ws_connected = True
        logging.info(f"Fyers Adapter connected to WS. Subscribing to {len(self.symbols_to_subscribe)} symbols...")
        if self.symbols_to_subscribe:
            # Fyers V3 limits: 50 symbols per subscribe request
            CHUNK_SIZE = 50
            for i in range(0, len(self.symbols_to_subscribe), CHUNK_SIZE):
                batch = self.symbols_to_subscribe[i:i+CHUNK_SIZE]
                logging.info(f"Fyers WS Batch Subscribe: {len(batch)} symbols...")
                self.ws.subscribe(symbols=batch, data_type="SymbolUpdate")

    def _on_message(self, message):
        if self.on_tick_callback:
            if isinstance(message, dict) and 'symbol' in message:
                fyers_sym = message['symbol']
                app_sym = getattr(self, '_reverse_symbol_map', {}).get(fyers_sym, fyers_sym)
                
                self._last_tick_times[app_sym] = datetime.now()
                tick = {
                    "symbol": app_sym,
                    "ltp": message.get('ltp'),
                    "volume": message.get('vol_traded_today', 0),
                    "timestamp": message.get('timestamp')
                }
                # Handle async callback from sync SDK thread safely
                if self.loop:
                    asyncio.run_coroutine_threadsafe(self.on_tick_callback(tick), self.loop)
                else:
                    logging.error("Fyers WS: Cannot process tick - No event loop handle!")

    def _on_error(self, message):
        logging.error(f"Fyers WS Error: {message}")
        # If the error involves the loop being closed, we log it but don't crash

    def _on_close(self):
        self.ws_connected = False
        logging.info("Fyers WS Connection Closed")

    async def stop_ticker(self):
        if self.ws:
            try:
                await asyncio.to_thread(self.ws.close)
            except Exception as e:
                logging.error(f"Error closing Fyers WS: {e}")
            finally:
                self.ws = None
        self.ws_connected = False
        self.symbols_to_subscribe = []

    def is_connected(self) -> bool:
        return self.access_token is not None

    def get_subscribed_symbols(self) -> List[str]:
        """Returns the list of symbols currently subscribed to the WS feed."""
        return list(self.symbols_to_subscribe)

    async def get_quotes(self, symbols: List[str]) -> List[Dict[str, Any]]:
        """
        Fetches today's OHLCV + LTP via the Fyers REST quotes endpoint.
        Works 24/7 — returns last session's data even after market close.
        """
        await self.rate_limiter.consume()
        # Convert internal symbols to Fyers format (NSE:SYM-EQ)
        fyers_syms = []
        reverse_map = {}
        for sym in symbols:
            f_sym = self._normalize_symbol(sym)
            fyers_syms.append(f_sym)
            reverse_map[f_sym] = sym

        if not fyers_syms:
            return []

        try:
            data = {"symbols": ",".join(fyers_syms)}
            res = await asyncio.to_thread(self.api.quotes, data=data)
            if res.get("s") != "ok":
                logging.error(f"Fyers Quotes Error: {res}")
                return []

            results = []
            for item in res.get("d", []):
                q = item.get("v", {})
                f_sym = item.get("n", "")
                app_sym = reverse_map.get(f_sym, f_sym)
                results.append({
                    "symbol": app_sym,
                    "ltp": q.get("lp", 0),
                    "open": q.get("open_price", 0),
                    "high": q.get("high_price", 0),
                    "low": q.get("low_price", 0),
                    "close": q.get("prev_close_price", 0),
                    "volume": q.get("volume", 0),
                    "change": q.get("ch", 0),
                    "change_pct": round(q.get("chp", 0), 2),
                    "high_52week": q.get("high_52week", 0),
                    "low_52week": q.get("low_52week", 0)
                })
            return results
        except Exception as e:
            logging.error(f"Fyers get_quotes exception: {e}")
            return []

    async def validate_token(self) -> bool:
        try:
            profile = await self.get_profile()
            is_valid = bool(profile and profile.get("client_id"))
            if not is_valid:
                logging.warning(f"Fyers token validation failed: Profile returned {profile}")
            return is_valid
        except Exception as e:
            logging.error(f"Fyers token validation exception: {e}")
            return False
