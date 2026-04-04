import os
from dataclasses import dataclass
from urllib.parse import quote_plus, urlparse

from dotenv import load_dotenv


load_dotenv()


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str
    gemini_model: str
    port: int
    database_url: str
    resend_api_key: str
    email_from: str
    app_url: str
    cors_origins: str
    starter_dust_balance: int
    dust_cost_forge: int
    dust_cost_repair: int
    dust_cost_pve_entry: int
    dust_cost_pvp_entry: int
    pvp_stake_dust: int
    pvp_match_tolerance_pct: int
    pvp_queue_ttl_minutes: int


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


def get_settings() -> Settings:
    database_url = os.getenv("DATABASE_URL", "").strip() or _build_supabase_database_url()
    return Settings(
        gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
        gemini_model=os.getenv("GEMINI_MODEL", "gemini-1.5-flash").strip(),
        port=int(os.getenv("PORT", "5544")),
        database_url=database_url,
        resend_api_key=os.getenv("RESEND_API_KEY", "").strip() or os.getenv("RESEND_API", "").strip(),
        email_from=os.getenv("EMAIL_FROM", "no-reply@txzy.net").strip(),
        app_url=os.getenv("APP_URL", "http://localhost:5173").strip(),
        cors_origins=os.getenv("CORS_ORIGINS", "*").strip(),
        starter_dust_balance=_get_int_env("STARTER_DUST_BALANCE", 500),
        dust_cost_forge=_get_int_env("DUST_COST_FORGE", 120),
        dust_cost_repair=_get_int_env("DUST_COST_REPAIR", 60),
        dust_cost_pve_entry=_get_int_env("DUST_COST_PVE_ENTRY", 40),
        dust_cost_pvp_entry=_get_int_env("DUST_COST_PVP_ENTRY", 30),
        pvp_stake_dust=_get_int_env("PVP_STAKE_DUST", _get_int_env("DUST_COST_PVP_ENTRY", 30)),
        pvp_match_tolerance_pct=_get_int_env("PVP_MATCH_TOLERANCE_PCT", 10),
        pvp_queue_ttl_minutes=_get_int_env("PVP_QUEUE_TTL_MINUTES", 10),
    )
