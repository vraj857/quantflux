import os
import time
import asyncio
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Ensure we can import our modules
import sys
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from fyers_client import FyersClient
from kite_streamer import MarketSlotTracker
from time_slots import SLOTS

load_dotenv()

FYERS_APP_ID = os.getenv("FYERS_APP_ID", "")
FYERS_ACCESS_TOKEN = os.getenv("FYERS_ACCESS_TOKEN", "") # Optionally set this if you have a valid token

def generate_mock_1min_candles(symbol, start_time, num_candles):
    """Generates realistic-looking 1-minute historical candles if no API is available."""
    candles = []
    current_time = start_time
    base_price = 2500.0 if "RELIANCE" in symbol else 450.0
    
    for i in range(num_candles):
        # Epoch, Open, High, Low, Close, Volume
        open_p = base_price + (i * 0.5)
        high_p = open_p + 2.0
        low_p = open_p - 1.0
        close_p = open_p + 1.0
        vol = 5000 + (i * 100)
        
        candles.append([
            int(current_time.timestamp()),
            round(open_p, 2),
            round(high_p, 2),
            round(low_p, 2),
            round(close_p, 2),
            vol
        ])
        current_time += timedelta(minutes=1)
        base_price = close_p
        
    return {"s": "ok", "candles": candles}

def fetch_or_mock_history(symbol):
    """Fetches real 1-min data from Fyers if credentials exist, else uses mock data."""
    if FYERS_APP_ID and FYERS_ACCESS_TOKEN and FYERS_ACCESS_TOKEN != "your_fyers_access_token":
        print(f"Fetching real 1-min historical data for {symbol} from Fyers...")
        client = FyersClient(FYERS_APP_ID, FYERS_ACCESS_TOKEN)
        # Fetch data for today
        today = datetime.now().strftime("%Y-%m-%d")
        data = {
            "symbol": f"{symbol}-EQ",
            "resolution": "1",
            "date_format": "1",
            "range_from": today,
            "range_to": today,
            "cont_flag": "1"
        }
        res = client.get_historical_data(data)
        if res and res.get("s") == "ok":
            return res
        else:
            print(f"Failed to fetch real data: {res}. Falling back to mock data.")
    
    print(f"Using generated mock 1-min historical data for {symbol}...")
    # Start at 09:15 AM today
    start = datetime.now().replace(hour=9, minute=15, second=0, microsecond=0)
    return generate_mock_1min_candles(symbol, start, 60) # Generate 60 mins of data

def run_simulation():
    symbol = "NSE:RELIANCE"
    print(f"--- Starting Fyers 1-Min Historical Replay Simulation for {symbol} ---")
    
    history_data = fetch_or_mock_history(symbol)
    
    if history_data.get("s") != "ok" or not history_data.get("candles"):
        print("No historical data available to simulate.")
        return

    candles = history_data["candles"]
    print(f"Loaded {len(candles)} 1-minute candles. Replaying through MarketSlotTracker...\n")
    
    # Initialize our generic tracker
    def log_cb(level, msg):
        print(f"[{level}] {msg}")
        
    tracker = MarketSlotTracker(symbol, log_callback=log_cb)
    
    cumulative_volume = 0
    
    for candle in candles:
        epoch = candle[0]
        close_price = candle[4] # We use close price as the LTP for the minute tick
        volume = candle[5]
        cumulative_volume += volume # Fyers websocket volume is usually cumulative for the day
        
        tick_time = datetime.fromtimestamp(epoch)
        # print(f"Processing Tick @ {tick_time.strftime('%H:%M:%S')} | LTP: {close_price} | Vol: {cumulative_volume}")
        
        # Process as if it was a real-time tick coming from the WebSocket stream
        tracker.process_tick(close_price, cumulative_volume, tick_time)
        
        # Optionally wait a bit to simulate live feed visually
        time.sleep(0.05)
        
    print("\n--- Simulation Complete ---")
    print("Final State of the Tracker:")
    print(tracker.get_metrics())

if __name__ == "__main__":
    run_simulation()
