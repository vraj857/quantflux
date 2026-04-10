import sqlite3
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# NSE Market session boundaries (IST)
MARKET_OPEN_H, MARKET_OPEN_M = 9, 15
MARKET_CLOSE_H, MARKET_CLOSE_M = 15, 30


class HistoricalDataStore:
    """
    Per-timeframe historical OHLCV persistence engine.

    Strategy: Store candles already aggregated at the exact user-requested
    timeframe (e.g. 25-min rows). A coverage_map tracks what date ranges
    exist per (symbol, timeframe) so subsequent fetches only pull the
    missing gaps from the broker.

    DB: historical_data.db  (new, separate from old history_cache.db)
    """

    def __init__(self, db_path: str = "historical_data.db"):
        self.db_path = db_path
        self._init_db()

    # ─────────────────────────────────── SCHEMA ───────────────────────────────

    def _init_db(self):
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS ohlcv_candles (
                    symbol    TEXT    NOT NULL,
                    timeframe INTEGER NOT NULL,
                    ts        INTEGER NOT NULL,
                    open      REAL,
                    high      REAL,
                    low       REAL,
                    close     REAL,
                    volume    INTEGER,
                    PRIMARY KEY (symbol, timeframe, ts)
                )
            """)
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_sym_tf ON ohlcv_candles(symbol, timeframe)"
            )
            conn.execute("""
                CREATE TABLE IF NOT EXISTS coverage_map (
                    symbol     TEXT    NOT NULL,
                    timeframe  INTEGER NOT NULL,
                    start_ts   INTEGER NOT NULL,
                    end_ts     INTEGER NOT NULL,
                    fetched_at INTEGER NOT NULL,
                    PRIMARY KEY (symbol, timeframe)
                )
            """)
            conn.commit()

    # ─────────────────────────────── PUBLIC API ───────────────────────────────

    def get_candles(
        self,
        symbol: str,
        timeframe: int,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Dict]:
        """
        Read pre-aggregated candles from DB for the given window.
        Returns list of dicts with keys: ts, open, high, low, close, volume.
        """
        start_ts = int(start_dt.timestamp())
        end_ts   = int(end_dt.timestamp())
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.row_factory = sqlite3.Row
                cur = conn.execute(
                    """SELECT ts, open, high, low, close, volume
                       FROM ohlcv_candles
                       WHERE symbol = ? AND timeframe = ?
                         AND ts >= ? AND ts <= ?
                       ORDER BY ts ASC""",
                    (symbol, timeframe, start_ts, end_ts),
                )
                return [dict(r) for r in cur.fetchall()]
        except Exception as e:
            logger.error(f"[HistoricalStore] read error {symbol} tf={timeframe}: {e}")
            return []

    def save_aggregated_candles(
        self,
        symbol: str,
        timeframe: int,
        candles: List[Dict],
    ):
        """
        Persist pre-aggregated candles (each dict must have ts, open, high, low, close, volume).
        Uses INSERT OR IGNORE so re-runs are safe (idempotent).
        """
        if not candles:
            return
        data = [
            (symbol, timeframe, c["ts"], c["open"], c["high"], c["low"], c["close"], c["volume"])
            for c in candles
        ]
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.executemany(
                    """INSERT OR IGNORE INTO ohlcv_candles
                       (symbol, timeframe, ts, open, high, low, close, volume)
                       VALUES (?,?,?,?,?,?,?,?)""",
                    data,
                )
                conn.commit()
        except Exception as e:
            logger.error(f"[HistoricalStore] write error {symbol} tf={timeframe}: {e}")

    def update_coverage(
        self,
        symbol: str,
        timeframe: int,
        start_dt: datetime,
        end_dt: datetime,
    ):
        """
        Upsert the coverage_map row.
        Timestamps are stored as DATE boundaries (start-of-day / end-of-day)
        so the comparison in get_missing_gaps is always deterministic,
        regardless of the exact time the fetch was triggered.
        """
        # Normalize to date boundaries — this eliminates all intraday drift
        start_ts = int(datetime.combine(start_dt.date(), datetime.min.time()).timestamp())
        end_ts   = int(datetime.combine(end_dt.date(),   datetime.max.time().replace(microsecond=0)).timestamp())
        now_ts   = int(datetime.now().timestamp())

        with sqlite3.connect(self.db_path) as conn:
            existing = conn.execute(
                "SELECT start_ts, end_ts FROM coverage_map WHERE symbol=? AND timeframe=?",
                (symbol, timeframe),
            ).fetchone()

            if existing:
                new_start = min(existing[0], start_ts)
                new_end   = max(existing[1], end_ts)
                conn.execute(
                    "UPDATE coverage_map SET start_ts=?, end_ts=?, fetched_at=? WHERE symbol=? AND timeframe=?",
                    (new_start, new_end, now_ts, symbol, timeframe),
                )
            else:
                conn.execute(
                    "INSERT INTO coverage_map (symbol, timeframe, start_ts, end_ts, fetched_at) VALUES (?,?,?,?,?)",
                    (symbol, timeframe, start_ts, end_ts, now_ts),
                )
            conn.commit()


    def get_missing_gaps(
        self,
        symbol: str,
        timeframe: int,
        start_dt: datetime,
        end_dt: datetime,
    ) -> List[Tuple[datetime, datetime]]:
        """
        Returns (gap_start, gap_end) date ranges NOT yet stored in DB.

        KEY FIX: Compares at the DATE level (86400-second granularity) so that
        intraday timestamp drift (e.g. 'now' advancing by 45 seconds between
        two clicks) never triggers a false-positive broker re-fetch.
        """
        # Normalize to whole-day boundaries for comparison
        req_start_date = start_dt.date()
        req_end_date   = end_dt.date()

        try:
            with sqlite3.connect(self.db_path) as conn:
                row = conn.execute(
                    "SELECT start_ts, end_ts FROM coverage_map WHERE symbol=? AND timeframe=?",
                    (symbol, timeframe),
                ).fetchone()
        except Exception as e:
            logger.error(f"[HistoricalStore] coverage read error {symbol}: {e}")
            return [(start_dt, end_dt)]

        if not row:
            # Completely new — fetch everything
            return [(start_dt, end_dt)]

        # Convert stored timestamps to dates for a clean day-level comparison
        cov_start_date = datetime.fromtimestamp(row[0]).date()
        cov_end_date   = datetime.fromtimestamp(row[1]).date()

        gaps = []

        if req_start_date < cov_start_date:
            # Need data before what we have
            gap_end = datetime.combine(cov_start_date - timedelta(days=1), datetime.max.time())
            gap_end = gap_end.replace(microsecond=0)
            if gap_end.date() >= req_start_date:
                gaps.append((start_dt, gap_end))

        if req_end_date > cov_end_date:
            # Need data after what we have — truly a new calendar day, not just time drift
            gap_start = datetime.combine(cov_end_date + timedelta(days=1), datetime.min.time())
            if gap_start.date() <= req_end_date:
                gaps.append((gap_start, end_dt))

        return gaps

    # ─────────────────────────── AGGREGATION HELPER ───────────────────────────

    @staticmethod
    def aggregate_raw_to_slots(
        raw_candles: List[Dict],
        timeframe: int,
    ) -> List[Dict]:
        """
        Aggregates 1-minute raw broker candles into N-minute candle objects.

        Each raw candle dict must have:
            timestamp (int epoch) | open | high | low | close | volume

        Returns list of dicts: { ts, open, high, low, close, volume }
        only for bars that fall within NSE market hours [09:15 – 15:30).
        """
        from datetime import timedelta

        slots: Dict[int, Dict] = {}  # keyed by slot_start epoch

        for c in raw_candles:
            ts = c.get("timestamp") or c.get("date") or c.get("ts")
            if isinstance(ts, datetime):
                dt = ts
            elif isinstance(ts, (int, float)):
                dt = datetime.fromtimestamp(int(ts))
            elif isinstance(ts, str):
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).replace(tzinfo=None)
                except Exception:
                    continue
            else:
                continue

            # Filter to market hours only
            m_start = dt.replace(hour=MARKET_OPEN_H, minute=MARKET_OPEN_M, second=0, microsecond=0)
            m_end   = dt.replace(hour=MARKET_CLOSE_H, minute=MARKET_CLOSE_M, second=0, microsecond=0)
            if dt < m_start or dt >= m_end:
                continue

            diff_min   = (dt - m_start).total_seconds() / 60
            slot_idx   = int(diff_min // timeframe)
            slot_start = m_start + timedelta(minutes=slot_idx * timeframe)
            slot_ts    = int(slot_start.timestamp())

            o = c.get("open",  0) or 0
            h = c.get("high",  0) or 0
            l = c.get("low",   0) or 0
            cl= c.get("close", 0) or 0
            v = c.get("volume",0) or 0

            if slot_ts not in slots:
                slots[slot_ts] = {"ts": slot_ts, "open": o, "high": h, "low": l, "close": cl, "volume": v}
            else:
                s = slots[slot_ts]
                s["high"]   = max(s["high"],  h)
                s["low"]    = min(s["low"],   l)
                s["close"]  = cl
                s["volume"] += v

        return sorted(slots.values(), key=lambda x: x["ts"])

    # ──────────────────────────── CONVENIENCE STAT ────────────────────────────

    def get_coverage_info(self, symbol: str, timeframe: int) -> Optional[Dict]:
        """Returns coverage metadata for a symbol/timeframe or None."""
        try:
            with sqlite3.connect(self.db_path) as conn:
                row = conn.execute(
                    "SELECT start_ts, end_ts, fetched_at FROM coverage_map WHERE symbol=? AND timeframe=?",
                    (symbol, timeframe),
                ).fetchone()
            if row:
                return {
                    "start": datetime.fromtimestamp(row[0]).strftime("%Y-%m-%d"),
                    "end":   datetime.fromtimestamp(row[1]).strftime("%Y-%m-%d"),
                    "fetched_at": datetime.fromtimestamp(row[2]).strftime("%Y-%m-%d %H:%M:%S"),
                }
        except Exception:
            pass
        return None
