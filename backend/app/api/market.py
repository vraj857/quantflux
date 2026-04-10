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
    """Fetches historical OHLC. Persists per-timeframe candles in historical_data.db.
    
    Flow:
      1. Check coverage_map for cached date range.
      2. Fetch ONLY missing gaps from broker (raw 1-min).
      3. Aggregate 1-min → N-min and persist in ohlcv_candles.
      4. Serve the full requested window from DB — zero redundant broker calls.
    """
    if not state.active_broker:
        raise HTTPException(status_code=400, detail="No active broker session")

    from app.core.historical_store import HistoricalDataStore
    import time
    t_start = time.perf_counter()

    store = HistoricalDataStore()
    broker_interval = "1" if state.active_broker_name == "FYERS" else "minute"

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt   = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    now      = datetime.now()
    if end_dt > now:
        end_dt = now

    # 1. Identify what's missing
    gaps = store.get_missing_gaps(symbol, timeframe, start_dt, end_dt)
    gaps_filled = 0
    source = "DB_CACHE"
    gap_summary = []
    for gs, ge in gaps:
        gap_summary.append(f"{gs.date()} to {ge.date()}")

    # 2. Fetch & store only the gaps
    for gap_start, gap_end in gaps:
        try:
            raw = await state.active_broker.fetch_history(
                symbol, broker_interval,
                gap_start.strftime("%Y-%m-%d"),
                gap_end.strftime("%Y-%m-%d"),
            )
            if raw:
                agg = HistoricalDataStore.aggregate_raw_to_slots(raw, timeframe)
                store.save_aggregated_candles(symbol, timeframe, agg)
                store.update_coverage(symbol, timeframe, gap_start, gap_end)
                gaps_filled += 1
                source = "BROKER_API"
                logging.info(
                    f"[BROKER_API] {symbol} | tf={timeframe}m | "
                    f"gap: {gap_start.date()} → {gap_end.date()} | "
                    f"stored {len(agg)} candles"
                )
        except Exception as e:
            logging.error(f"[HistoricalStore] Gap fetch error {symbol}: {e}")

    # 3. Read the full range from DB
    aggregated_slots_raw = store.get_candles(symbol, timeframe, start_dt, end_dt)
    if not aggregated_slots_raw:
        return {"s": "error", "message": "No data found for this range."}

    elapsed_ms = round((time.perf_counter() - t_start) * 1000)
    fetched_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    if source == "DB_CACHE":
        logging.info(
            f"[DB_CACHE] {symbol} | tf={timeframe}m | "
            f"{len(aggregated_slots_raw)} candles | "
            f"{start_date} → {end_date} | {elapsed_ms}ms"
        )

    # Convert DB rows → legacy aggregated_slots format for downstream
    aggregated_slots = [
        {
            "label": datetime.fromtimestamp(r["ts"]).strftime("%d-%m-%Y %H:%M"),
            "epoch": r["ts"],
            "open":  r["open"],
            "high":  r["high"],
            "low":   r["low"],
            "close": r["close"],
            "volume": r["volume"],
        }
        for r in aggregated_slots_raw
    ]

    # 4. Build response payload
    plotly_candles, prices, opens, highs, lows, pcs, inr_moves, vols, vss, labels = [], [], [], [], [], [], [], [], [], []
    for idx, s in enumerate(aggregated_slots):
        plotly_candles.append([s["epoch"], s["open"], s["high"], s["low"], s["close"], s["volume"]])
        labels.append(s["label"])
        prices.append(s["close"])
        opens.append(s["open"])
        highs.append(s["high"])
        lows.append(s["low"])
        vols.append(s["volume"])

        inr_move = round(s["close"] - s["open"], 2)
        inr_moves.append(inr_move)

        pc = round((inr_move / s["open"]) * 100, 2) if s["open"] > 0 else 0.0
        pcs.append(pc)

        slot_dt = datetime.fromtimestamp(s["epoch"])
        if slot_dt.hour == 9 and slot_dt.minute == 15:
            vs = 100.0
        else:
            past_vols = [h["volume"] for h in aggregated_slots[:idx]]
            avg = sum(past_vols[-20:]) / len(past_vols[-20:]) if past_vols else s["volume"]
            vs = round((s["volume"] / avg) * 100, 2) if avg > 0 else 100.0
        vss.append(vs)

    from app.core.phases import PhaseEngine
    phase_stats = PhaseEngine.calculate_stats(aggregated_slots)

    return {
        "s": "ok",
        "candles": plotly_candles,
        "phase_stats": phase_stats,
        "cache_info": store.get_coverage_info(symbol, timeframe),
        "fetch_meta": {
            "source": source,
            "fetched_at": fetched_at,
            "elapsed_ms": elapsed_ms,
            "candle_count": len(aggregated_slots_raw),
            "gaps_filled": gaps_filled,
            "sync_details": gap_summary if gap_summary else "Synchronized (Full Cache Hit)",
            "symbol": symbol,
            "timeframe": timeframe,
        },
        "grid_data": {
            "data": {symbol: {
                "price":          prices,
                "price_open":     opens,
                "price_high":     highs,
                "price_low":      lows,
                "price_move":     inr_moves,
                "percent_change": pcs,
                "volume":         vols,
                "volume_strength": vss,
            }},
            "slot_labels": labels,
            "daily_summary": {symbol: {
                "current_price":  prices[-1] if prices else 0,
                "percent_change": pcs[-1] if pcs else 0,
                "total_volume":   sum(vols),
                "price_move":     round(prices[-1] - aggregated_slots[0]["open"], 2) if prices and aggregated_slots else 0,
            }},
            "phases": [{"name": f"{timeframe}m Setup", "colSpan": len(labels), "bg": "bg-indigo-500/10 text-indigo-500"}],
        },
    }


