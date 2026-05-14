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
