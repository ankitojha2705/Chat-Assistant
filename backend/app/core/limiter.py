from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _get_user_key(request: Request) -> str:
    """Rate-limit by Authorization token (per-user) with IP as fallback."""
    auth = request.headers.get("Authorization", "").strip()
    if auth and auth.lower() != "bearer dev-token":
        return auth
    return get_remote_address(request)


limiter = Limiter(key_func=_get_user_key, default_limits=["200/minute"])