@router.get("/simulate")
async def get_simulation_data(symbol: str, start_date: str, end_date: str, timeframe: int = 25):
    """
    Returns per-day slot data with cumulative VWAP for client-side strategy simulation.

    Response: { sim_data: { days: [{ date, slots: { "HH:MM": { price, open, high, low, vwap, volume }, "NextDayOpen": { price } } }] } }
    """
    if not state.active_broker:
        raise HTTPException(status_code=400, detail="No active broker session")

    from app.core.historical_store import HistoricalDataStore
    from collections import defaultdict
    import time

    t_start = time.perf_counter()
    store = HistoricalDataStore()
    broker_interval = "1" if state.active_broker_name == "FYERS" else "minute"

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt   = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    if end_dt > datetime.now():
        end_dt = datetime.now()

    # Gap-fill — same smart logic as /historical-ohlc
    gaps = store.get_missing_gaps(symbol, timeframe, start_dt, end_dt)
    source = "DB_CACHE"
    for gap_start, gap_end in gaps:
        try:
            raw = await state.active_broker.fetch_history(
                symbol, broker_interval,
                gap_start.strftime("%Y-%m-%d"),
                gap_end.strftime("%Y-%m-%d"),
            )
            if raw:
                agg = HistoricalDataStore.aggregate_raw_to_slots(raw, timeframe)
                store.save_aggregated_candles(symbol, timeframe, agg)
                store.update_coverage(symbol, timeframe, gap_start, gap_end)
                source = "BROKER_API"
        except Exception as e:
            logging.error(f"[Simulate] gap fetch error {symbol}: {e}")

    candles = store.get_candles(symbol, timeframe, start_dt, end_dt)
    if not candles:
        return {"s": "error", "message": "No data found for this range."}

    # Group candles by calendar date
    days_map = defaultdict(list)
    for c in candles:
        dt = datetime.fromtimestamp(c["ts"])
        days_map[dt.date()].append(c)

    sorted_dates = sorted(days_map.keys())

    days = []
    for i, date in enumerate(sorted_dates):
        day_candles = sorted(days_map[date], key=lambda x: x["ts"])
        slots = {}

        # Build slots with cumulative intra-day VWAP
        cum_tp_vol, cum_vol = 0.0, 0.0
        for c in day_candles:
            dt = datetime.fromtimestamp(c["ts"])
            slot_key = dt.strftime("%H:%M")
            vol = c["volume"] or 0
            tp  = (c["high"] + c["low"] + c["close"]) / 3
            cum_tp_vol += tp * vol
            cum_vol    += vol
            slots[slot_key] = {
                "price":  c["close"],
                "open":   c["open"],
                "high":   c["high"],
                "low":    c["low"],
                "vwap":   round(cum_tp_vol / cum_vol, 2) if cum_vol > 0 else c["close"],
                "volume": vol,
            }

        # NextDayOpen = open of next trading day's first candle
        if i + 1 < len(sorted_dates):
            next_candles = sorted(days_map[sorted_dates[i + 1]], key=lambda x: x["ts"])
            if next_candles:
                slots["NextDayOpen"] = {
                    "price": next_candles[0]["open"],
                    "vwap": None, "volume": None,
                }

        days.append({"date": date.strftime("%Y-%m-%d"), "slots": slots})

    elapsed_ms = round((time.perf_counter() - t_start) * 1000)
    logging.info(f"[{'DB_CACHE' if source == 'DB_CACHE' else 'BROKER_API'}] simulate {symbol} tf={timeframe}m | {len(days)} days | {elapsed_ms}ms")

    return {
        "s": "ok",
        "fetch_meta": {
            "source": source,
            "elapsed_ms": elapsed_ms,
            "fetched_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        },
        "sim_data": {
            "symbol": symbol,
            "timeframe": timeframe,
            "days": days,
        },
    }



@router.get("/historical-regime")

async def get_historical_regime(symbol: str, start_date: str, end_date: str, timeframe: int = 25):
    """Fetches historical data, aggregates slots, and performs Regime Analysis.
    
    Uses HistoricalDataStore — persists per-timeframe candles so repeated calls
    are served from DB with no broker fetch.
    """
    if not state.active_broker:
        raise HTTPException(status_code=400, detail="No active broker session")

    from app.core.historical_store import HistoricalDataStore
    from app.core.regime_analyzer import RegimeAnalyzer
    from app.core.microstructure import MicrostructureAnalyzer
    import pandas as pd

    store = HistoricalDataStore()
    broker_interval = "1" if state.active_broker_name == "FYERS" else "minute"

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt   = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    if end_dt > datetime.now():
        end_dt = datetime.now()

    # 1. Identify & fill missing gaps
    gaps = store.get_missing_gaps(symbol, timeframe, start_dt, end_dt)
    for gap_start, gap_end in gaps:
        try:
            raw = await state.active_broker.fetch_history(
                symbol, broker_interval,
                gap_start.strftime("%Y-%m-%d"),
                gap_end.strftime("%Y-%m-%d"),
            )
            if raw:
                agg = HistoricalDataStore.aggregate_raw_to_slots(raw, timeframe)
                store.save_aggregated_candles(symbol, timeframe, agg)
                store.update_coverage(symbol, timeframe, gap_start, gap_end)
                logging.info(f"[HistoricalStore/regime] {len(agg)} candles stored for {symbol}")
        except Exception as e:
            logging.error(f"[HistoricalStore/regime] Gap fetch error {symbol}: {e}")

    # 2. Read from DB
    rows = store.get_candles(symbol, timeframe, start_dt, end_dt)
    if not rows:
        return {"s": "error", "message": "No data found for this range."}

    # Convert to the format RegimeAnalyzer expects
    aggregated_slots = [
        {
            "timestamp": datetime.fromtimestamp(r["ts"]).strftime("%d-%m-%Y %H:%M"),
            "open":  r["open"],
            "high":  r["high"],
            "low":   r["low"],
            "close": r["close"],
            "volume": r["volume"],
        }
        for r in rows
    ]

    if not aggregated_slots:
        return {"s": "error", "message": "No valid trading slots found."}

    df = pd.DataFrame(aggregated_slots)
    df_regime = RegimeAnalyzer.apply_regime_logic(df.copy())
    payload   = RegimeAnalyzer.generate_dashboard_payload(df_regime)

    micro_data = MicrostructureAnalyzer.calculate_shape(df.copy())
    micro_data["symbol"]     = symbol
    micro_data["start_date"] = start_date
    micro_data["end_date"]   = end_date
    payload["microstructure"] = micro_data

    payload["summary"]["symbol"] = symbol
    payload["summary"]["ltp"]    = df["close"].iloc[-1] if not df.empty else 0

    try:
        quotes = await state.active_broker.get_quotes([symbol])
        if quotes:
            q = quotes[0]
            payload["summary"]["high_52week"] = q.get("high_52week", 0)
            payload["summary"]["low_52week"]  = q.get("low_52week",  0)
            if q.get("ltp"):
                payload["summary"]["ltp"] = q.get("ltp")
    except Exception as e:
        logging.error(f"Failed to enrich regime payload with 52w benchmarks: {e}")

    payload["s"] = "ok"
    return payload
@router.post("/bulk-phase-scan")
async def bulk_phase_scan(data: dict):
    """
    Ranks multiple symbols by their phase performance.
    Request: { symbols: [...], start_date, end_date, timeframe (optional, default 25) }
    
    Now uses HistoricalDataStore — fetched data is persisted so watchlist re-scans
    do not re-fetch from broker for already-cached ranges.
    """
    if not state.active_broker:
        raise HTTPException(status_code=400, detail="No active broker session")

    symbols    = data.get("symbols", [])
    start_date = data.get("start_date")
    end_date   = data.get("end_date")
    timeframe  = int(data.get("timeframe", 25))

    if not symbols or not start_date or not end_date:
        raise HTTPException(status_code=400, detail="Missing required scan parameters")

    from app.core.phases import PhaseEngine
    from app.core.historical_store import HistoricalDataStore
    store = HistoricalDataStore()
    broker_interval = "1" if state.active_broker_name == "FYERS" else "minute"

    start_dt = datetime.strptime(start_date, "%Y-%m-%d")
    end_dt   = datetime.strptime(end_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    if end_dt > datetime.now():
        end_dt = datetime.now()

    results = {}
    for sym in symbols:
        try:
            # 1. Find missing gaps for this symbol
            gaps = store.get_missing_gaps(sym, timeframe, start_dt, end_dt)
            for gap_start, gap_end in gaps:
                try:
                    raw = await state.active_broker.fetch_history(
                        sym, broker_interval,
                        gap_start.strftime("%Y-%m-%d"),
                        gap_end.strftime("%Y-%m-%d"),
                    )
                    if raw:
                        agg = HistoricalDataStore.aggregate_raw_to_slots(raw, timeframe)
                        store.save_aggregated_candles(sym, timeframe, agg)
                        store.update_coverage(sym, timeframe, gap_start, gap_end)
                except Exception as fe:
                    logging.error(f"[BulkScan] fetch error {sym}: {fe}")

            # 2. Read from DB
            rows = store.get_candles(sym, timeframe, start_dt, end_dt)
            aggregated = [
                {
                    "label": datetime.fromtimestamp(r["ts"]).strftime("%d-%m-%Y %H:%M"),
                    "epoch": r["ts"],
                    "open":  r["open"],
                    "high":  r["high"],
                    "low":   r["low"],
                    "close": r["close"],
                    "volume": r["volume"],
                }
                for r in rows
            ]
            if aggregated:
                results[sym] = PhaseEngine.calculate_stats(aggregated)
        except Exception as e:
            logging.error(f"[BulkScan] scan error {sym}: {e}")
            continue

    # Transpose: Phase → List[Symbol Stats]
    transposed = {p["name"]: [] for p in PhaseEngine.PHASE_BOUNDS}
    for sym, phases in results.items():
        for p_name, stats in phases.items():
            if p_name in transposed:
                entry = stats.copy()
                entry["symbol"] = sym
                transposed[p_name].append(entry)

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
    
    # --- Session Lifecycle Management ---
    # 1. Prune stale symbols and initialize new set
    state.aggregator.set_active_symbols(symbols)
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

@router.get("/instrument-info")
async def get_instrument_info(symbol: str, db: AsyncSession = Depends(get_async_db)):
    """Returns lot size and instrument type for a symbol."""
    from sqlalchemy import select
    from app.models.instrument import Instrument
    
    # Clean symbol: "NSE:SBIN-EQ" -> "SBIN"
    # Also handle F&O: "ASHOKLEY26APRFUT" -> "ASHOKLEY"
    base_symbol = symbol.split(':')[-1].split('-')[0]
    
    # Strip F&O suffixes like 26APRFUT, 26APR23000CE, etc.
    import re
    # 1. Strip date patterns like 26APR, 25MAY, etc.
    match = re.search(r'\d{2}[A-Z]{3}', base_symbol)
    if match:
        base_symbol = base_symbol[:match.start()]
    
    # 2. Safety strip common suffixes if they somehow remain
    for suffix in ['FUT', 'CE', 'PE']:
        if base_symbol.endswith(suffix):
            base_symbol = base_symbol[:-len(suffix)]

    query = select(Instrument).where(Instrument.symbol == base_symbol)
    result = await db.execute(query)
    inst = result.scalar_one_or_none()
    
    if inst:
        return {
            "symbol": symbol,
            "base_symbol": base_symbol,
            "lot_size": inst.lot_size,
            "type": inst.instrument_type or "EQ"
        }
    
    # Default fallback for unknown symbols
    return {
        "symbol": symbol,
        "base_symbol": base_symbol,
        "lot_size": 1,
        "type": "EQ"
    }

@router.post("/sync-fno-lots")
async def sync_fno_lots(db: AsyncSession = Depends(get_async_db)):
    """Triggers F&O lot size synchronization from internal seed or NSE."""
    from app.core.fno_sync import FnoSyncManager
    count = await FnoSyncManager.sync_all(db)
    return {"status": "success", "updated_count": count}

@router.get("/full-state")
async def get_full_state():
    """Returns the consolidated live market state for polling fallbacks."""
    return state.aggregator.get_full_market_state()

