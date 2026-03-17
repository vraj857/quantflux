import json
import logging
import asyncio
from typing import Any, Dict, Optional, List
import redis.asyncio as redis
from app.security.encryption import security_engine

# Configuration
REDIS_URL = "redis://localhost:6379/0"

class MockRedisClient:
    """Mock Redis client for local-only execution without a Redis server."""
    def __init__(self):
        self.data = {}
        self.subscribers = {}

    async def get(self, key): return self.data.get(key)
    async def set(self, key, value, ex=None): self.data[key] = value
    async def publish(self, channel, message):
        if channel in self.subscribers:
            for cb in self.subscribers[channel]:
                await cb(message)

    def pubsub(self): return MockPubSub(self)

class MockPubSub:
    def __init__(self, client):
        self.client = client
        self.channels = []
    async def subscribe(self, *channels): self.channels.extend(channels)
    async def unsubscribe(self, *channels): pass
    async def listen(self):
        # In a mock, we don't block; we just yield if messages arrive
        # (This is a simplification for local dev)
        yield {"type": "subscribe", "data": 1}

class RedisStateStore:
    """Stateless session coordination with In-Memory fallback."""
    def __init__(self, url: str = REDIS_URL):
        try:
            self.pool = redis.ConnectionPool.from_url(url, decode_responses=True)
            self.client = redis.Redis(connection_pool=self.pool)
            self.use_mock = False
            logging.info("RedisStateStore: Connected to Redis server.")
        except Exception:
            logging.warning("RedisStateStore: Redis server not found. Falling back to In-Memory Mock.")
            self.client = MockRedisClient()
            self.use_mock = True

    async def save_session(self, user_id: str, broker: str, tokens: Dict[str, str], metadata: Dict[str, Any] = None):
        key = f"quantflux:session:{user_id}:{broker}"
        payload = {"tokens": tokens, "metadata": metadata or {}, "status": "ACTIVE"}
        await self.client.set(key, json.dumps(payload))

    async def get_session(self, user_id: str, broker: str) -> Optional[Dict[str, Any]]:
        key = f"quantflux:session:{user_id}:{broker}"
        raw = await self.client.get(key)
        if not raw: return None
        data = json.loads(raw)
        try:
            data["access_token"] = security_engine.decrypt(
                data["tokens"]["encrypted_data"],
                data["tokens"]["wrapped_dek"],
                data["tokens"]["iv"]
            )
            return data
        except Exception as e:
            logging.error(f"Failed to decrypt session: {e}")
            return None

class MarketDataPubSub:
    """Scalable Market Data distribution with In-Memory fallback."""
    def __init__(self, url: str = REDIS_URL):
        try:
            self.client = redis.Redis.from_url(url)
            self.use_mock = False
        except Exception:
            self.client = MockRedisClient()
            self.use_mock = True

    async def publish_tick(self, symbol: str, tick_data: Dict[str, Any]):
        channel = f"market:ticks:{symbol}"
        await self.client.publish(channel, json.dumps(tick_data))

    async def subscribe_to_symbols(self, symbols: List[str], callback):
        if self.use_mock:
            logging.info(f"Local-Only Mode: Subscribing to {symbols} (In-Memory)")
            # Register the callback in the mock client for each symbol channel
            for s in symbols:
                channel = f"market:ticks:{s}"
                if channel not in self.client.subscribers:
                    self.client.subscribers[channel] = []
                self.client.subscribers[channel].append(callback)
            return
        
        pubsub = self.client.pubsub()
        await pubsub.subscribe(*[f"market:ticks:{s}" for s in symbols])
        try:
            async for message in pubsub.listen():
                if message['type'] == 'message':
                    await callback(json.loads(message['data']))
        finally:
            await pubsub.close()

# Global Persistence Handles
state_store = RedisStateStore()
market_pubsub = MarketDataPubSub()
