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
from app.services.broker_state import state_store, market_pubsub
from app.core.audit import audit_log
from app.workers.reauth import start_reauth_worker, fyers_breaker, zerodha_breaker
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

@app.middleware("http")
async def audit_middleware(request, call_next):
    """Action-aware Audit Middleware for Enterprise Compliance."""
    start_time = datetime.utcnow()
    response = await call_next(request)
    
    # Simple heuristic to identify actions for the audit trail
    if request.method in ["POST", "PUT", "DELETE"]:
        duration = (datetime.utcnow() - start_time).total_seconds()
        audit_log.log_event(
            action=f"API_{request.method}",
            ip_address=request.client.host,
            status=str(response.status_code),
            message=f"Request to {request.url.path} handled in {duration}s"
        )
    return response

# Active local WebSocket connections (for this node)
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
    """
    Callback from broker adapters when a new tick arrives.
    Distributes events via Redis Pub/Sub for stateless scaling.
    """
    symbol = str(tick['symbol'])
    
    # Standardize tick for Pub/Sub distribution
    data = {
        "timestamp": tick.get('timestamp') or datetime.utcnow().isoformat(),
        "ltp": tick['ltp'],
        "symbol": symbol
    }
    
    # 1. Publish to Redis (Enterprise Scaling)
    await market_pubsub.publish_tick(symbol, data)
    
    # 2. Local Node Processing (Optional: can be handled by a dedicated Aggregator Worker)
    slot = await state.aggregator.process_candle(symbol, {
        "timestamp": data["timestamp"],
        "open": data["ltp"], "high": data["ltp"], "low": data["ltp"], "close": data["ltp"],
        "volume": tick.get('volume', 0)
    })
    
    if slot:
        payload = state.aggregator.get_full_market_state()
        await broadcast_payload({"type": "MARKET_UPDATE", "data": payload})

@app.on_event("startup")
async def startup_event():
    # 1. Initialize Database Tables
    from app.database import init_async_db
    await init_async_db()
    
    # 2. Load DNA Profiles into Memory
    async with AsyncSessionLocal() as db:
        from app.core.profiles import ProfileManager
        state.phase_dnas = await ProfileManager.get_all_active_dnas(db)
        logging.info(f"Loaded {len(state.phase_dnas)} Phase DNA profiles.")

    # 3. Session Auto-Resumption
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(BrokerSession).filter(BrokerSession.is_active == 1).order_by(BrokerSession.created_at.desc()).limit(1)
        )
        last_session = result.scalar_one_or_none()
        
        if last_session:
            try:
                adapter = None
                if last_session.broker == "FYERS":
                    adapter = FyersAdapter(FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL)
                    adapter.access_token = last_session.access_token
                    from fyers_apiv3 import fyersModel
                    adapter.api = fyersModel.FyersModel(client_id=adapter.client_id, token=adapter.access_token, is_async=False, log_path="")
                elif last_session.broker == "ZERODHA":
                    adapter = ZerodhaAdapter(KITE_API_KEY, KITE_API_SECRET)
                    adapter.access_token = last_session.access_token
                    from kiteconnect import KiteConnect
                    adapter.api = KiteConnect(api_key=KITE_API_KEY)
                    adapter.api.set_access_token(adapter.access_token)

                from app.api.auth import validate_and_cleanup_session
                if adapter and await validate_and_cleanup_session(adapter, last_session.id, db):
                    state.active_broker = adapter
                    state.active_broker_name = last_session.broker
                    logging.info(f"Auto-resumed valid {last_session.broker} session.")
                    
    # 4. Proactive Security Worker (Enterprise Self-Healing)
    start_reauth_worker()
    
    audit_log.log_event("SERVICE_STARTUP", message="QuantFlux Enterprise API Node Initialized")

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
