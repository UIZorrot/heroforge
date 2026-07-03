import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from db import execute, fetch_one, get_connection, upsert_user, ensure_user_wallet
from email_service import send_login_code
from config import get_settings
from starter_cards import seed_starter_cards


LOGIN_CODE_TTL_MINUTES = 10
LOGIN_SESSION_TTL_DAYS = 30
MAX_LOGIN_CODE_ATTEMPTS = 5
LOGIN_CODE_RESEND_COOLDOWN_SECONDS = 60


def _now_utc():
    return datetime.now(timezone.utc)


def _normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def _hash_with_salt(value: str, salt: str) -> str:
    payload = f"{salt}:{value}".encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def create_login_code(email: str, ip_address: Optional[str] = None) -> Dict[str, Any]:
    email = _normalize_email(email)
    if not email:
        raise ValueError("Email is required")

    latest_code = fetch_one(
        """
        SELECT created_at
        FROM login_codes
        WHERE email = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (email,),
    )
    if latest_code and (_now_utc() - latest_code["created_at"]).total_seconds() < LOGIN_CODE_RESEND_COOLDOWN_SECONDS:
        raise ValueError("Please wait before requesting another code")

    code = f"{secrets.randbelow(1000000):06d}"
    salt = secrets.token_hex(16)
    code_hash = _hash_with_salt(code, salt)
    expires_at = _now_utc() + timedelta(minutes=LOGIN_CODE_TTL_MINUTES)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO login_codes (email, code_hash, salt, expires_at, ip_address)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, email, expires_at, created_at
                """,
                (email, code_hash, salt, expires_at, ip_address),
            )
            row = cur.fetchone()
        conn.commit()

    send_login_code(email, code, get_settings().app_url)
    return {"email": email, "expires_at": expires_at.isoformat(), "id": str(row["id"])}


def verify_login_code(email: str, code: str, ip_address: Optional[str] = None, user_agent: Optional[str] = None) -> Dict[str, Any]:
    email = _normalize_email(email)
    code = (code or "").strip()
    if not email or not code:
        raise ValueError("Email and code are required")

    code_row = fetch_one(
        """
        SELECT id, code_hash, salt, expires_at, attempts, consumed_at
        FROM login_codes
        WHERE email = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (email,),
    )
    if not code_row:
        raise ValueError("Invalid code")

    if code_row["consumed_at"] is not None:
        raise ValueError("Code already used")

    if code_row["attempts"] >= MAX_LOGIN_CODE_ATTEMPTS:
        raise ValueError("Too many attempts")

    if code_row["expires_at"] <= _now_utc():
        raise ValueError("Code expired")

    expected_hash = _hash_with_salt(code, code_row["salt"])
    if expected_hash != code_row["code_hash"]:
        execute(
            "UPDATE login_codes SET attempts = attempts + 1 WHERE id = %s",
            (code_row["id"],),
        )
        raise ValueError("Invalid code")

    user = upsert_user(email)
    ensure_user_wallet(user["id"])
    seed_starter_cards(user["id"])
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = _now_utc() + timedelta(days=LOGIN_SESSION_TTL_DAYS)

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE login_codes
                SET consumed_at = now()
                WHERE id = %s
                """,
                (code_row["id"],),
            )
            cur.execute(
                """
                INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, expires_at, created_at
                """,
                (user["id"], token_hash, expires_at, ip_address, user_agent),
            )
            session_row = cur.fetchone()
        conn.commit()

    return {
        "token": token,
        "session_id": str(session_row["id"]),
        "expires_at": expires_at.isoformat(),
        "user": {"id": str(user["id"]), "email": user["email"]},
    }


def get_user_from_token(token: Optional[str]):
    if not token:
        return None
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = fetch_one(
        """
        SELECT s.id AS session_id, s.user_id, s.expires_at, u.email
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = %s
          AND s.revoked_at IS NULL
          AND s.expires_at > now()
        LIMIT 1
        """,
        (token_hash,),
    )
    if not row:
        return None
    return {
        "session_id": str(row["session_id"]),
        "id": str(row["user_id"]),
        "email": row["email"],
        "expires_at": row["expires_at"].isoformat() if hasattr(row["expires_at"], "isoformat") else str(row["expires_at"]),
    }


def revoke_session(token: Optional[str]) -> None:
    if not token:
        return
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    execute(
        """
        UPDATE sessions
        SET revoked_at = now()
        WHERE token_hash = %s
        """,
        (token_hash,),
    )
