from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
import urllib.parse
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.infrastructure.database import get_async_db
from app.models.session import BrokerSession
from app.broker_management.fyers import FyersAdapter
from app.broker_management.zerodha import ZerodhaAdapter
from app.state import state
from config import (
    KITE_API_KEY, KITE_API_SECRET, REDIRECT_URL,
    FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL, FRONTEND_URL
)
from typing import Dict, Any
from app.infrastructure.logging import ql_logger as logging
from sqlalchemy import select, update, desc
from app.infrastructure.audit import audit_log
from app.workers.reauth import fyers_breaker, zerodha_breaker

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.get("/fyers/login")
async def get_fyers_login_url():
    """Generates the Fyers login URL."""
    try:
        from fyers_apiv3 import fyersModel
        client_id = f"{FYERS_APP_ID}-100" if "-" not in FYERS_APP_ID else FYERS_APP_ID
        session = fyersModel.SessionModel(
            client_id=client_id,
            secret_key=FYERS_SECRET_KEY,
            redirect_uri=FYERS_REDIRECT_URL,
            response_type="code",
            grant_type="authorization_code"
        )
        url = session.generate_authcode()
        logging.info(f"Fyers SDK Login URL: {url[:60]}...")
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
        
        # 1. Persist in DB (Transparently Encrypted)
        new_session = BrokerSession(
            broker="FYERS",
            encrypted_access_token=access_token,
            user_name=profile.get("name"),
            user_id=profile.get("client_id"),
            extra_data=profile,
            session_active=1
        )
        db.add(new_session)
        await db.commit()

        # 4. Activate in-memory state for immediate use
        state.active_broker = adapter
        state.active_broker_name = "FYERS"
        
        # 5. Audit Log
        audit_log.log_event("SESSION_CREATED", broker="FYERS", user_id=profile.get("client_id"), message="Fyers session established via callback")
        
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
        
        # 1. Persist in DB (Transparently Encrypted)
        new_session = BrokerSession(
            broker="ZERODHA",
            encrypted_access_token=access_token,
            user_name=profile.get("name"),
            user_id=profile.get("client_id"),
            session_active=1
        )
        db.add(new_session)
        await db.commit()

        # 4. Activate in-memory state for immediate use
        state.active_broker = adapter
        state.active_broker_name = "ZERODHA"
        
        # 5. Audit Log
        audit_log.log_event("SESSION_CREATED", broker="ZERODHA", user_id=profile.get("client_id"), message="Zerodha session established via callback")
        
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_success=zerodha")
    except Exception as e:
        logging.error(f"Zerodha Callback Error: {e}")
        return RedirectResponse(url=f"{FRONTEND_URL}?auth_error={str(e)}")

@router.post("/set-session")
async def set_broker_session(data: Dict[str, Any], db: AsyncSession = Depends(get_async_db)):
    """Manually set broker credentials/token with Enterprise Encryption."""
    broker = data.get("broker", "ZERODHA")
    token = data.get("access_token")
    user_id = data.get("user_id", "default_user") # Assuming a user_id is provided or default

    # 1. Persist in DB (Transparently Encrypted)
    new_session = BrokerSession(
        broker=broker,
        encrypted_access_token=token,
        user_id=user_id,
        session_active=1
    )
    db.add(new_session)
    await db.commit()
    
    # 4. Activate in-memory state if possible (requires re-initializing adapter)
    try:
        from app.broker_management.fyers import FyersAdapter
        from app.broker_management.zerodha import ZerodhaAdapter
        from config import FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL, KITE_API_KEY, KITE_API_SECRET
        
        adapter = None
        if broker == "FYERS":
            adapter = FyersAdapter(FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL)
            adapter.access_token = token
            from fyers_apiv3 import fyersModel
            adapter.api = fyersModel.FyersModel(client_id=FYERS_APP_ID, token=token, is_async=False, log_path="")
        elif broker == "ZERODHA":
            adapter = ZerodhaAdapter(KITE_API_KEY, KITE_API_SECRET)
            adapter.access_token = token
            from kiteconnect import KiteConnect
            adapter.api = KiteConnect(api_key=KITE_API_KEY)
            adapter.api.set_access_token(token)
            
        if adapter:
            state.active_broker = adapter
            state.active_broker_name = broker
            logging.info(f"Manual session activated in-memory for {broker}")
    except Exception as e:
        logging.warning(f"Could not activate manual session in-memory: {e}")

    # 5. Audit Log
    audit_log.log_event("SESSION_CREATED", broker=broker, user_id=user_id, message="Manual session established")
    
    return {"status": "success"}

async def validate_and_cleanup_session(adapter: Any, session_id: int, db: AsyncSession) -> bool:
    """Verifies a session and deactivates it in DB if expired."""
    logging.info(f"Validating session {session_id} for {adapter.__class__.__name__}...")
    if await adapter.validate_token():
        return True
    
    logging.warning(f"Session {session_id} is expired. Deactivating in DB.")
    from sqlalchemy import update
    await db.execute(
        update(BrokerSession)
        .where(BrokerSession.id == session_id)
        .values(session_active=0)
    )
    await db.commit()
    return False

