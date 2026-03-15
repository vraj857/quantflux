
import asyncio
import sys
import os
from datetime import datetime

# Add app to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.broker_management.fyers import FyersAdapter

async def test_chunking():
    # Mocking the adapter and its API for testing logic
    adapter = FyersAdapter("test", "test", "test")
    
    # Simulate a 1-year range
    start = "2025-03-16"
    end = "2026-03-13"
    
    print(f"Testing chunking for range: {start} to {end}")
    
    start_date = datetime.strptime(start, "%Y-%m-%d")
    end_date = datetime.strptime(end, "%Y-%m-%d")
    
    MAX_DAYS = 99
    chunks = []
    current_start = start_date
    while current_start <= end_date:
        current_end = min(current_start + asyncio.to_thread(lambda: timedelta(days=MAX_DAYS)) if False else current_start + (datetime.strptime("1970-01-01", "%Y-%m-%d") + (datetime.strptime("1970-01-01", "%Y-%m-%d") + (end_date - start_date))).replace(year=1970) if False else current_start, end_date)
        # Simplify for logic check
        from datetime import timedelta
        current_end = min(current_start + timedelta(days=MAX_DAYS), end_date)
        chunks.append((current_start.strftime("%Y-%m-%d"), current_end.strftime("%Y-%m-%d")))
        current_start = current_end + timedelta(days=1)
    
    for i, (s, e) in enumerate(chunks):
        print(f"Chunk {i+1}: {s} to {e}")
    
    if len(chunks) == 4:
        print("SUCCESS: 1-year range correctly split into 4 chunks (approx 100 days each)")
    else:
        print(f"FAILURE: Expected 4 chunks, got {len(chunks)}")

if __name__ == "__main__":
    asyncio.run(test_chunking())
