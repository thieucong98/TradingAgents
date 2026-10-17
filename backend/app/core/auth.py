import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

# HTTP Bearer scheme for optional Authorization: Bearer <token> header
security_bearer = HTTPBearer(auto_error=False)

# In-memory IP rate limiter: {ip_address: [timestamp, timestamp, ...]}
_ip_attempt_history: dict[str, list[float]] = {}
IP_WINDOW_SECONDS = 60
IP_MAX_ATTEMPTS = 10  # Max login requests per IP in 60s


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    """Hash password using PBKDF2-HMAC-SHA256 with 600,000 iterations (OWASP recommendation)."""
    if salt is None:
        salt = secrets.token_hex(16)
    salt_bytes = bytes.fromhex(salt)
    pwd_bytes = password.encode("utf-8")
    pwd_hash = hashlib.pbkdf2_hmac("sha256", pwd_bytes, salt_bytes, 600_000)
    return pwd_hash.hex(), salt


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    """Verify password in constant time using hmac.compare_digest."""
    try:
        calculated_hash, _ = hash_password(password, salt)
        return hmac.compare_digest(calculated_hash, password_hash)
    except Exception:
        return False


def hash_token(token: str) -> str:
    """Compute SHA-256 digest of session token for safe database storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_session_token() -> str:
    """Generate high-entropy 256-bit URL-safe token."""
    return secrets.token_urlsafe(32)


def check_ip_rate_limit(client_ip: str) -> None:
    """Prevent denial-of-service and aggressive brute force at the IP level."""
    now = time.time()
    attempts = _ip_attempt_history.get(client_ip, [])
    # Retain attempts within sliding window
    attempts = [t for t in attempts if now - t < IP_WINDOW_SECONDS]
    _ip_attempt_history[client_ip] = attempts

    if len(attempts) >= IP_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts from this IP address. Please wait a minute before retrying.",
        )
    _ip_attempt_history[client_ip].append(now)


def reset_ip_rate_limits() -> None:
    """Clear in-memory IP rate limiter history (useful for tests and administrative resets)."""
    _ip_attempt_history.clear()


def get_current_user(
    request: Request,
    bearer: HTTPAuthorizationCredentials | None = Depends(security_bearer),
) -> dict[str, Any]:
    """FastAPI dependency to extract and authenticate current user via cookie, Bearer token, or Internal Service Token."""
    # 0. Check Internal Service Pre-Shared Token (for microservice pipelines e.g. trading-podcast)
    internal_token = (
        request.headers.get("X-Internal-Token")
        or request.headers.get("X-API-Key")
        or (bearer.credentials if bearer else None)
    )
    configured_internal_token = os.getenv("TRADINGAGENTS_INTERNAL_TOKEN")
    if configured_internal_token and internal_token and hmac.compare_digest(internal_token, configured_internal_token):
        return {
            "id": "internal_service",
            "username": "internal_pipeline",
            "role": "system",
            "must_change_password": False,
        }
    # Delay database import to prevent circular dependency
    from .database import db

    token: str | None = None

    # 1. Check HttpOnly cookie (default for browser & EventSource)
    cookie_token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if cookie_token:
        token = cookie_token
    # 2. Check Bearer token (for curl, automated tests, or external API clients)
    elif bearer and bearer.credentials:
        token = bearer.credentials

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token_digest = hash_token(token)
    user = db.get_user_by_session(token_digest)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Attach session token to request state for potential logout handling
    request.state.current_token_digest = token_digest
    return user
