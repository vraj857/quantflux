import asyncio
import time

class TokenBucket:
    """
    Asynchronous Token Bucket rate limiter to prevent broker API bans.
    Ensures REST calls stay within requested limits (e.g., 10 requests per second).
    """
    
    def __init__(self, rate: float, capacity: int):
        self.rate = rate  # tokens per second
        self.capacity = capacity
        self.tokens = capacity
        self.last_refill = time.monotonic()
        self.lock = asyncio.Lock()

    async def consume(self, amount: int = 1):
        async with self.lock:
            while self.tokens < amount:
                await self.refill()
                if self.tokens < amount:
                    # Calculate wait time
                    wait_time = (amount - self.tokens) / self.rate
                    await asyncio.sleep(wait_time)
            
            self.tokens -= amount

    async def refill(self):
        now = time.monotonic()
        delta = now - self.last_refill
        new_tokens = delta * self.rate
        self.tokens = min(self.capacity, self.tokens + new_tokens)
        self.last_refill = now
