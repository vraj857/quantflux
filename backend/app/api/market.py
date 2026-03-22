from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database import get_async_db
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
    """Fetches historical OHLC with local caching and deep scaling."""
    if not state.active_broker:
        raise HTTPException(status_code=400, detail="No active broker session")
    
    from app.core.history_cache import HistoryCache
    cache = HistoryCache()
    interval = "1" if state.active_broker_name == "FYERS" else "minute"
    
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    
    # Cap end_dt at now to avoid gaps for the future part of today
    now = datetime.now()
    if end_dt > now:
        end_dt = now
    
    # 1. Identify missing ranges
    missing_ranges = cache.get_missing_ranges(symbol, interval, start_dt, end_dt)
    
    # 2. Fetch missing chunks from broker
    for chunk_start, chunk_end in missing_ranges:
        try:
            # Note: For very long ranges, we would further chunk this into 60-day blocks
            # if the broker adaptor doesn't already handle it.
            new_candles = await state.active_broker.fetch_history(
                symbol, interval, 
                chunk_start.strftime("%Y-%m-%d"), 
                chunk_end.strftime("%Y-%m-%d")
            )
            cache.save_candles(symbol, interval, new_candles)
        except Exception as e:
            logging.error(f"Deep fetch chunk error: {e}")
            
    # 3. Pull final combined list from Cache
    raw_candles = cache.get_candles(symbol, interval, int(start_dt.timestamp()), int(end_dt.timestamp()))
    
    if not raw_candles:
        return {"s": "error", "message": "No data found for this range."}

    aggregated_slots = []
    current_slot = None
    
    from datetime import timedelta
    for c in raw_candles:
        # DB stores integer timestamps
        dt = datetime.fromtimestamp(c["timestamp"])
            
        m_start = dt.replace(hour=9, minute=15, second=0, microsecond=0)
        m_end = dt.replace(hour=15, minute=30, second=0, microsecond=0)
        if dt < m_start or dt >= m_end: continue
        
        diff_minutes = (dt - m_start).total_seconds() / 60
        slot_idx = int(diff_minutes // timeframe)
        slot_start_time = m_start + timedelta(minutes=slot_idx * timeframe)
        label = slot_start_time.strftime("%d-%m-%Y %H:%M")
        
        if not current_slot or current_slot["label"] != label:
            if current_slot: aggregated_slots.append(current_slot)
            current_slot = {
                "label": label,
                "epoch": int(slot_start_time.timestamp()),
                "open": c["open"],
                "high": c["high"],
                "low": c["low"],
                "close": c["close"],
                "volume": c["volume"]
            }
        else:
            current_slot["high"] = max(current_slot["high"], c["high"])
            current_slot["low"] = min(current_slot["low"], c["low"])
            current_slot["close"] = c["close"]
            current_slot["volume"] += c["volume"]
            
    if current_slot: aggregated_slots.append(current_slot)
    
    plotly_candles, prices, pcs, inr_moves, vols, vss, labels = [], [], [], [], [], [], []
    for idx, s in enumerate(aggregated_slots):
        plotly_candles.append([s["epoch"], s["open"], s["high"], s["low"], s["close"], s["volume"]])
        labels.append(s["label"])
        prices.append(s["close"])
        vols.append(s["volume"])
        
        inr_move = round(s["close"] - s["open"], 2)
        inr_moves.append(inr_move)
        
        pc = round((inr_move / s["open"]) * 100, 2) if s["open"] > 0 else 0.0
        pcs.append(pc)
        
        slot_dt = datetime.fromtimestamp(s["epoch"])
        if slot_dt.hour == 9 and slot_dt.minute == 15:
            vs = 100.0
        else:
            # Trailing avg for volume strength
            past_vols = [h["volume"] for h in aggregated_slots[:idx]]
            avg = sum(past_vols[-20:])/len(past_vols[-20:]) if past_vols else s["volume"]
            vs = round((s["volume"] / avg) * 100, 2) if avg > 0 else 100.0
        vss.append(vs)

    from app.core.phases import PhaseEngine
    phase_stats = PhaseEngine.calculate_stats(aggregated_slots)
        
    payload = {
        "s": "ok",
        "candles": plotly_candles,
        "phase_stats": phase_stats,
        "grid_data": {
            "data": {symbol: {
                "price": prices, 
                "price_move": inr_moves,
                "percent_change": pcs, 
                "volume": vols, 
                "volume_strength": vss
            }},
            "slot_labels": labels,
            "daily_summary": {symbol: {
                "current_price": prices[-1] if prices else 0,
                "percent_change": pcs[-1] if pcs else 0, 
                "total_volume": sum(vols),
                "price_move": round(prices[-1] - aggregated_slots[0]["open"], 2) if prices and aggregated_slots else 0
            }},
            "phases": [{"name": f"{timeframe}m Setup", "colSpan": len(labels), "bg": "bg-indigo-500/10 text-indigo-500"}]
        }
    }
    return payload
@router.post("/bulk-phase-scan")
async def bulk_phase_scan(data: dict):
    """
    Ranks multiple symbols by their phase performance.
    Request: { symbols: [...], start_date, end_date }
    """
    if not state.active_broker:
        raise HTTPException(status_code=400, detail="No active broker session")
    
    symbols = data.get("symbols", [])
    start_date = data.get("start_date")
    end_date = data.get("end_date")
    
    if not symbols or not start_date or not end_date:
        raise HTTPException(status_code=400, detail="Missing required scan parameters")

    from app.core.phases import PhaseEngine
    results = {}
    
    # Standardize interval
    interval = "1" if state.active_broker_name == "FYERS" else "minute"
    
    # Process symbols in batches to respect rate limits
    for sym in symbols:
        try:
            raw_candles = await state.active_broker.fetch_history(sym, interval, start_date, end_date)
            
            # Use a simplified aggregator for the scan
            aggregated = []
            current = None
            for c in raw_candles:
                dt = c.get('timestamp') or c.get('date')
                if not isinstance(dt, datetime):
                    dt = datetime.fromtimestamp(int(dt)) if isinstance(dt, (int, str)) else dt
                
                m_start = dt.replace(hour=9, minute=15, second=0, microsecond=0)
                m_end = dt.replace(hour=15, minute=30, second=0, microsecond=0)
                if dt < m_start or dt >= m_end: continue
                
                # 25-min slots for consistency with dashboard
                slot_idx = int(((dt - m_start).total_seconds() / 60) // 25)
                label = (m_start + timedelta(minutes=slot_idx * 25)).strftime("%H:%M")
                
                if not current or current["label"] != label:
                    if current: aggregated.append(current)
                    current = {
                        "label": label, 
                        "epoch": int(dt.timestamp()), # Added epoch for day-grouping
                        "open": c['open'], 
                        "high": c['high'], 
                        "low": c['low'], 
                        "close": c['close'], 
                        "volume": c['volume']
                    }
                else:
                    current["high"] = max(current["high"], c['high'])
                    current["low"] = min(current["low"], c['low'])
                    current["close"] = c['close']
                    current["volume"] += c['volume']
            if current: aggregated.append(current)
            
            if aggregated:
                results[sym] = PhaseEngine.calculate_stats(aggregated)
        except Exception as e:
            logging.error(f"Scan error for {sym}: {e}")
            continue

    # Transpose for easier UI consumption (Phase -> Symbol Stats)
    transposed = {p["name"]: [] for p in PhaseEngine.PHASE_BOUNDS}
    for sym, phases in results.items():
        for p_name, stats in phases.items():
            if p_name in transposed:
                entry = stats.copy()
                entry["symbol"] = sym
                transposed[p_name].append(entry)
                
    # Sort each phase by Trend Strength (Persistence) by default
    for p_name in transposed:
        transposed[p_name].sort(key=lambda x: x.get("persistence", 0), reverse=True)

    return {"status": "success", "scan_results": transposed}

@router.post("/save-phase-dna")
async def save_phase_dna(data: dict, db: AsyncSession = Depends(get_async_db)):
    """Saves backtested benchmarks for a symbol."""
    from app.core.profiles import ProfileManager
    symbol = data.get("symbol")
    benchmarks = data.get("benchmarks")
    period = data.get("period", "30 Days")
    
    if not symbol or not benchmarks:
        raise HTTPException(status_code=400, detail="Missing symbol or benchmarks")
        
    success = await ProfileManager.save_dna(db, symbol, benchmarks, period)
    if success:
        # Update the live state in memory too
        state.phase_dnas[symbol] = benchmarks
        return {"status": "success", "message": f"DNA for {symbol} saved to live agent."}
    else:
        raise HTTPException(status_code=500, detail="Failed to save DNA profile")

@router.post("/simulate-phase-strategy")
async def simulate_phase_strategy(data: dict):
    """Runs a 5-year simulation based on symbol DNA."""
    from app.core.simulator import PhaseSimulator
    from app.core.history_cache import HistoryCache
    
    symbol = data.get("symbol")
    dna = data.get("dna")
    start_date = data.get("start_date", "2019-01-01")
    end_date = data.get("end_date", datetime.now().strftime("%Y-%m-%d"))
    
    if not symbol or not dna:
        raise HTTPException(status_code=400, detail="Missing symbol or DNA")
        
    cache = HistoryCache()
    interval = "1" # Use 1m data for simulation
    
    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    
    # Cap end_dt at now
    now = datetime.now()
    if end_dt > now:
        end_dt = now
    
    # We pull from cache (assuming user has already fetched history once)
    candles = cache.get_candles(symbol, interval, int(start_dt.timestamp()), int(end_dt.timestamp()))
    
    if not candles:
        return {"status": "error", "message": "No historical data in cache. Please fetch history first."}
        
    sim = PhaseSimulator(initial_capital=100000)
    results = sim.simulate(symbol, candles, dna)
    return {"status": "success", "results": results}

@router.get("/order-summary")
async def get_order_summary():
    """Returns the current state of the execution engine."""
    return state.order_manager.get_summary()

@router.post("/close-all-positions")
async def close_all_positions():
    """Safety kill switch."""
    # Implementation would iterate and close via broker
    return {"status": "success", "message": "All orders cancelled (Mock)"}

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
    """Triggers the active broker to re-subscribe to current symbols with historical backfill."""
    if not state.active_broker:
        return {"status": "error", "message": "No active broker"}
    
    symbols = data.get("symbols", [])
    if not symbols:
        return {"status": "success", "synced": 0}

    # --- Live Backfill Logic ---
    # Fetch today's 1m data from 09:15 AM to NOW for each symbol
    from app.core.calendar import MarketCalendar
    from datetime import datetime, time
    import pytz
    
    ist = pytz.timezone('Asia/Kolkata')
    now_ist = datetime.now(ist)
    market_open = now_ist.replace(hour=9, minute=15, second=0, microsecond=0)
    
    # Pre-initialize the grid structure to ensure immediate render in UI
    state.aggregator.initialize_symbols(symbols)
    state._needs_broadcast = True
    # --- Session Lifecycle Management ---
    # 1. Clean Slate: If it's pre-market AM, ensure aggregator is cleared of yesterday's data
    if now_ist.time() < time(9, 15):
        logging.info("Market API: Pre-market hour detected. Clearing old session data for a clean slate.")
        state.aggregator.reset_live_state()
        state.aggregator.session_date = now_ist.date()

    # 2. Backfill: Only backfill if we are past market open today (or showing last session)
    if now_ist.time() >= time(9, 15):
        # Determine backfill end-time: if market is closed, go to 15:30, otherwise NOW
        backfill_end = now_ist
        if now_ist.time() > time(15, 30):
            backfill_end = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)
            
        start_date = market_open.strftime("%Y-%m-%d %H:%M:%S")
        end_date = backfill_end.strftime("%Y-%m-%d %H:%M:%S")
        interval = "1" if state.active_broker_name == "FYERS" else "minute"
        
        # Diagnostic Trace Bridge
        with open(r"c:\tmp\backfill_trace.txt", "a") as f:
            f.write(f"\n[{datetime.now()}] Performing Live Backfill for {len(symbols)} symbols from {start_date} to {end_date}\n")
            for sym in symbols:
                try:
                    candles = await state.active_broker.fetch_history(sym, interval, start_date, end_date)
                    if candles:
                        f.write(f"[{datetime.now()}] SUCCESS: Backfilled {len(candles)} candles for {sym}\n")
                        await state.aggregator.replay_candles(sym, candles)
                    else:
                        f.write(f"[{datetime.now()}] WARNING: No data for {sym}\n")
                except Exception as e:
                    f.write(f"[{datetime.now()}] ERROR: {sym} failed: {e}\n")
                    logging.error(f"Backfill failed for {sym}: {e}")
            f.flush()

    # Start the live ticker after backfill (only if market is open/near-open)
    if now_ist.time() < time(15, 35): # Buffer for session close
        from app.main import on_tick_received
        await state.active_broker.start_ticker(symbols, on_tick_received)
    
    return {"status": "success", "synced": len(symbols), "backfilled": now_ist.time() >= time(9, 15)}

@router.get("/subscriptions")
async def get_subscriptions():
    """
    Returns the list of symbols currently subscribed to the live WebSocket feed,
    plus the WS connection status.
    """
    if not state.active_broker:
        return {"connected": False, "symbols": [], "broker": None}
    
    broker = state.active_broker
    subscribed = broker.get_subscribed_symbols() if hasattr(broker, "get_subscribed_symbols") else []
    connected = getattr(broker, "ws_connected", False)
    
    return {
        "connected": connected,
        "symbols": subscribed,
        "broker": state.active_broker_name
    }

@router.get("/snapshot")
async def get_market_snapshot(watchlist: str = "Default", db: AsyncSession = Depends(get_async_db)):
    """
    Fetches today's OHLCV + LTP for all symbols in the given watchlist via the
    broker's REST quotes endpoint. Works 24/7 — returns last session data even
    after market close, providing the table data quant traders expect to see immediately.
    """
    if not state.active_broker:
        raise HTTPException(status_code=400, detail="No active broker session")
    
    if not hasattr(state.active_broker, "get_quotes"):
        raise HTTPException(status_code=501, detail="Current broker does not support quotes snapshot")
    
    from app.api.watchlist import get_watchlist_symbols
    symbols = await get_watchlist_symbols(watchlist, db)
    
    if not symbols:
        return {"status": "ok", "watchlist": watchlist, "quotes": []}
    
    # Fyers batch limit is 50 symbols per request
    BATCH = 50
    all_quotes = []
    for i in range(0, len(symbols), BATCH):
        batch = symbols[i:i + BATCH]
        quotes = await state.active_broker.get_quotes(batch)
        all_quotes.extend(quotes)
    
    return {
        "status": "ok",
        "watchlist": watchlist,
        "market_status": MarketCalendar.get_market_status()[0],
        "quotes": all_quotes
    }

@router.get("/full-state")
async def get_full_state():
    """Returns the consolidated live market state for polling fallbacks."""
    return state.aggregator.get_full_market_state()

