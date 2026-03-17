import asyncio
import sqlite3
import os
import sys

# Add backend dir to path to import config
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from config import FYERS_APP_ID

async def verify_token():
    db_path = "market_slots_v2.db"
    if not os.path.exists(db_path):
        print(f"Error: {db_path} not found")
        return

    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get the most recent active token
        cursor.execute("SELECT access_token, broker FROM broker_sessions WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1;")
        row = cursor.fetchone()
        
        if not row:
            print("No active sessions found in DB.")
            return

        token = row[0]
        broker = row[1]
        print(f"Testing {broker} session with token: {token[:10]}...")

        if broker == "FYERS":
            from fyers_apiv3 import fyersModel
            # Note: app_id for Fyers V3 usually includes the client_id
            client_id = FYERS_APP_ID
            if "-100" not in client_id:
                client_id = f"{client_id}-100"
                
            fyers = fyersModel.FyersModel(client_id=client_id, token=token, is_async=False, log_path="")
            profile = fyers.get_profile()
            print(f"Fyers Profile Response: {profile}")
            
            if profile.get("s") == "error":
                print(f"TOKEN EXPIRED: {profile.get('message')}")
            else:
                print("TOKEN IS VALID")
                
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(verify_token())
