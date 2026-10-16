import pytest
from fastapi.testclient import TestClient

from backend.app.core.auth import hash_password, reset_ip_rate_limits, verify_password
from backend.app.core.config import settings
from backend.app.core.database import db
from backend.app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _reset_test_user():
    """Ensure a clean admin user state and reset IP limiters before each auth test."""
    db._init_db()
    reset_ip_rate_limits()
    client.cookies.clear()
    with db.get_connection() as conn:
        conn.execute("DELETE FROM user_sessions")
        # Reset admin to initial default password
        pwd_hash, salt = hash_password(settings.ADMIN_INITIAL_PASSWORD)
        conn.execute(
            """
            UPDATE users
            SET password_hash = ?, salt = ?, must_change_password = 1,
                failed_login_attempts = 0, locked_until = NULL
            WHERE username = ?
            """,
            (pwd_hash, salt, settings.ADMIN_USERNAME),
        )
        conn.commit()
    yield
    client.cookies.clear()
    reset_ip_rate_limits()


def test_password_hashing_and_verification():
    raw_pwd = "SuperSecretPassword123!"
    pwd_hash, salt = hash_password(raw_pwd)

    assert pwd_hash is not None
    assert len(salt) == 32  # 16 bytes in hex

    assert verify_password(raw_pwd, salt, pwd_hash) is True
    assert verify_password("WrongPassword!", salt, pwd_hash) is False
    assert verify_password(raw_pwd, "00" * 16, pwd_hash) is False


def test_initial_admin_seeded():
    user = db.get_user_by_username(settings.ADMIN_USERNAME)
    assert user is not None
    assert user["username"] == settings.ADMIN_USERNAME
    assert user["must_change_password"] == 1
    assert verify_password(settings.ADMIN_INITIAL_PASSWORD, user["salt"], user["password_hash"]) is True


def test_login_success():
    res = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_INITIAL_PASSWORD},
    )
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["user"]["username"] == settings.ADMIN_USERNAME
    assert data["must_change_password"] is True
    assert settings.SESSION_COOKIE_NAME in res.cookies


def test_login_invalid_credentials():
    res = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": "WrongPassword123"},
    )
    assert res.status_code == 401
    assert "Invalid username or password" in res.json()["detail"]


def test_account_lockout_after_consecutive_failures():
    # Attempt 5 consecutive failed logins
    for i in range(5):
        res = client.post(
            "/api/v1/auth/login",
            json={"username": settings.ADMIN_USERNAME, "password": f"BadPassword{i}"},
        )
        if i < 4:
            assert res.status_code == 401
        else:
            # 5th attempt locks the account
            assert res.status_code in (401, 429)

    # 6th attempt should be blocked with 429 Too Many Requests
    blocked_res = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": "AnyPassword"},
    )
    assert blocked_res.status_code == 429
    assert "temporarily locked" in blocked_res.json()["detail"]


def test_auth_status_endpoint():
    # Without cookie
    unauth_res = client.get("/api/v1/auth/status")
    assert unauth_res.status_code == 200
    assert unauth_res.json()["authenticated"] is False

    # Log in and check status with cookie
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_INITIAL_PASSWORD},
    )
    session_cookie = login_res.cookies[settings.SESSION_COOKIE_NAME]

    auth_res = client.get(
        "/api/v1/auth/status",
        cookies={settings.SESSION_COOKIE_NAME: session_cookie},
    )
    assert auth_res.status_code == 200
    assert auth_res.json()["authenticated"] is True
    assert auth_res.json()["user"]["username"] == settings.ADMIN_USERNAME
    assert auth_res.json()["must_change_password"] is True


def test_change_password_flow():
    # 1. Log in
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_INITIAL_PASSWORD},
    )
    cookie = login_res.cookies[settings.SESSION_COOKIE_NAME]

    # 2. Change password with wrong current password -> 400
    bad_change = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "WrongCurrentPassword", "new_password": "NewStrongPassword@2026"},
        cookies={settings.SESSION_COOKIE_NAME: cookie},
    )
    assert bad_change.status_code == 400

    # 3. Change password successfully
    new_pwd = "UpdatedSecurePassword@2026!"
    good_change = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": settings.ADMIN_INITIAL_PASSWORD, "new_password": new_pwd},
        cookies={settings.SESSION_COOKIE_NAME: cookie},
    )
    assert good_change.status_code == 200
    assert good_change.json()["success"] is True

    # 4. Verify must_change_password is now False
    user = db.get_user_by_username(settings.ADMIN_USERNAME)
    assert user["must_change_password"] == 0

    # 5. Old password no longer works
    old_login = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_INITIAL_PASSWORD},
    )
    assert old_login.status_code == 401

    # 6. New password logs in successfully
    new_login = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": new_pwd},
    )
    assert new_login.status_code == 200
    assert new_login.json()["must_change_password"] is False


def test_protected_routes_reject_unauthenticated():
    # Direct access to protected endpoint without authentication
    res = client.get("/api/v1/jobs")
    assert res.status_code == 401
    assert "Authentication required" in res.json()["detail"]

    # Direct access with valid session
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_INITIAL_PASSWORD},
    )
    cookie = login_res.cookies[settings.SESSION_COOKIE_NAME]

    authed_res = client.get(
        "/api/v1/jobs",
        cookies={settings.SESSION_COOKIE_NAME: cookie},
    )
    assert authed_res.status_code == 200


def test_logout_revokes_session():
    # 1. Log in
    login_res = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_INITIAL_PASSWORD},
    )
    cookie = login_res.cookies[settings.SESSION_COOKIE_NAME]

    # 2. Access /me succeeds
    me_res = client.get("/api/v1/auth/me", cookies={settings.SESSION_COOKIE_NAME: cookie})
    assert me_res.status_code == 200

    # 3. Log out
    logout_res = client.post("/api/v1/auth/logout", cookies={settings.SESSION_COOKIE_NAME: cookie})
    assert logout_res.status_code == 200

    # 4. Access /me now fails with 401
    me_after_res = client.get("/api/v1/auth/me", cookies={settings.SESSION_COOKIE_NAME: cookie})
    assert me_after_res.status_code == 401


def test_change_password_revokes_concurrent_sessions():
    # 1. Create session A
    res_a = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_INITIAL_PASSWORD},
    )
    cookie_a = res_a.cookies[settings.SESSION_COOKIE_NAME]

    # 2. Create session B
    res_b = client.post(
        "/api/v1/auth/login",
        json={"username": settings.ADMIN_USERNAME, "password": settings.ADMIN_INITIAL_PASSWORD},
    )
    cookie_b = res_b.cookies[settings.SESSION_COOKIE_NAME]

    # Both sessions can access /me
    assert client.get("/api/v1/auth/me", cookies={settings.SESSION_COOKIE_NAME: cookie_a}).status_code == 200
    assert client.get("/api/v1/auth/me", cookies={settings.SESSION_COOKIE_NAME: cookie_b}).status_code == 200

    # 3. Change password via session A
    new_pwd = "RevocationTestPassword!2026"
    change_res = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": settings.ADMIN_INITIAL_PASSWORD, "new_password": new_pwd},
        cookies={settings.SESSION_COOKIE_NAME: cookie_a},
    )
    assert change_res.status_code == 200

    # 4. Session A is preserved
    assert client.get("/api/v1/auth/me", cookies={settings.SESSION_COOKIE_NAME: cookie_a}).status_code == 200

    # 5. Session B is revoked (401)
    assert client.get("/api/v1/auth/me", cookies={settings.SESSION_COOKIE_NAME: cookie_b}).status_code == 401

