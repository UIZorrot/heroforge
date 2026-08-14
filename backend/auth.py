import hashlib
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from db import execute, fetch_all, fetch_one, get_connection, upsert_user, ensure_user_wallet
from email_service import send_login_code
from config import get_settings
from starter_cards import seed_starter_cards


LOGIN_CODE_TTL_MINUTES = 10
LOGIN_SESSION_TTL_DAYS = 30
MAX_LOGIN_CODE_ATTEMPTS = 5
LOGIN_CODE_RESEND_COOLDOWN_SECONDS = 60
AGENT_KEY_TTL_DAYS = 90
MAX_ACTIVE_AGENT_KEYS = 5
AGENT_KEY_PREFIX = "hf_agent_"
DEFAULT_AGENT_SCOPES = (
    "collection:read",
    "economy:read",
    "arena:queue",
    "battle:create",
    "battle:read",
    "battle:act",
)


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
        "auth_type": "session",
        "scopes": ["*"],
    }


def _public_agent_key(row: Dict[str, Any]) -> Dict[str, Any]:
    scopes = row.get("scopes") or []
    if isinstance(scopes, str):
        try:
            scopes = json.loads(scopes)
        except ValueError:
            scopes = []
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "key_prefix": row["key_prefix"],
        "scopes": [str(scope) for scope in scopes if isinstance(scope, str)],
        "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else str(row["created_at"]),
        "expires_at": row["expires_at"].isoformat() if hasattr(row["expires_at"], "isoformat") else str(row["expires_at"]),
        "last_used_at": row["last_used_at"].isoformat() if row.get("last_used_at") and hasattr(row["last_used_at"], "isoformat") else (str(row["last_used_at"]) if row.get("last_used_at") else None),
        "revoked_at": row["revoked_at"].isoformat() if row.get("revoked_at") and hasattr(row["revoked_at"], "isoformat") else (str(row["revoked_at"]) if row.get("revoked_at") else None),
    }


def _record_agent_key_audit(user_id: str, action: str, key_id: str, metadata: Optional[Dict[str, Any]] = None) -> None:
    execute(
        """
        INSERT INTO audit_logs (user_id, action, entity_type, entity_id, payload)
        VALUES (%s, %s, 'agent_api_key', %s, %s::jsonb)
        """,
        (user_id, action, key_id, json.dumps(metadata or {})),
    )


def create_agent_api_key(user_id: str, name: str) -> Dict[str, Any]:
    clean_name = " ".join((name or "").split())
    if not clean_name:
        raise ValueError("Key name is required")
    if len(clean_name) > 80:
        raise ValueError("Key name must be 80 characters or fewer")

    token = f"{AGENT_KEY_PREFIX}{secrets.token_urlsafe(32)}"
    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    expires_at = _now_utc() + timedelta(days=AGENT_KEY_TTL_DAYS)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (user_id,))
            cur.execute(
                """
                SELECT count(*) AS active_count
                FROM agent_api_keys
                WHERE user_id = %s AND revoked_at IS NULL AND expires_at > now()
                """,
                (user_id,),
            )
            active_count = int(cur.fetchone()["active_count"])
            if active_count >= MAX_ACTIVE_AGENT_KEYS:
                raise ValueError(f"A maximum of {MAX_ACTIVE_AGENT_KEYS} active Agent keys is allowed")
            cur.execute(
                """
                INSERT INTO agent_api_keys (user_id, name, key_prefix, key_hash, scopes, expires_at)
                VALUES (%s, %s, %s, %s, %s::jsonb, %s)
                RETURNING id, name, key_prefix, scopes, created_at, expires_at, last_used_at, revoked_at
                """,
                (user_id, clean_name, token[:16], token_hash, json.dumps(DEFAULT_AGENT_SCOPES), expires_at),
            )
            row = cur.fetchone()
        conn.commit()

    record = _public_agent_key(row)
    _record_agent_key_audit(user_id, "agent_key_created", record["id"], {"name": clean_name})
    return {"key": record, "secret": token}


def list_agent_api_keys(user_id: str) -> list[Dict[str, Any]]:
    rows = fetch_all(
        """
        SELECT id, name, key_prefix, scopes, created_at, expires_at, last_used_at, revoked_at
        FROM agent_api_keys
        WHERE user_id = %s
        ORDER BY created_at DESC
        """,
        (user_id,),
    )
    return [_public_agent_key(row) for row in rows]


def revoke_agent_api_key(user_id: str, key_id: str) -> Dict[str, Any]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE agent_api_keys
                SET revoked_at = COALESCE(revoked_at, now())
                WHERE id = %s AND user_id = %s
                RETURNING id, name, key_prefix, scopes, created_at, expires_at, last_used_at, revoked_at
                """,
                (key_id, user_id),
            )
            row = cur.fetchone()
        conn.commit()
    if not row:
        raise ValueError("Agent key not found")
    record = _public_agent_key(row)
    _record_agent_key_audit(user_id, "agent_key_revoked", record["id"], {"name": record["name"]})
    return record


def get_principal_from_token(token: Optional[str]):
    session_user = get_user_from_token(token)
    if session_user:
        return session_user
    if not token or not token.startswith(AGENT_KEY_PREFIX):
        return None

    token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
    row = fetch_one(
        """
        SELECT k.id AS agent_key_id, k.user_id, k.scopes, k.expires_at, u.email
        FROM agent_api_keys k
        JOIN users u ON u.id = k.user_id
        WHERE k.key_hash = %s
          AND k.revoked_at IS NULL
          AND k.expires_at > now()
        LIMIT 1
        """,
        (token_hash,),
    )
    if not row:
        return None
    execute("UPDATE agent_api_keys SET last_used_at = now() WHERE id = %s", (row["agent_key_id"],))
    scopes = row.get("scopes") or []
    if isinstance(scopes, str):
        try:
            scopes = json.loads(scopes)
        except ValueError:
            scopes = []
    return {
        "id": str(row["user_id"]),
        "email": row["email"],
        "agent_key_id": str(row["agent_key_id"]),
        "expires_at": row["expires_at"].isoformat() if hasattr(row["expires_at"], "isoformat") else str(row["expires_at"]),
        "auth_type": "agent_key",
        "scopes": [str(scope) for scope in scopes if isinstance(scope, str)],
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