@router.get("/status")
async def get_session_status(db: AsyncSession = Depends(get_async_db)):
    """Checks if a broker session is active. Falls back to DB if in-memory state was lost."""
    # Fast path: in-memory broker is already set
    if state.active_broker is not None:
        logging.info(f"Status check: Found in-memory broker {state.active_broker_name}. Validating...")
        if await state.active_broker.validate_token():
            return {"authenticated": True, "broker": state.active_broker_name}
        else:
            logging.warning(f"In-memory session for {state.active_broker_name} is expired. Clearing.")
            state.active_broker = None
            state.active_broker_name = None

    # Slow path: try to restore from DB
    result = await db.execute(
        select(BrokerSession)
        .where(BrokerSession.session_active == 1)
        .order_by(desc(BrokerSession.created_at))
        .limit(1)
    )
    last_session = result.scalar_one_or_none()

    if not last_session:
        logging.info("Status check: No active session found in DB.")
        return {"authenticated": False, "broker": None}

    logging.info(f"Status check: Attempting to restore session {last_session.id} ({last_session.broker}) from DB...")

    try:
        from config import FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL, KITE_API_KEY, KITE_API_SECRET
        
        # 1. Decrypted token is automatically returned by the ORM (Transparent Encryption)
        decrypted_token = last_session.encrypted_access_token

        adapter = None
        if last_session.broker == "FYERS":
            adapter = FyersAdapter(FYERS_APP_ID, FYERS_SECRET_KEY, FYERS_REDIRECT_URL)
            adapter.access_token = decrypted_token
            from fyers_apiv3 import fyersModel
            # Wrap in Circuit Breaker
            adapter.api = await fyers_breaker.call(
                lambda: fyersModel.FyersModel(client_id=adapter.client_id, token=adapter.access_token, is_async=False, log_path="")
            )
        elif last_session.broker == "ZERODHA":
            adapter = ZerodhaAdapter(KITE_API_KEY, KITE_API_SECRET)
            adapter.access_token = decrypted_token
            from kiteconnect import KiteConnect
            adapter.api = KiteConnect(api_key=KITE_API_KEY)
            # Wrap in Circuit Breaker
            await zerodha_breaker.call(lambda: adapter.api.set_access_token(adapter.access_token))

        if adapter and await validate_and_cleanup_session(adapter, last_session.id, db):
            # Restore to in-memory state for efficiency in current process
            state.active_broker = adapter
            state.active_broker_name = last_session.broker
            logging.info(f"Status check: Successfully restored and validated {last_session.broker} session.")
            
            # ── Auto-start ticker with default watchlist ──
            try:
                from app.api.watchlist import get_watchlist_symbols
                from app.main import on_tick_received
                symbols = await get_watchlist_symbols("Default", db)
                if symbols:
                    import asyncio
                    asyncio.create_task(adapter.start_ticker(symbols, on_tick_received))
                    logging.info(f"Auto-started ticker for {len(symbols)} symbols from 'Default' watchlist.")
            except Exception as tick_err:
                logging.warning(f"Could not auto-start ticker after session restore: {tick_err}")
            
            return {"authenticated": True, "broker": last_session.broker}
        
        logging.warning(f"Status check: Failed to validate {last_session.broker} session.")
        return {"authenticated": False, "broker": None}
    except Exception as e:
        logging.error(f"Failed to auto-restore session: {e}")
        return {"authenticated": False, "broker": None}

@router.get("/profile")
async def get_broker_profile(db: AsyncSession = Depends(get_async_db)):
    """Returns the user profile from the most recent active broker session."""
    # 1. Fast path: check in-memory state first
    if state.active_broker is not None:
        try:
            # Check for cached profile
            if not getattr(state.active_broker, 'profile', None):
                logging.info("Profile: In-memory broker has no cached profile. Fetching...")
                await state.active_broker.get_profile()

            profile = getattr(state.active_broker, 'profile', {})
            return {
                "authenticated": True,
                "broker": state.active_broker_name,
                "user_name": profile.get("name"),
                "user_id": profile.get("client_id") or getattr(state.active_broker, 'client_id_cached', None)
            }
        except Exception as e:
            logging.warning(f"Profile: Fast path fetch error: {e}")
            pass

    # 2. Slow path: Restore from DB
    result = await db.execute(
        select(BrokerSession)
        .where(BrokerSession.session_active == 1)
        .order_by(desc(BrokerSession.created_at))
        .limit(1)
    )
    last_session = result.scalar_one_or_none()
    
    if not last_session:
        return {"authenticated": False, "user_name": None, "user_id": None, "broker": None}

    # 3. Simple verification: if we have the data in DB and it's marked active, return it.
    # The frontend calls /status for hard validation, /profile is for UI display.
    return {
        "authenticated": True,
        "broker": last_session.broker,
        "user_name": last_session.user_name,
        "user_id": last_session.user_id,
    }

@router.post("/logout")
async def logout(background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_async_db)):
    """Logs out the current session: stops ticker (bg), clears state, marks DB sessions inactive."""
    from sqlalchemy import update
    try:
        # 1. Schedule ticker stop as a background task
        # This prevents SDK-level crashes/signals from killing the main API response
        if state.active_broker and hasattr(state.active_broker, 'stop_ticker'):
            background_tasks.add_task(state.active_broker.stop_ticker)

        # 2. Hard-reset in-memory state immediately
        state.active_broker = None
        state.active_broker_name = None

        # 3. Mark all DB sessions as inactive
        await db.execute(
            update(BrokerSession).values(session_active=0)
        )
        await db.commit()
        
        logging.info("Logout: User session cleared. Broker shutdown scheduled in background.")
        return {"status": "success", "message": "Logged out successfully."}
    except Exception as e:
        logging.error(f"Logout error: {e}")
        return {"status": "error", "message": str(e)}
