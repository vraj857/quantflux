import asyncio
import json
import websockets
import time

async def simulate_live_alerts():
    uri = "ws://127.0.0.1:8000/ws"
    async with websockets.connect(uri) as websocket:
        print("Connected to QuantFlux WS...")
        
        # We need to wait for the backend to have some data.
        # But our backend aggregator handles process_candle.
        # We can't easily push ticks TO the backend via WS (it's output only),
        # but the backend's ticker (Fyers/Zerodha) usually calls on_tick_received.
        
        # Instead, let's use a temporary API test script that calls a hidden/test endpoint 
        # or we just rely on the fact that get_full_market_state will run our new code.
        
        print("Listening for marketplace updates...")
        try:
            while True:
                msg = await websocket.recv()
                data = json.loads(msg)
                if data.get("type") == "MARKET_UPDATE":
                    market_data = data.get("data", {})
                    symbols = market_data.get("data", {})
                    for sym, info in symbols.items():
                        alerts = info.get("phase_alerts", [])
                        if alerts:
                            print(f"\n[ALERT detected for {sym}]")
                            for a in alerts:
                                print(f" - {a['type']}: {a['msg']}")
                        else:
                            print(f"No alerts for {sym} yet...")
                await asyncio.sleep(1)
        except Exception as e:
            print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(simulate_live_alerts())
