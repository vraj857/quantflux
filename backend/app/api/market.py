from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_async_db
from app.state import state
from app.core.calendar import MarketCalendar
from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import logging

router = APIRouter(prefix="/api/market", tags=["market"])

class TimeframeUpdate(BaseModel):
    minutes: int

class FeedModeUpdate(BaseModel):
    mode: str # "LIVE" or "HISTORICAL"
    date: Optional[str] = None
    symbol: Optional[str] = None

@router.get("/status")
async def get_market_status():
    """Returns current market session info."""
    status, reason = MarketCalendar.get_market_status()
    return {
        "status": status,
        "reason": reason,
        "server_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }

@router.get("/timeframe")
async def get_timeframe():
    return {
        "interval_minutes": state.aggregator.slot_minutes,
        "is_historical": state.is_historical_mode
    }

@router.post("/set-timeframe")
async def set_timeframe(data: TimeframeUpdate):
    state.aggregator.slot_minutes = data.minutes
    state.aggregator.reset_state()
    return {"status": "success", "minutes": data.minutes}

@router.get("/historical-ohlc")
async def get_historical_ohlc(symbol: str, start_date: str, end_date: str, timeframe: int = 25):
    """Fetches historical OHLC for charting and grid visualization."""
    if not state.active_broker:
        raise HTTPException(status_code=400, detail="No active broker session")
    
    try:
        from datetime import timedelta
        # Standardize interval to '1' (minute) for raw candle fetch
        interval = "1" if state.active_broker_name == "FYERS" else "minute"
        raw_candles = await state.active_broker.fetch_history(symbol, interval, start_date, end_date)
        
        aggregated_slots = []
        current_slot = None
        
        for c in raw_candles:
            ts = c.get('timestamp') or c.get('date')
            if isinstance(ts, datetime):
                dt = ts
            elif isinstance(ts, str):
                try: dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                except: dt = datetime.fromtimestamp(int(ts))
            else:
                dt = datetime.fromtimestamp(int(ts))
                
            m_start = dt.replace(hour=9, minute=15, second=0, microsecond=0)
            if dt < m_start: continue
            
            diff_minutes = (dt - m_start).total_seconds() / 60
            slot_idx = int(diff_minutes // timeframe)
            slot_start_time = m_start + timedelta(minutes=slot_idx * timeframe)
            label = slot_start_time.strftime("%d %b %H:%M")
            
            if not current_slot or current_slot["label"] != label:
                if current_slot: aggregated_slots.append(current_slot)
                current_slot = {
                    "label": label,
                    "epoch": int(slot_start_time.timestamp()),
                    "open": c.get('open', 0),
                    "high": c.get('high', 0),
                    "low": c.get('low', 0),
                    "close": c.get('close', 0),
                    "volume": c.get('volume', 0)
                }
            else:
                current_slot["high"] = max(current_slot["high"], c.get('high', 0))
                current_slot["low"] = min(current_slot["low"], c.get('low', 0))
                current_slot["close"] = c.get('close', 0)
                current_slot["volume"] += c.get('volume', 0)
                
        if current_slot: aggregated_slots.append(current_slot)
        
        plotly_candles, prices, pcs, vols, vss, labels = [], [], [], [], [], []
        for idx, s in enumerate(aggregated_slots):
            plotly_candles.append([s["epoch"], s["open"], s["high"], s["low"], s["close"], s["volume"]])
            labels.append(s["label"])
            prices.append(s["close"])
            vols.append(s["volume"])
            
            pc = round(((s["close"] - s["open"]) / s["open"]) * 100, 2) if s["open"] > 0 else 0.0
            pcs.append(pc)
            
            # Trailing avg for volume strength
            past_vols = [h["volume"] for h in aggregated_slots[:idx]]
            avg = sum(past_vols[-20:])/len(past_vols[-20:]) if past_vols else s["volume"]
            vs = round((s["volume"] / avg) * 100, 2) if avg > 0 else 100.0
            vss.append(vs)

        # ── Phase Boundary Classification ──
        # Phase boundaries in minutes from 9:15 for 25-min slots:
        # Morning (9:15–10:05): slot_idx 0,1,2
        # Midday (10:30–12:10): slot_idx 3,4,5,6,7
        # Trend (12:35–14:15): slot_idx 8,9,10,11
        # Closing (14:40–15:05): slot_idx 12,13,14
        PHASE_BOUNDS = [
            {"name": "Morning Phase",    "label": "Morning (9:15–10:30)",      "slots": list(range(0, 3))},
            {"name": "Midday Chop",      "label": "Midday Chop (10:30–12:35)", "slots": list(range(3, 8))},
            {"name": "Trend Formation",  "label": "Trend Formation (12:35–14:15)", "slots": list(range(8, 12))},
            {"name": "Closing Session",  "label": "Closing Session (14:15–15:30)","slots": list(range(12, 15))},
        ]

        def safe_avg(lst):
            return round(sum(lst) / len(lst), 2) if lst else 0.0

        def phase_yield(slot_list):
            """Discrete % change from first open to last close in a phase."""
            opens = [aggregated_slots[i]["open"] for i in slot_list if i < len(aggregated_slots)]
            closes = [aggregated_slots[i]["close"] for i in slot_list if i < len(aggregated_slots)]
            if not opens or not closes or opens[0] == 0:
                return 0.0
            return round(((closes[-1] - opens[0]) / opens[0]) * 100, 2)

        phase_stats = {}
        total_vol = sum(vols) or 1  # avoid div/0
        for phase in PHASE_BOUNDS:
            idx_list = [i for i in phase["slots"] if i < len(aggregated_slots)]
            if not idx_list:
                continue
            p_prices  = [prices[i] for i in idx_list]
            p_pcs     = [pcs[i]    for i in idx_list]
            p_vols    = [vols[i]   for i in idx_list]
            p_vss     = [vss[i]    for i in idx_list]
            # Volatility = avg slot high-low range as % of open
            p_hl_pct  = [round(((aggregated_slots[i]["high"] - aggregated_slots[i]["low"]) / aggregated_slots[i]["open"]) * 100, 2)
                         if aggregated_slots[i]["open"] > 0 else 0.0 for i in idx_list]
            phase_stats[phase["name"]] = {
                "label":        phase["label"],
                "avg_pc":       safe_avg(p_pcs),
                "phase_yield":  phase_yield(idx_list),
                "mean_price":   safe_avg(p_prices),
                "total_volume": sum(p_vols),
                "vol_share":    round((sum(p_vols) / total_vol) * 100, 1),
                "avg_vs":       safe_avg(p_vss),
                "volatility":   safe_avg(p_hl_pct),
                # Persistence: % of slots in the phase that are green (pc > 0)
                "persistence":  round((sum(1 for x in p_pcs if x > 0) / len(p_pcs)) * 100, 1) if p_pcs else 0.0,
                "slots":        len(idx_list),
            }
            
        payload = {
            "s": "ok",
            "candles": plotly_candles,
            "phase_stats": phase_stats,
            "grid_data": {
                "data": {symbol: {"price": prices, "percent_change": pcs, "volume": vols, "volume_strength": vss}},
                "slot_labels": labels,
                "daily_summary": {symbol: {
                    "current_price": prices[-1] if prices else 0,
                    "percent_change": pcs[-1] if pcs else 0, 
                    "total_volume": sum(vols)
                }},
                "phases": [{"name": f"{timeframe}m Setup", "colSpan": len(labels), "bg": "bg-indigo-500/10 text-indigo-500"}]
            }
        }
        return payload
    except Exception as e:
        logging.error(f"Failed to fetch historical data: {e}")
        return {"s": "error", "message": "Failed to fetch historical data from broker"}

@router.post("/set-feed-mode")
async def set_feed_mode(data: FeedModeUpdate):
    if data.mode == "HISTORICAL":
        state.is_historical_mode = True
        return {"status": "success", "mode": "HISTORICAL"}
    else:
        state.is_historical_mode = False
        return {"status": "success", "mode": "LIVE"}

@router.get("/system-logs")
async def get_system_logs():
    """Returns system logs (mocked as empty since we use Loguru structured logging now)."""
    return []

@router.post("/update-watchlist")
async def update_watchlist(data: dict):
    """Triggers the active broker to re-subscribe to current symbols."""
    if not state.active_broker:
        return {"status": "error", "message": "No active broker"}
    
    symbols = data.get("symbols", [])
    if symbols:
        from app.main import on_tick_received
        await state.active_broker.start_ticker(symbols, on_tick_received)
    return {"status": "success", "synced": len(symbols)}
