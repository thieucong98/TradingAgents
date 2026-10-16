from datetime import datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from ...core.auth import (
    check_ip_rate_limit,
    generate_session_token,
    get_current_user,
    hash_password,
    hash_token,
    verify_password,
)
from ...core.config import settings
from ...core.database import db
from ...models.schemas import (
    AuthStatusResponse,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    UserProfile,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(req: LoginRequest, request: Request, response: Response):
    """Authenticate user with username and password, establish secure session."""
    client_ip = request.client.host if request.client else "unknown"
    check_ip_rate_limit(client_ip)

    user = db.get_user_by_username(req.username)
    if not user:
        # Avoid timing discrepancy for non-existent users
        verify_password("dummy", "00" * 16, "00" * 32)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password.",
        )

    # 1. Check account lockout status
    locked_until_str = user.get("locked_until")
    if locked_until_str:
        locked_until = datetime.fromisoformat(locked_until_str)
        now = datetime.utcnow()
        if now < locked_until:
            remaining_seconds = int((locked_until - now).total_seconds())
            remaining_mins = max(1, (remaining_seconds + 59) // 60)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Account is temporarily locked due to multiple failed login attempts. Please try again in {remaining_mins} minute(s).",
            )

    # 2. Verify password
    is_valid = verify_password(req.password, user["salt"], user["password_hash"])
    if not is_valid:
        updated_user = db.record_login_failure(
            req.username,
            settings.MAX_LOGIN_ATTEMPTS,
            settings.LOCKOUT_MINUTES,
        )
        attempts = updated_user.get("failed_login_attempts", 0) if updated_user else 1
        remaining_attempts = max(0, settings.MAX_LOGIN_ATTEMPTS - attempts)
        warning_msg = (
            f"Invalid username or password. {remaining_attempts} attempt(s) remaining before temporary lockout."
            if remaining_attempts > 0
            else f"Account has been locked for {settings.LOCKOUT_MINUTES} minutes due to failed attempts."
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=warning_msg,
        )

    # 3. Successful authentication: reset failure counters
    db.record_login_success(user["id"])

    # 4. Create cryptographically secure session
    raw_token = generate_session_token()
    token_digest = hash_token(raw_token)
    expires_at = (datetime.utcnow() + timedelta(days=settings.SESSION_EXPIRE_DAYS)).isoformat()
    user_agent = request.headers.get("user-agent", "unknown")

    db.create_session(
        token_hash=token_digest,
        user_id=user["id"],
        expires_at=expires_at,
        ip_address=client_ip,
        user_agent=user_agent,
    )

    # 5. Set HttpOnly session cookie
    max_age_seconds = settings.SESSION_EXPIRE_DAYS * 86400
    response.set_cookie(
        key=settings.SESSION_COOKIE_NAME,
        value=raw_token,
        max_age=max_age_seconds,
        expires=max_age_seconds,
        httponly=True,
        samesite="lax",
        secure=settings.SECURE_COOKIES,
        path="/",
    )

    profile = UserProfile(
        id=user["id"],
        username=user["username"],
        must_change_password=bool(user.get("must_change_password", False)),
        created_at=user.get("created_at", ""),
        last_login_at=datetime.utcnow().isoformat(),
    )

    return LoginResponse(
        success=True,
        user=profile,
        must_change_password=bool(user.get("must_change_password", False)),
        session_token=raw_token,
        message="Login successful",
    )


@router.get("/status", response_model=AuthStatusResponse)
async def auth_status(request: Request):
    """Check current authentication status without throwing 401."""
    token: str | None = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if not token:
        return AuthStatusResponse(authenticated=False, user=None, must_change_password=False)

    token_digest = hash_token(token)
    user = db.get_user_by_session(token_digest)
    if not user:
        return AuthStatusResponse(authenticated=False, user=None, must_change_password=False)

    profile = UserProfile(
        id=user["id"],
        username=user["username"],
        must_change_password=bool(user.get("must_change_password", False)),
        created_at=user.get("created_at", ""),
        last_login_at=user.get("last_login_at"),
    )
    return AuthStatusResponse(
        authenticated=True,
        user=profile,
        must_change_password=bool(user.get("must_change_password", False)),
    )


@router.get("/me", response_model=UserProfile)
async def get_me(current_user: dict[str, Any] = Depends(get_current_user)):
    """Get active user profile. Requires valid authentication."""
    return UserProfile(
        id=current_user["id"],
        username=current_user["username"],
        must_change_password=bool(current_user.get("must_change_password", False)),
        created_at=current_user.get("created_at", ""),
        last_login_at=current_user.get("last_login_at"),
    )


@router.post("/logout")
async def logout(request: Request, response: Response):
    """Revoke session and clear session cookie."""
    token: str | None = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        auth_header = request.headers.get("authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()

    if token:
        token_digest = hash_token(token)
        db.delete_session(token_digest)

    response.delete_cookie(
        key=settings.SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
    )
    return {"success": True, "message": "Successfully logged out"}


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    request: Request,
    current_user: dict[str, Any] = Depends(get_current_user),
):
    """Change user password, verifying current password and setting new PBKDF2 hash."""
    user = db.get_user_by_id(current_user["id"])
    if not user:
        raise HTTPException(status_code=404, detail="User account not found.")

    # 1. Verify current password
    if not verify_password(req.current_password, user["salt"], user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    # 2. Prevent setting same password
    if verify_password(req.new_password, user["salt"], user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password cannot be identical to your current password.",
        )

    # 3. Hash and store new password, revoking any concurrent sessions while preserving current session
    new_hash, new_salt = hash_password(req.new_password)
    current_token_digest = getattr(request.state, "current_token_digest", None)
    db.update_user_password(user["id"], new_hash, new_salt, keep_token_hash=current_token_digest)

    return {
        "success": True,
        "message": "Password changed successfully. Your account is now secured.",
    }
