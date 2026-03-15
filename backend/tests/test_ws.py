import asyncio
import websockets
import json

async def check_ws():
    uri = "ws://127.0.0.1:8000/ws"
    try:
        async with websockets.connect(uri) as websocket:
            print("Connected to WS!")
            # Send a heartbeat
            await websocket.send("ping")
            # Wait for data
            for i in range(3):
                message = await websocket.recv()
                data = json.loads(message)
                print(f"Received update for {len(data['data'])} symbols")
    except Exception as e:
        print(f"Failed: {e}")

if __name__ == "__main__":
    asyncio.run(check_ws())
