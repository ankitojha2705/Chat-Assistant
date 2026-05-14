import hashlib
import json
from typing import Optional

import redis.asyncio as redis

from app.core.config import settings

redis_client = redis.from_url(settings.redis_url, decode_responses=True)


def make_cache_key(query: str, user_groups: list[str]) -> str:
    normalized = query.lower().strip()
    groups_str = ",".join(sorted(user_groups))
    raw = f"{normalized}:{groups_str}"
    return f"query:{hashlib.sha256(raw.encode()).hexdigest()}"


async def get_cached(key: str) -> Optional[dict]:
    data = await redis_client.get(key)
    return json.loads(data) if data else None


async def set_cached(key: str, value: dict, ttl: Optional[int] = None) -> None:
    await redis_client.setex(
        key,
        ttl or settings.cache_ttl,
        json.dumps(value),
    )


SESSION_TTL = 1800  # 30 minutes of inactivity expires the session
MAX_HISTORY = 20   # keep last 10 turns (user + assistant = 2 messages each)


async def get_session(session_id: str) -> list[dict]:
    data = await redis_client.get(f"session:{session_id}")
    return json.loads(data) if data else []


async def set_session(session_id: str, history: list[dict]) -> None:
    await redis_client.setex(
        f"session:{session_id}",
        SESSION_TTL,
        json.dumps(history[-MAX_HISTORY:]),
    )
