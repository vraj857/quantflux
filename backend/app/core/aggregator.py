"""
QuantFlux Core Aggregation Engine
Version: 2.1.0
Description: High-performance time-slot aggregator for real-time market data.
             Handles candle synthesis, percent change calculation, and volume strength analysis.
"""
import logging
import json
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, time, timedelta
from sqlalchemy import case, func

# Avoid circular imports
from app.constants import SLOT_SIZE_MINUTES, TIME_SLOTS_25

class AggregationEngine:
    """
    Enterprise-Grade Aggregation Engine for Real-Time Market Data.
    Synchronizes Live Feed and Historical Data with 100% IST Parity.
    """
    
    def __init__(self, slot_minutes: int = 25):
        self._slot_minutes = slot_minutes
        self.current_slot_labels = self._generate_slot_labels()
        # O(1) Indexing for high-frequency tick lookups
        self.label_to_idx = {lbl: i for i, lbl in enumerate(self.current_slot_labels)}
        
        self.state = {}       # Core aggregation state (for candles)
        self.live_state = {}  # Real-time state (for dashboard grid)
        self.live_data = {}   # Raw tick data
        self._dirty_symbols = set() # Optimized broadcasting flag
        self._payload_cache = {"data": {}, "daily_summary": {}} # High-speed serialization cache
        self._slot_buffer = []      # Batched DB persistence queue
        self.session_date = self._get_ist_now().date()

    @property
    def slot_minutes(self):
        return self._slot_minutes

    @slot_minutes.setter
    def slot_minutes(self, value):
        self._slot_minutes = value
        self.current_slot_labels = self._generate_slot_labels()
        self.label_to_idx = {lbl: i for i, lbl in enumerate(self.current_slot_labels)}
        self.reset_live_state()

    def _generate_slot_labels(self) -> List[str]:
        labels = []
        d = datetime.now().replace(hour=9, minute=15, second=0, microsecond=0)
        end_d = datetime.now().replace(hour=15, minute=30, second=0, microsecond=0)
        while d < end_d:
            labels.append(d.strftime("%H:%M"))
            d += timedelta(minutes=self._slot_minutes)
        return labels

    def _normalize_symbol(self, symbol: str) -> str:
        """Unifies symbols by stripping broker-specific suffixes (e.g., -EQ)."""
        if not symbol: return ""
        return symbol.replace("-EQ", "").strip()

    def reset_state(self, symbol: Optional[str] = None):
        if symbol:
            norm_sym = self._normalize_symbol(symbol)
            self.state.pop(norm_sym, None)
            self.live_state.pop(norm_sym, None)
        else:
            self.state = {}
            self.live_state = {}

    def _get_ist_now(self, dt: Optional[datetime] = None) -> datetime:
        """Returns the current IST time (+5:30)."""
        if dt:
            # Historical candles from broker are already normalized to local time or UTC.
            # The OS fromtimestamp() already handles local timezone (IST in this case).
            return dt
        return datetime.utcnow() + timedelta(hours=5, minutes=30)

    def _get_slot_label(self, dt: Optional[datetime] = None) -> str:
        """Determines the current active dynamic slot label (IST)."""
        ist_now = self._get_ist_now(dt)
        curr_time = ist_now.time()
        m_start_time = time(9, 15)
        
        if curr_time < m_start_time:
            return "09:15"
        
        # Calculate minutes since 09:15 IST
        elapsed = (ist_now.hour * 60 + ist_now.minute) - (9 * 60 + 15)
        slot_idx = elapsed // self.slot_minutes
        slot_idx = max(0, min(len(self.current_slot_labels) - 1, slot_idx))
        
        return self.current_slot_labels[slot_idx] if slot_idx < len(self.current_slot_labels) else self.current_slot_labels[-1]

    async def replay_candles(self, symbol: str, candles: List[Dict]):
        """
        Warms up the aggregator by replaying historical 1-minute candles for the current day.
        This provides the 'Instant Backfill' the user expects when opening mid-session.
        """
        if not candles: return
        symbol = self._normalize_symbol(symbol)
        logging.info(f"Aggregator: Replaying {len(candles)} 1m candles for {symbol} backfill...")
        for candle in candles:
            # We treat the candle close as a 'tick' for the aggregator's 25-min slot logic
            # This correctly populates all previously closed slots since 09:15 IST
            await self.process_candle(symbol, candle)
        
        logging.info(f"Aggregator: Backfill complete for {symbol}.")
        
        # Trigger broadcast so the UI sees the backfilled slots immediately
        from app.state import state
        state._needs_broadcast = True

    def reset_live_state(self):
        """Clears all in-memory live data for a clean session start."""
        logging.info("Aggregator: Performing clean session reset.")
        self.live_data = {}
        self.live_state = {}
        self._payload_cache = {"data": {}, "daily_summary": {}}
        self._dirty_symbols.clear()

    def set_active_symbols(self, symbols: List[str]):
        """
        Sets the active symbol set for the dashboard.
        Prunes any symbols from the internal state that are not in the new list.
        """
        norm_symbols = [self._normalize_symbol(s) for s in symbols]
        
        # 1. Prune Live State: Remove symbols not in the new set
        current_live_symbols = list(self.live_state.keys())
        for sym in current_live_symbols:
            if sym not in norm_symbols:
                self.live_state.pop(sym, None)
                self.live_data.pop(sym, None)
                # Also prune from the high-speed payload cache
                self._payload_cache["data"].pop(sym, None)
                self._payload_cache["daily_summary"].pop(sym, None)
        
        # 2. Initialize the new set
        self.initialize_symbols(symbols)
        
        logging.info(f"Aggregator: Active symbols updated. Count: {len(self.live_state)}")

    def initialize_symbols(self, symbols: List[str]):
        """Pre-populates the live_state keys for the given symbols to ensure the grid renders immediately."""
        logging.info(f"Aggregator: Initializing grid structure for {len(symbols)} symbols.")
        for symbol in symbols:
            norm_sym = self._normalize_symbol(symbol)
            if norm_sym not in self.live_state:
                n_slots = len(self.current_slot_labels)
                self.live_state[norm_sym] = {
                    "price": [None] * n_slots,
                    "price_open": [None] * n_slots,
                    "price_high": [None] * n_slots,
                    "price_low": [None] * n_slots,
                    "price_move": [0.0] * n_slots,
                    "percent_change": [0.0] * n_slots,
                    "volume": [0] * n_slots,
                    "volume_strength": [100.0] * n_slots,
                    "slot_opens": [None] * n_slots,
                    "last_total_volume": 0
                }

    async def add_tick(self, tick: Dict[str, Any]):
        """
        Processes a new incoming tick and bifurgates it into the correct dashboard slot.
        """
        ist_now = self._get_ist_now()
        
        # --- Session Lifecycle Management: Handle Day Change ---
        if ist_now.date() > self.session_date:
            logging.info(f"Aggregator: New session detected ({ist_now.date()}). Performing auto-reset.")
            self.reset_live_state()
            self.session_date = ist_now.date()
            
        symbol = self._normalize_symbol(tick.get("symbol", ""))
        ltp = tick.get("ltp", 0.0)
        total_volume = tick.get("volume", 0)
        
        # Ensure symbol exists in life data
        if symbol not in self.live_data:
            self.live_data[symbol] = {
                "price": [], "price_move": [], "percent_change": [], 
                "volume": [], "volume_strength": [], "last_tick": {}
            }

        # Update the 'Last Updated' tick state immediately
        self.live_data[symbol]["last_tick"] = {"ltp": ltp, "volume": total_volume}
        
        # Mark dirty for lazy payload generation
        self._dirty_symbols.add(symbol)
        
        # Trigger an immediate broadcast for true tick-by-tick '1ms' feel
        from app.state import state
        state._needs_broadcast = True

        slot_label = self._get_slot_label()
        slot_idx = self.label_to_idx.get(slot_label, 0)
        
        if symbol not in self.live_state:
            n_slots = len(self.current_slot_labels)
            self.live_state[symbol] = {
                "price": [None] * n_slots,
                "price_open": [None] * n_slots,
                "price_high": [None] * n_slots,
                "price_low": [None] * n_slots,
                "price_move": [0.0] * n_slots,
                "percent_change": [0.0] * n_slots,
                "volume": [0] * n_slots,
                "volume_strength": [100.0] * n_slots,
                "slot_opens": [None] * n_slots,
                "last_total_volume": total_volume
            }

        symbol_data = self.live_state[symbol]
        # 1. Update Reference Open (First price of the slot)
        if symbol_data["slot_opens"][slot_idx] is None:
            symbol_data["slot_opens"][slot_idx] = ltp
            symbol_data["price_open"][slot_idx] = ltp
            symbol_data["price_high"][slot_idx] = ltp
            symbol_data["price_low"][slot_idx] = ltp

        # 2. Update Primary Metrics
        symbol_data["price"][slot_idx] = ltp
        # Update High/Low
        if symbol_data["price_high"][slot_idx] is None or ltp > symbol_data["price_high"][slot_idx]:
            symbol_data["price_high"][slot_idx] = ltp
        if symbol_data["price_low"][slot_idx] is None or ltp < symbol_data["price_low"][slot_idx]:
            symbol_data["price_low"][slot_idx] = ltp
        
        # 3. Update Relative Metrics (Tick-by-Tick logic)
        slot_open = symbol_data["slot_opens"][slot_idx]
        inr_move = round(ltp - slot_open, 2)
        pc_change = round((inr_move / slot_open * 100), 2) if slot_open > 0 else 0.0
        
        symbol_data["price_move"][slot_idx] = inr_move
        symbol_data["percent_change"][slot_idx] = pc_change
        
        # 4. Update Volume Delta
        volume_delta = total_volume - symbol_data["last_total_volume"]
        if volume_delta > 0:
            symbol_data["volume"][slot_idx] += volume_delta
            symbol_data["last_total_volume"] = total_volume
        
        # 5. Update Volume Strength (Relative to 09:15 Baseline)
        ref_vol = symbol_data["volume"][0]
        if ref_vol > 0:
            vs = round((symbol_data["volume"][slot_idx] / ref_vol) * 100, 2)
            symbol_data["volume_strength"][slot_idx] = vs
        else:
            symbol_data["volume_strength"][slot_idx] = 100.0

    async def process_candle(self, symbol: str, candle_1m: Dict) -> Optional[Dict]:
        """Rolls a 1-minute candle into the persistent aggregation state AND the live grid state."""
        symbol = self._normalize_symbol(symbol)
        ts = candle_1m['timestamp']
        dt = datetime.fromtimestamp(ts) if isinstance(ts, (int, float)) else ts
        ltp = candle_1m['close']
        vol = candle_1m['volume']
            
        if symbol not in self.state:
            self.state[symbol] = {"current_slot": None, "history": []}
            
        # --- Update Persistence Layer (self.state) ---
        state = self.state[symbol]
        slot_label = self._get_slot_label(dt)
        
        if not state["current_slot"] or state["current_slot"]["label"] != slot_label:
            completed_slot = state["current_slot"]
            state["current_slot"] = {
                "label": slot_label,
                "open": candle_1m['open'], "high": candle_1m['high'], "low": candle_1m['low'], "close": ltp,
                "volume": vol, "count": 1,
                "epoch": ts if isinstance(ts, (int, float)) else ts.timestamp()
            }
            if completed_slot:
                state["history"].append(completed_slot)
                if len(state["history"]) > 60: state["history"].pop(0)
                analytics = self.get_analytics_for_slot(symbol, completed_slot)
                
                # Batched Persistence (Enterprise Performance)
                self._slot_buffer.append((symbol, completed_slot, analytics))
                if len(self._slot_buffer) >= 20: 
                    await self._flush_slot_buffer()
        else:
            s = state["current_slot"]
            s["high"] = max(s["high"], candle_1m["high"])
            s["low"] = min(s["low"], candle_1m["low"])
            s["close"] = ltp
            s["volume"] += vol
            s["count"] += 1

        # --- Update Live Grid Layer (self.live_state) ---
        if symbol not in self.live_state:
            n_slots = len(self.current_slot_labels)
            self.live_state[symbol] = {
                "price": [None] * n_slots, "price_move": [0.0] * n_slots, "percent_change": [0.0] * n_slots,
                "volume": [0] * n_slots, "volume_strength": [100.0] * n_slots, 
                "slot_opens": [None] * n_slots, "last_total_volume": 0
            }
            
        # Mark dirty
        self._dirty_symbols.add(symbol)
            
        symbol_data = self.live_state[symbol]
        slot_idx = self.label_to_idx.get(slot_label, 0)
        
        # 1. Update Reference Open (First price of the slot)
        if symbol_data["slot_opens"][slot_idx] is None:
            symbol_data["slot_opens"][slot_idx] = candle_1m['open']
            symbol_data["price_open"][slot_idx] = candle_1m['open']
            symbol_data["price_high"][slot_idx] = candle_1m['high']
            symbol_data["price_low"][slot_idx] = candle_1m['low']
            
        # 2. Update Primary Metrics
        symbol_data["price"][slot_idx] = ltp
        # Update High/Low with candle extremes
        if symbol_data["price_high"][slot_idx] is None or candle_1m['high'] > symbol_data["price_high"][slot_idx]:
            symbol_data["price_high"][slot_idx] = candle_1m['high']
        if symbol_data["price_low"][slot_idx] is None or candle_1m['low'] < symbol_data["price_low"][slot_idx]:
            symbol_data["price_low"][slot_idx] = candle_1m['low']

        slot_open = symbol_data["slot_opens"][slot_idx]
        inr_move = round(ltp - slot_open, 2)
        symbol_data["price_move"][slot_idx] = inr_move
        symbol_data["percent_change"][slot_idx] = round((inr_move / slot_open * 100), 2) if slot_open > 0 else 0.0
        symbol_data["volume"][slot_idx] += vol

        # 3. Update Volume Strength (Relative to 09:15 Baseline)
        ref_vol = symbol_data["volume"][0]
        if ref_vol > 0:
            vs = round((symbol_data["volume"][slot_idx] / ref_vol) * 100, 2)
            symbol_data["volume_strength"][slot_idx] = vs
        else:
            symbol_data["volume_strength"][slot_idx] = 100.0

        return state["current_slot"]

    def get_analytics_for_slot(self, symbol: str, slot: Dict) -> Dict:
        state = self.state.get(symbol)
        if not state: return {}
        past_vols = [s["volume"] for s in state["history"][-10:]]
        avg_vol = sum(past_vols) / len(past_vols) if past_vols else slot["volume"]
        vs = round((slot["volume"] / avg_vol) * 100, 2) if avg_vol > 0 else 100.0
        return {
            "percent_change": round(((slot["close"] - slot["open"]) / slot["open"]) * 100, 2),
            "volume_strength": vs
        }

    async def _persist_slot(self, symbol: str, slot: Dict, analytics: Dict):
        from app.infrastructure.database import AsyncSessionLocal
        from app.models.slot import SlotData
        from sqlalchemy.dialects.sqlite import insert
        async with AsyncSessionLocal() as db:
            try:
                stmt = insert(SlotData).values(
                    symbol=symbol,
                    date=self._get_ist_now().date(),
                    slot_label=slot["label"],
                    open=slot["open"],
                    high=slot["high"],
                    low=slot["low"],
                    close=slot["close"],
                    volume=slot["volume"],
                    percent_change=analytics.get("percent_change", 0),
                    volume_strength=analytics.get("volume_strength", 0)
                ).on_conflict_do_update(
                    index_elements=['symbol', 'date', 'slot_label'],
                    set_={
                        "high": case((SlotData.high > slot["high"], SlotData.high), else_=slot["high"]),
                        "low": case((SlotData.low < slot["low"], SlotData.low), else_=slot["low"]),
                        "close": slot["close"],
                        "volume": slot["volume"],
                        "percent_change": analytics.get("percent_change", 0),
                        "volume_strength": analytics.get("volume_strength", 0)
                    }
                )
                await db.execute(stmt)
                await db.commit()
            except Exception as e:
                logging.error(f"DB Persist Error {symbol}: {e}")

    async def _flush_slot_buffer(self):
        """Processes all queued slots in a single database transaction."""
        if not self._slot_buffer: return
        
        from app.infrastructure.database import AsyncSessionLocal
        from app.models.slot import SlotData
        from sqlalchemy.dialects.sqlite import insert
        
        logging.info(f"Aggregator: Flushing {len(self._slot_buffer)} slots to persistent storage...")
        
        async with AsyncSessionLocal() as db:
            try:
                for symbol, slot, analytics in self._slot_buffer:
                    stmt = insert(SlotData).values(
                        symbol=symbol,
                        date=self._get_ist_now().date(),
                        slot_label=slot["label"],
                        open=slot["open"], high=slot["high"], low=slot["low"], close=slot["close"],
                        volume=slot["volume"],
                        percent_change=analytics.get("percent_change", 0),
                        volume_strength=analytics.get("volume_strength", 0)
                    ).on_conflict_do_update(
                        index_elements=['symbol', 'date', 'slot_label'],
                        set_={
                            "high": case((SlotData.high > slot["high"], SlotData.high), else_=slot["high"]),
                            "low": case((SlotData.low < slot["low"], SlotData.low), else_=slot["low"]),
                            "close": slot["close"],
                            "volume": slot["volume"],
                            "percent_change": analytics.get("percent_change", 0),
                            "volume_strength": analytics.get("volume_strength", 0)
                        }
                    )
                    await db.execute(stmt)
                await db.commit()
                self._slot_buffer = []
            except Exception as e:
                logging.error(f"Batch Persist Failure: {e}")

    def get_full_market_state(self) -> Dict:
        """Constructs the full market scan JSON for the frontend with incremental updates."""
        ist_now = self._get_ist_now()
        # High-Resolution Timestamp for visual 'auto-refresh' feedback
        ts_str = ist_now.strftime("%H:%M:%S.%f")[:-3] # HH:MM:SS.mmm
        
        from app.core.calendar import MarketCalendar
        m_status, m_reason = MarketCalendar.get_market_status(ist_now)
        
        from app.state import state
        
        # 1. Update Payload Cache for Dirty Symbols
        curr_lbl = self._get_slot_label()
        slot_idx = self.label_to_idx.get(curr_lbl, 0)
        
        # Process ONLY dirty symbols (huge performance win for large watchlists)
        for sym in list(self._dirty_symbols):
            data = self.live_state.get(sym)
            if not data: continue
            
            # Update Grid Data Cache
            self._payload_cache["data"][sym] = {
                "price": data["price"],
                "price_open": data.get("price_open", []),
                "price_high": data.get("price_high", []),
                "price_low": data.get("price_low", []),
                "price_move": data["price_move"],
                "percent_change": data["percent_change"],
                "volume": data["volume"],
                "volume_strength": data["volume_strength"],
                "phase_alerts": [] 
            }
            
            # Update Summary Cache
            prices = [p for p in data["price"] if p is not None]
            current_price = prices[-1] if prices else 0
            
            # Overall Daily Change (Relative to first valid slot open at 09:15)
            day_open = data.get("price_open", [None])[0]
            if day_open is None:
                # Fallback to current slot's open if early in the session or backfill in progress
                day_open = data.get("price_open", [current_price])[slot_idx] or current_price

            overall_move = round(current_price - day_open, 2)
            overall_pc = round((overall_move / day_open * 100), 2) if day_open > 0 else 0.0

            self._payload_cache["daily_summary"][sym] = {
                "current_price": current_price,
                "total_volume": sum(data["volume"]),
                "percent_change": overall_pc,
                "price_move": overall_move
            }
        
        # Clear flags after synchronization
        self._dirty_symbols.clear()
        
        # 2. Build Final Composition
        payload = {
            "timestamp": ts_str,
            "market_status": [m_status, m_reason],
            "authenticated": state.active_broker is not None,
            "last_update": ist_now.strftime("%H:%M:%S"),
            "watchlist": "Open" if m_status == "OPEN" else "Closed",
            "slot_labels": self.current_slot_labels,
            "data": self._payload_cache["data"],
            "daily_summary": self._payload_cache["daily_summary"],
            "phases": [] 
        }

        return payload
