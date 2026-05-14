import time
from typing import Optional

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel

from app.core.config import settings

security = HTTPBearer(auto_error=False)

_jwks_cache: dict = {"keys": None, "expires_at": 0.0}


class UserContext(BaseModel):
    sub: str
    email: str
    groups: list[str] = ["all"]
    dept: str = "general"
    is_admin: bool = False


async def _get_jwks() -> dict:
    now = time.time()
    if _jwks_cache["keys"] and now < _jwks_cache["expires_at"]:
        return _jwks_cache["keys"]
    async with httpx.AsyncClient() as client:
        resp = await client.get(settings.jwks_url)
        resp.raise_for_status()
        _jwks_cache["keys"] = resp.json()
        _jwks_cache["expires_at"] = now + 300
    return _jwks_cache["keys"]


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> UserContext:
    # Dev mode: no JWKS configured → accept dev-token or any bearer
    if not settings.jwks_url:
        return UserContext(
            sub="dev-user",
            email="dev@company.com",
            groups=["all", "engineering"],
            dept="engineering",
            is_admin=True,
        )

    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    try:
        jwks = await _get_jwks()
        payload = jwt.decode(
            credentials.credentials,
            jwks,
            algorithms=["RS256"],
            audience=settings.jwt_audience or None,
        )
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    groups: list[str] = payload.get("groups", [])
    if "all" not in groups:
        groups.append("all")

    return UserContext(
        sub=payload["sub"],
        email=payload.get("email", ""),
        groups=groups,
        dept=payload.get("department", "general"),
        is_admin="admin" in groups,
    )
