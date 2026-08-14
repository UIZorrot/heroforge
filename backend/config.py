import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote_plus, urlparse

from dotenv import load_dotenv


def _load_environment() -> None:
    env_path = Path(__file__).resolve().with_name(".env")
    if env_path.exists():
        load_dotenv(env_path)
    else:
        load_dotenv()


_load_environment()


@dataclass(frozen=True)
class Settings:
    openai_api_key: str
    openai_base_url: str
    openai_model: str
    kimi_api_key: str
    kimi_base_url: str
    kimi_model: str
    gemini_api_key: str
    gemini_model: str
    port: int
    database_url: str
    db_schema: str
    resend_api_key: str
    email_from: str
    app_url: str
    cors_origins: str
    starter_dust_balance: int
    dust_cost_forge: int
    dust_cost_repair: int
    dust_cost_pve_entry: int
    dust_cost_pvp_entry: int
    dust_cost_pvp_revive: int
    pvp_stake_dust: int
    pvp_match_tolerance_pct: int
    pvp_low_tier_relic_drop_pct: int
    pvp_queue_ttl_minutes: int
    pvp_battle_session_wait_seconds: int


def _get_int_env(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _build_supabase_database_url() -> str:
    raw_url = os.getenv("SUB_URL", "").strip()
    password = os.getenv("SUB_PASS", "").strip()
    if not raw_url or not password:
        return ""

    if raw_url.startswith(("postgres://", "postgresql://")):
        scheme, _, remainder = raw_url.partition("://")
        if "@" not in remainder:
            return ""
        credentials, _, host_and_path = remainder.rpartition("@")
        host_port, _, path = host_and_path.partition("/")
        if not credentials or not host_port or not path:
            return ""

        user = credentials.split(":", 1)[0].strip() or os.getenv("SUPABASE_DB_USER", "postgres").strip() or "postgres"
        db_name = path.split("?", 1)[0].strip() or os.getenv("SUPABASE_DB_NAME", "postgres").strip() or "postgres"
        return f"{scheme}://{user}:{quote_plus(password)}@{host_port}/{db_name}?sslmode=require"

    parsed = urlparse(raw_url)
    host = parsed.hostname or ""
    if not host.endswith("supabase.co"):
        return ""

    project_ref = host.split(".")[0]
    db_host = f"db.{project_ref}.supabase.co"
    user = os.getenv("SUPABASE_DB_USER", "postgres").strip() or "postgres"
    db_name = os.getenv("SUPABASE_DB_NAME", "postgres").strip() or "postgres"
    encoded_password = quote_plus(password)
    return f"postgresql://{user}:{encoded_password}@{db_host}:5432/{db_name}?sslmode=require"


def _normalize_database_url(raw_url: str) -> str:
    raw_url = raw_url.strip()
    if not raw_url:
        return ""

    parsed = urlparse(raw_url)
    if parsed.scheme in ("postgres", "postgresql") and parsed.username and parsed.password is not None and parsed.hostname:
        return raw_url

    if not raw_url.startswith(("postgres://", "postgresql://")):
        return raw_url

    scheme, _, remainder = raw_url.partition("://")
    if "@" not in remainder:
        return raw_url

    credentials, _, host_and_path = remainder.rpartition("@")
    if ":" not in credentials:
        return raw_url

    user, password = credentials.split(":", 1)
    host_port, _, path_and_query = host_and_path.partition("/")
    if not user or not host_port or not path_and_query:
        return raw_url

    db_name, _, query = path_and_query.partition("?")
    if not db_name:
        return raw_url

    encoded_password = quote_plus(password)
    suffix = f"?{query}" if query else ""
    return f"{scheme}://{user}:{encoded_password}@{host_port}/{db_name}{suffix}"


def get_settings() -> Settings:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if database_url:
        database_url = _normalize_database_url(database_url)
    else:
        database_url = _build_supabase_database_url()
    return Settings(
        openai_api_key=os.getenv("OPENAI_API_KEY", "").strip(),
        openai_base_url=os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
        or "https://api.openai.com/v1",
        openai_model=os.getenv("OPENAI_MODEL", "gpt-4o").strip() or "gpt-4o",
        kimi_api_key=os.getenv("KIMI_API_KEY", "").strip(),
        kimi_base_url=os.getenv("KIMI_BASE_URL", "https://api.moonshot.cn/v1").strip()
        or "https://api.moonshot.cn/v1",
        kimi_model=os.getenv("KIMI_MODEL", "kimi-k2.6").strip() or "kimi-k2.6",
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip(),
        port=int(os.getenv("PORT", "5544")),
        database_url=database_url,
        db_schema=os.getenv("DB_SCHEMA", "app").strip() or "app",
        resend_api_key=os.getenv("RESEND_API_KEY", "").strip() or os.getenv("RESEND_API", "").strip(),
        email_from=os.getenv("EMAIL_FROM", "no-reply@txzy.net").strip(),
        app_url=os.getenv("APP_URL", "http://localhost:5173").strip(),
        cors_origins=os.getenv("CORS_ORIGINS", "*").strip(),
        starter_dust_balance=_get_int_env("STARTER_DUST_BALANCE", 500),
        dust_cost_forge=_get_int_env("DUST_COST_FORGE", 100),
        dust_cost_repair=_get_int_env("DUST_COST_REPAIR", 60),
        dust_cost_pve_entry=_get_int_env("DUST_COST_PVE_ENTRY", 40),
        dust_cost_pvp_entry=_get_int_env("DUST_COST_PVP_ENTRY", 30),
        dust_cost_pvp_revive=_get_int_env("DUST_COST_PVP_REVIVE", 200),
        pvp_stake_dust=_get_int_env("PVP_STAKE_DUST", _get_int_env("DUST_COST_PVP_ENTRY", 30)),
        pvp_match_tolerance_pct=_get_int_env("PVP_MATCH_TOLERANCE_PCT", 5),
        pvp_low_tier_relic_drop_pct=_get_int_env("PVP_LOW_TIER_RELIC_DROP_PCT", 3),
        pvp_queue_ttl_minutes=_get_int_env("PVP_QUEUE_TTL_MINUTES", 10),
        pvp_battle_session_wait_seconds=_get_int_env("PVP_BATTLE_SESSION_WAIT_SECONDS", 5),
    )
