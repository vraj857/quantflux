from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_async_db
from app.models.session import BrokerSession
from app.broker_management.fyers import FyersAdapter
from app.broker_management.zerodha import ZerodhaAdapter
from app.state import state
from config import (
    KITE_API_KEY, KITE_API_SECRET, REDIRECT_URL,
    FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL, FRONTEND_URL
)
from typing import Dict, Any
import logging

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.get("/fyers/login")
async def get_fyers_login_url():
    """Generates the Fyers login URL."""
    try:
        adapter = FyersAdapter(FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL)
        from fyers_apiv3 import fyersModel
        session = fyersModel.SessionModel(
            client_id=adapter.client_id,
            secret_key=adapter.secret_key,
            redirect_uri=adapter.redirect_uri,
            response_type="code",
            grant_type="authorization_code"
        )
        url = session.generate_authcode()
        return {"url": url}
    except Exception as e:
        logging.error(f"Fyers URL Generation Error: {e}")
        return {"url": "", "error": str(e)}

@router.get("/fyers/callback")
async def fyers_callback(auth_code: str = Query(None), db: AsyncSession = Depends(get_async_db)):
    """Handles Fyers callback and exchanges code for token."""
    if not auth_code:
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_error=no_auth_code")
    
    try:
        adapter = FyersAdapter(FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL)
        access_token = await adapter.authenticate({"auth_code": auth_code})
        profile = await adapter.get_profile()
        
        # Persist session
        new_session = BrokerSession(
            broker="FYERS",
            access_token=access_token,
            user_name=profile.get("name"),
            user_id=profile.get("client_id"),
            extra_data=profile
        )
        db.add(new_session)
        await db.commit()
        
        # Update global state
        from app.main import on_tick_received
        adapter.on_tick_callback = on_tick_received
        state.active_broker = adapter
        state.active_broker_name = "FYERS"
        
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_success=fyers")
    except Exception as e:
        logging.error(f"Fyers Callback Error: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_error={str(e)}")

@router.get("/kite/login")
async def get_kite_login_url():
    """Generates the Zerodha login URL."""
    url = f"https://kite.zerodha.com/connect/login?v=3&api_key={KITE_API_KEY}"
    return {"url": url}

@router.get("/kite/callback")
async def kite_callback(request_token: str = Query(None), db: AsyncSession = Depends(get_async_db)):
    """Handles Zerodha callback."""
    if not request_token:
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_error=no_request_token")
        
    try:
        adapter = ZerodhaAdapter(KITE_API_KEY, KITE_API_SECRET)
        access_token = await adapter.authenticate({"request_token": request_token})
        profile = await adapter.get_profile()
        
        # Persist session
        new_session = BrokerSession(
            broker="ZERODHA",
            access_token=access_token,
            user_name=profile.get("name"),
            user_id=profile.get("client_id")
        )
        db.add(new_session)
        await db.commit()
        
        # Update global state
        from app.main import on_tick_received
        adapter.on_tick_callback = on_tick_received
        state.active_broker = adapter
        state.active_broker_name = "ZERODHA"
        
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_success=zerodha")
    except Exception as e:
        logging.error(f"Zerodha Callback Error: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_error={str(e)}")

@router.post("/configure")
async def configure_broker(data: dict):
    """Manually set broker credentials/token."""
    broker = data.get("broker", "ZERODHA")
    token = data.get("access_token")
    if broker == "FYERS":
        adapter = FyersAdapter(FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL)
        adapter.access_token = token
        from fyers_apiv3 import fyersModel
        adapter.api = fyersModel.FyersModel(client_id=adapter.client_id, token=token, is_async=False, log_path="")
        from app.main import on_tick_received
        adapter.on_tick_callback = on_tick_received
        state.active_broker = adapter
        state.active_broker_name = "FYERS"
    elif broker == "ZERODHA":
        adapter = ZerodhaAdapter(KITE_API_KEY, KITE_API_SECRET)
        adapter.access_token = token
        from kiteconnect import KiteConnect
        adapter.api = KiteConnect(api_key=KITE_API_KEY)
        adapter.api.set_access_token(token)
        from app.main import on_tick_received
        adapter.on_tick_callback = on_tick_received
        state.active_broker = adapter
        state.active_broker_name = "ZERODHA"
    return {"status": "success"}

@router.get("/status")
async def get_session_status(db: AsyncSession = Depends(get_async_db)):
    """Checks if a broker session is active. Falls back to DB if in-memory state was lost."""
    # Fast path: in-memory broker is already set
    if state.active_broker is not None:
        return {"authenticated": True, "broker": state.active_broker_name}

    # Slow path: try to restore from DB (happens after uvicorn --reload)
    from sqlalchemy import select
    result = await db.execute(
        select(BrokerSession)
        .filter(BrokerSession.is_active == 1)
        .order_by(BrokerSession.created_at.desc())
        .limit(1)
    )
    last_session = result.scalar_one_or_none()

    if not last_session:
        return {"authenticated": False, "broker": None}

    # Restore the adapter in-memory so the app works again
    try:
        from config import FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL, KITE_API_KEY, KITE_API_SECRET
        if last_session.broker == "FYERS":
            adapter = FyersAdapter(FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL)
            adapter.access_token = last_session.access_token
            from fyers_apiv3 import fyersModel
            adapter.api = fyersModel.FyersModel(
                client_id=adapter.client_id,
                token=adapter.access_token,
                is_async=False,
                log_path=""
            )
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

        logging.info(f"Session auto-restored from DB: {last_session.broker}")
        return {"authenticated": True, "broker": last_session.broker}
    except Exception as e:
        logging.error(f"Failed to auto-restore session: {e}")
        return {"authenticated": False, "broker": None}

@router.get("/profile")
async def get_broker_profile(db: AsyncSession = Depends(get_async_db)):
    """Returns the user profile from the most recent active broker session."""
    from sqlalchemy import select
    result = await db.execute(
        select(BrokerSession)
        .filter(BrokerSession.is_active == 1)
        .order_by(BrokerSession.created_at.desc())
        .limit(1)
    )
    session = result.scalar_one_or_none()
    if not session:
        return {"authenticated": False, "user_name": None, "user_id": None, "broker": None}
    return {
        "authenticated": True,
        "broker": session.broker,
        "user_name": session.user_name,
        "user_id": session.user_id,
    }

@router.post("/logout")
async def logout(db: AsyncSession = Depends(get_async_db)):
    """Logs out the current session: stops ticker, clears in-memory broker, marks DB sessions inactive."""
    from sqlalchemy import update
    try:
        # Stop active ticker if running
        if state.active_broker and hasattr(state.active_broker, 'stop_ticker'):
            try:
                await state.active_broker.stop_ticker()
            except Exception:
                pass

        # Clear in-memory state
        state.active_broker = None
        state.active_broker_name = None

        # Mark all DB sessions as inactive
        await db.execute(
            update(BrokerSession).values(is_active=0)
        )
        await db.commit()
        logging.info("User logged out. All sessions cleared.")
        return {"status": "success", "message": "Logged out successfully."}
    except Exception as e:
        logging.error(f"Logout error: {e}")
        return {"status": "error", "message": str(e)}
