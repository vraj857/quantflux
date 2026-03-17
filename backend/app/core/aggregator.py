import logging
from typing import Dict, List, Optional
from datetime import datetime

class AggregationEngine:
    """
    Core engine to aggregate 1-minute candles into custom timeframes (e.g., 25m slots).
    Designed for 100% parity between Live and Historical data processing.
    """
    
    def __init__(self, slot_minutes: int = 25):
        self.slot_minutes = slot_minutes
        self.state = {} # symbol -> current_slot_data

    def reset_state(self, symbol: Optional[str] = None):
        if symbol:
            if symbol in self.state:
                del self.state[symbol]
        else:
            self.state = {}

    async def process_candle(self, symbol: str, candle_1m: Dict) -> Optional[Dict]:
        """
        Rolls a 1-minute candle into the current custom slot.
        Returns the completed slot if the candle marks the boundary, or the updated current slot.
        """
        ts = candle_1m['timestamp']
        if isinstance(ts, (int, float)):
            dt = datetime.fromtimestamp(ts)
        else:
            dt = ts
            
        if symbol not in self.state:
            self.state[symbol] = {
                "current_slot": None,
                "history": [] # Stores previous completed slots for volume strength
            }
            
        state = self.state[symbol]
        slot_label = self._get_slot_label(dt)
        
        if not state["current_slot"] or state["current_slot"]["label"] != slot_label:
            # Slot boundary reached!
            completed_slot = state["current_slot"]
            
            # Start new slot
            state["current_slot"] = {
                "label": slot_label,
                "open": candle_1m['open'],
                "high": candle_1m['high'],
                "low": candle_1m['low'],
                "close": candle_1m['close'],
                "volume": candle_1m['volume'],
                "count": 1
            }
            
            if completed_slot:
                state["history"].append(completed_slot)
                if len(state["history"]) > 20: state["history"].pop(0)
                # Persist completed slot
                analytics = self.get_analytics(symbol)
                await self._persist_slot(symbol, completed_slot, analytics)
                return completed_slot
        else:
            # Update existing slot
            s = state["current_slot"]
            s["high"] = max(s["high"], candle_1m["high"])
            s["low"] = min(s["low"], candle_1m["low"])
            s["close"] = candle_1m["close"]
            s["volume"] += candle_1m["volume"]
            s["count"] += 1
            
        # Optional: Persist ongoing slot update (might be too frequent, depends on use case)
        # For now, we only persist on boundary or manually.
        
        return state["current_slot"]

    async def _persist_slot(self, symbol: str, slot: Dict, analytics: Dict):
        """Saves a slot to the database."""
        from app.database import AsyncSessionLocal
        from app.models.slot import SlotData
        from sqlalchemy.dialects.sqlite import insert
        
        async with AsyncSessionLocal() as db:
            try:
                # Use UPSERT (insert or replace) logic
                stmt = insert(SlotData).values(
                    symbol=symbol,
                    date=datetime.now().date(),
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
                        "high": SlotData.high if SlotData.high > slot["high"] else slot["high"],
                        "low": SlotData.low if SlotData.low < slot["low"] else slot["low"],
                        "close": slot["close"],
                        "volume": slot["volume"],
                        "percent_change": analytics.get("percent_change", 0),
                        "volume_strength": analytics.get("volume_strength", 0)
                    }
                )
                await db.execute(stmt)
                await db.commit()
            except Exception as e:
                logging.error(f"DB Persist Error for {symbol}: {e}")

    async def catch_up(self, symbol: str, candles_1m: List[Dict]):
        """
        Processes a batch of 1m candles to fill data gaps.
        Used after WS reconnection.
        """
        for candle in candles_1m:
            self.process_candle(symbol, candle)
        logging.info(f"Aggregation Engine caught up for {symbol} with {len(candles_1m)} candles.")

    def _get_slot_label(self, dt: datetime) -> str:
        """Calculates which N-minute interval the datetime falls into from 09:15."""
        m_start = dt.replace(hour=9, minute=15, second=0, microsecond=0)
        diff_minutes = (dt - m_start).total_seconds() / 60
        if diff_minutes < 0: return "PRE"
        
        slot_idx = int(diff_minutes // self.slot_minutes)
        slot_start = m_start.timestamp() + (slot_idx * self.slot_minutes * 60)
        return datetime.fromtimestamp(slot_start).strftime("%H:%M")

    def get_analytics(self, symbol: str) -> Dict:
        """Calculates % Change and Volume Strength for the active slot."""
        state = self.state.get(symbol)
        if not state or not state["current_slot"]: return {}
        
        curr = state["current_slot"]
        
        # Volume Strength
        past_vols = [s["volume"] for s in state["history"]]
        avg_vol = sum(past_vols) / len(past_vols) if past_vols else curr["volume"]
        vs = round((curr["volume"] / avg_vol) * 100, 2) if avg_vol > 0 else 100.0
        
        return {
            "symbol": symbol,
            "label": curr["label"],
            "open": curr["open"],
            "high": curr["high"],
            "low": curr["low"],
            "close": curr["close"],
            "volume": curr["volume"],
            "volume_strength": vs,
            "percent_change": round(((curr["close"] - curr["open"]) / curr["open"]) * 100, 2)
        }

    def get_full_market_state(self) -> Dict:
        """Constructs the full nested JSON payload expected by the React dashboard grid."""
        from datetime import datetime, timedelta
        now = datetime.now()
        
        # Precompute slot labels for the day
        m_start = now.replace(hour=9, minute=15, second=0, microsecond=0)
        m_end = now.replace(hour=15, minute=30, second=0, microsecond=0)
        labels = []
        curr = m_start
        while curr < m_end:
            labels.append(curr.strftime("%H:%M"))
            curr += timedelta(minutes=self.slot_minutes)
            
        from app.core.calendar import MarketCalendar
        m_status, m_reason = MarketCalendar.get_market_status(now)
        
        payload = {
            "timestamp": now.strftime("%H:%M:%S"),
            "market_status": [m_status, m_reason],
            "last_update": now.strftime("%H:%M:%S"),
            "watchlist": "Active",
            "slot_labels": labels,
            "data": {},
            "daily_summary": {},
            "phases": [] 
        }
        
        for sym, state_data in self.state.items():
            if not state_data.get("current_slot"): continue
            
            slots = state_data["history"] + [state_data["current_slot"]]
            
            prices = [None] * len(labels)
            inr_moves = [None] * len(labels)
            pcs = [None] * len(labels)
            vols = [None] * len(labels)
            vss = [None] * len(labels)
            
            # Map slots to their correct indices based on label
            for s in slots:
                if s["label"] in labels:
                    idx = labels.index(s["label"])
                    prices[idx] = s["close"]
                    vols[idx] = s["volume"]
                    
                    inr = round(s["close"] - s["open"], 2)
                    inr_moves[idx] = inr
                    
                    pc = round((inr / s["open"]) * 100, 2) if s["open"] > 0 else 0.0
                    pcs[idx] = pc
                    
                    slot_dt = datetime.fromtimestamp(s["epoch"]) if "epoch" in s else datetime.now()
                    if slot_dt.hour == 9 and slot_dt.minute == 15:
                        vs = 100.0
                    else:
                        past_vols = []
                        for h in state_data["history"]:
                            if h["label"] in labels and labels.index(h["label"]) < idx:
                                past_vols.append(h["volume"])
                                
                        avg = sum(past_vols)/len(past_vols) if past_vols else s["volume"]
                        vs = round((s["volume"] / avg) * 100, 2) if avg > 0 else 100.0
                    vss[idx] = vs
                    
            from app.core.phases import PhaseEngine, PhaseSentinel
            p_stats = PhaseEngine.calculate_stats(slots)
            
            # Find the "Active Phase" stats to evaluate alerts
            # Fetch DNA from global state if available
            from app.state import state
            symbol_dna = state.phase_dnas.get(sym, {})
            
            active_phase_name = None
            if p_stats:
                active_phase_name = list(p_stats.keys())[-1]
                
            alerts = []
            if active_phase_name:
                # Use custom DNA if available, else fall back to sensible defaults
                benchmarks = symbol_dna.get(active_phase_name, {
                    "min_strength": 60, 
                    "min_vol": 10, 
                    "max_volatility": 1.5
                })
                alerts = PhaseSentinel.evaluate(sym, active_phase_name, p_stats[active_phase_name], benchmarks)

            payload["data"][sym] = {
                "price": prices,
                "price_move": inr_moves,
                "percent_change": pcs,
                "volume": vols,
                "volume_strength": vss,
                "phase_stats": p_stats,
                "phase_alerts": alerts
            }
            
            curr_slot = state_data["current_slot"]
            payload["daily_summary"][sym] = {
                "current_price": curr_slot["close"],
                "percent_change": pcs[labels.index(curr_slot["label"])] if curr_slot["label"] in labels else 0.0,
                "price_move": round(curr_slot["close"] - slots[0]["open"], 2) if slots else 0,
                "total_volume": sum(s["volume"] for s in slots)
            }
            
        return payload
