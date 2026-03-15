import asyncio
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from main import app, set_feed_mode, FeedModeUpdate
import main

async def test_historical_toggle():
    print("--- Testing Feed Mode Swap (Mocked Fyers) ---")
    
    # 1. Test Fyers mock fallback
    main.active_broker = "FYERS"
    res1 = await set_feed_mode(FeedModeUpdate(mode="HISTORICAL", date="2026-03-13"))
    print("HISTORICAL FYERS RESPONSE:", res1)
    
    if main.historical_task:
        await main.historical_task
    print("Fyers Background Task finished processing.\n")
    
    # 2. Test Zerodha mock fallback
    print("--- Testing Feed Mode Swap (Mocked Zerodha) ---")
    main.active_broker = "ZERODHA"
    res2 = await set_feed_mode(FeedModeUpdate(mode="HISTORICAL", date="2026-03-12"))
    print("HISTORICAL ZERODHA RESPONSE:", res2)
    
    if main.historical_task:
        await main.historical_task
    print("Zerodha Background Task finished processing.")

if __name__ == "__main__":
    asyncio.run(test_historical_toggle())
