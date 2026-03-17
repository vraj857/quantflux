import sqlite3
import json
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional

class HistoryCache:
    """
    Local SQLite cache for historical candle data to avoid redundant broker API calls
    and handle multi-year data scaling.
    """
    def __init__(self, db_path: str = "history_cache.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS candles (
                    symbol TEXT,
                    interval TEXT,
                    timestamp INTEGER,
                    open REAL,
                    high REAL,
                    low REAL,
                    close REAL,
                    volume INTEGER,
                    PRIMARY KEY (symbol, interval, timestamp)
                )
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_sym_int ON candles(symbol, interval)")

    def get_candles(self, symbol: str, interval: str, start_ts: int, end_ts: int) -> List[Dict]:
        """Fetches candles from local cache."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cursor = conn.execute(
                    "SELECT * FROM candles WHERE symbol = ? AND interval = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC",
                    (symbol, interval, start_ts, end_ts)
                )
                rows = cursor.fetchall()
                return [dict(r) for r in rows]
        except Exception as e:
            logging.error(f"Cache read error for {symbol}: {e}")
            return []

    def save_candles(self, symbol: str, interval: str, candles: List[Dict]):
        """Saves candles to local cache, ignoring duplicates."""
        if not candles: return
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Deduplicate and insert
                data = []
                for c in candles:
                    ts = c.get('timestamp') or c.get('date')
                    if isinstance(ts, datetime): ts = int(ts.timestamp())
                    elif isinstance(ts, str): ts = int(datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp())
                    
                    data.append((
                        symbol, interval, ts,
                        c.get('open'), c.get('high'), c.get('low'), c.get('close'), c.get('volume')
                    ))
                
                conn.executemany(
                    "INSERT OR IGNORE INTO candles (symbol, interval, timestamp, open, high, low, close, volume) VALUES (?,?,?,?,?,?,?,?)",
                    data
                )
                conn.commit()
        except Exception as e:
            logging.error(f"Cache write error for {symbol}: {e}")

    def get_missing_ranges(self, symbol: str, interval: str, start_dt: datetime, end_dt: datetime) -> List[tuple]:
        """
        Identify ranges not covered by the cache.
        For simplicity in this version, we'll return the full range if any significant gap exists,
        or we check the first and last timestamps.
        """
        start_ts = int(start_dt.timestamp())
        end_ts = int(end_dt.timestamp())
        
        cached = self.get_candles(symbol, interval, start_ts, end_ts)
        if not cached:
            return [(start_dt, end_dt)]
        
        # Check coverage (simple check: if total duration / interval count matches)
        # For a more robust implementation, we'd check every gap.
        # For now, let's just return what's missing at the edges.
        
        missing = []
        first_cached = datetime.fromtimestamp(cached[0]['timestamp'])
        last_cached = datetime.fromtimestamp(cached[-1]['timestamp'])
        
        if first_cached > start_dt + timedelta(minutes=5):
            missing.append((start_dt, first_cached - timedelta(minutes=1)))
        
        if last_cached < end_dt - timedelta(minutes=5):
            missing.append((last_cached + timedelta(minutes=1), end_dt))
            
        return missing
