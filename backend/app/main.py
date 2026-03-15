from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine, Base, AsyncSessionLocal
from app.api import auth, market, watchlist, analytics
from app.state import state
from app.models.session import BrokerSession
from app.broker_management.fyers import FyersAdapter
from app.broker_management.zerodha import ZerodhaAdapter
from app.core.resilience import ResilienceManager
from config import FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL, KITE_API_KEY, KITE_API_SECRET
from sqlalchemy import select
import json
import asyncio
from datetime import datetime
import logging
from app.core.logging import setup_logging

# Initialize structured logging
setup_logging()

app = FastAPI(title="QuantFlux Production API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Active WebSocket connections
active_connections = set()

# Include Routers
app.include_router(auth.router)
app.include_router(market.router)
app.include_router(watchlist.router)
app.include_router(analytics.router)

async def broadcast_payload(payload: dict):
    """Sends JSON update to all connected clients."""
    if not active_connections: return
    message = json.dumps(payload)
    tasks = [ws.send_text(message) for ws in active_connections]
    await asyncio.gather(*tasks, return_exceptions=True)

async def on_tick_received(tick: dict):
    """Callback from broker adapters when a new tick arrives."""
    symbol = str(tick['symbol'])
    # Standardize: tick must have 'open', 'high', 'low', 'close', 'volume', 'timestamp'
    candle_1m = {
        "timestamp": tick.get('timestamp') or datetime.now(),
        "open": tick['ltp'],
        "high": tick['ltp'],
        "low": tick['ltp'],
        "close": tick['ltp'],
        "volume": tick.get('volume', 0)
    }
    
    # Process through aggregator
    slot = await state.aggregator.process_candle(symbol, candle_1m)
    if slot:
        # If a slot was updated or completed, fetch full UI payload and broadcast
        payload = state.aggregator.get_full_market_state()
        await broadcast_payload({
            "type": "MARKET_UPDATE",
            "data": payload
        })

@app.on_event("startup")
async def startup_event():
    # 1. Initialize Database Tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # 2. Session Auto-Resumption
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(BrokerSession).filter(BrokerSession.is_active == 1).order_by(BrokerSession.created_at.desc()).limit(1)
        )
        last_session = result.scalar_one_or_none()
        
        if last_session:
            try:
                if last_session.broker == "FYERS":
                    adapter = FyersAdapter(FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL)
                    adapter.access_token = last_session.access_token
                    from fyers_apiv3 import fyersModel
                    adapter.api = fyersModel.FyersModel(client_id=adapter.client_id, token=adapter.access_token, is_async=False, log_path="")
                    state.active_broker = adapter
                    state.active_broker_name = "FYERS"
                elif last_session.broker == "ZERODHA":
                    adapter = ZerodhaAdapter(KITE_API_KEY, KITE_API_SECRET)
                    adapter.access_token = last_session.access_token
                    from kiteconnect import KiteConnect
                    adapter.api = KiteConnect(api_key=KITE_API_KEY)
                    adapter.api.set_access_token(adapter.access_token)
                    state.active_broker = adapter
                    state.active_broker_name = "ZERODHA"
                
                # Start the ticker if symbols are available
                # (Symbols fetch logic would go here)
                
            except Exception as e:
                logging.error(f"Failed to auto-resume session: {e}")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    active_connections.add(websocket)
    
    # Send initial state immediately so UI doesn't stay "CHECKING" if market is closed/slow
    try:
        initial_payload = state.aggregator.get_full_market_state()
        await websocket.send_text(json.dumps({
            "type": "MARKET_UPDATE",
            "data": initial_payload
        }))
    except Exception as e:
        logging.error(f"Failed to send initial WS payload: {e}")

    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        active_connections.remove(websocket)

@app.get("/api/fyers/callback", tags=["legacy"])
async def legacy_fyers_callback(auth_code: str = Query(None)):
    """Aliases the old broker redirect URI to the new modular auth router."""
    if auth_code:
        return RedirectResponse(url=f"/api/auth/fyers/callback?auth_code={auth_code}")
    from config import FRONTEND_URL
    return RedirectResponse(url=f"{FRONTEND_URL}?auth_error=no_auth_code")

@app.get("/api/kite/callback", tags=["legacy"])
@app.get("/api/zerodha/callback", tags=["legacy"])
async def legacy_kite_callback(request_token: str = Query(None)):
    """Aliases the old broker redirect URI to the new modular auth router."""
    if request_token:
        return RedirectResponse(url=f"/api/auth/kite/callback?request_token={request_token}")
    from config import FRONTEND_URL
    return RedirectResponse(url=f"{FRONTEND_URL}?auth_error=no_request_token")

@app.get("/")
async def root():
    return {"status": "QuantFlux Production API Running", "broker": state.active_broker_name}
