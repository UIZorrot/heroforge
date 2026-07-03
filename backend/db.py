import json
from contextlib import contextmanager
from functools import lru_cache
from typing import Any, Dict, Iterable, Optional

import psycopg
from psycopg import sql
from psycopg.rows import dict_row

from config import get_settings


SCHEMA_SQL = """
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    email_verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS login_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL,
    code_hash text NOT NULL,
    salt text NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0,
    consumed_at timestamptz,
    ip_address text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_codes_email_created_at ON login_codes(email, created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash text NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    ip_address text,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

CREATE TABLE IF NOT EXISTS heroes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    source_payload jsonb NOT NULL,
    hero_payload jsonb NOT NULL,
    pvp_life_state text NOT NULL DEFAULT 'active',
    pve_life_state text NOT NULL DEFAULT 'active',
    card_status text NOT NULL DEFAULT 'active',
    locked_reason text,
    pvp_dead_at timestamptz,
    decomposed_at timestamptz,
    active_pvp_entry_id uuid,
    equipped_relic_type text,
    enchantment jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (pvp_life_state IN ('active', 'pvp_dead')),
    CHECK (pve_life_state IN ('active', 'pve_injured')),
    CHECK (card_status IN ('active', 'locked', 'decomposed'))
);

ALTER TABLE heroes ADD COLUMN IF NOT EXISTS pvp_life_state text NOT NULL DEFAULT 'active';
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS pve_life_state text NOT NULL DEFAULT 'active';
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS card_status text NOT NULL DEFAULT 'active';
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS locked_reason text;
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS pvp_dead_at timestamptz;
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS decomposed_at timestamptz;
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS active_pvp_entry_id uuid;
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS equipped_relic_type text;
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS enchantment jsonb;

CREATE INDEX IF NOT EXISTS idx_heroes_user_id_created_at ON heroes(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_heroes_user_pvp_life_state ON heroes(user_id, pvp_life_state);
CREATE INDEX IF NOT EXISTS idx_heroes_active_pvp_entry ON heroes(active_pvp_entry_id);

CREATE TABLE IF NOT EXISTS battles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    battle_type text NOT NULL,
    payload jsonb NOT NULL,
    result jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_battles_user_id_created_at ON battles(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS user_wallets (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    dust_balance bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_relics (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    relic_type text NOT NULL,
    amount bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, relic_type),
    CHECK (amount >= 0)
);

CREATE INDEX IF NOT EXISTS idx_user_relics_type ON user_relics(relic_type);

CREATE TABLE IF NOT EXISTS resource_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_type text NOT NULL CHECK (resource_type IN ('dust', 'relic')),
    resource_key text,
    delta bigint NOT NULL,
    balance_after bigint,
    reason text NOT NULL,
    ref_type text,
    ref_id uuid,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (resource_type <> 'relic' OR resource_key IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_resource_transactions_user_created_at ON resource_transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resource_transactions_type_key ON resource_transactions(resource_type, resource_key);

CREATE TABLE IF NOT EXISTS hero_generations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    source_payload jsonb NOT NULL,
    llm_payload jsonb NOT NULL,
    generator_payload jsonb NOT NULL,
    template text,
    bp_requested integer,
    bp_final integer,
    model_name text,
    prompt_version text,
    source_image_hash text,
    source_image_url text,
    status text NOT NULL DEFAULT 'completed',
    error text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hero_generations_user_created_at ON hero_generations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_hero_generations_template ON hero_generations(template);

CREATE TABLE IF NOT EXISTS battle_participants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    battle_id uuid NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
    side text NOT NULL CHECK (side IN ('A', 'B')),
    slot_index integer NOT NULL DEFAULT 0,
    hero_id uuid REFERENCES heroes(id) ON DELETE SET NULL,
    hero_snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (battle_id, side, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_battle_participants_battle_id ON battle_participants(battle_id);
CREATE INDEX IF NOT EXISTS idx_battle_participants_hero_id ON battle_participants(hero_id);

CREATE TABLE IF NOT EXISTS pve_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    theme_key text NOT NULL,
    entry_cost_dust bigint NOT NULL DEFAULT 0,
    seed bigint,
    status text NOT NULL DEFAULT 'active',
    current_floor integer NOT NULL DEFAULT 1,
    max_floor_reached integer NOT NULL DEFAULT 1,
    run_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    result_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pve_runs_user_created_at ON pve_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pve_runs_theme_status ON pve_runs(theme_key, status);

CREATE TABLE IF NOT EXISTS pve_run_party (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES pve_runs(id) ON DELETE CASCADE,
    slot_index integer NOT NULL,
    hero_id uuid REFERENCES heroes(id) ON DELETE SET NULL,
    hero_snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_pve_run_party_run_id ON pve_run_party(run_id);
CREATE INDEX IF NOT EXISTS idx_pve_run_party_hero_id ON pve_run_party(hero_id);

CREATE TABLE IF NOT EXISTS pve_run_stages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id uuid NOT NULL REFERENCES pve_runs(id) ON DELETE CASCADE,
    floor_index integer NOT NULL,
    enemy_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    battle_result jsonb NOT NULL DEFAULT '{}'::jsonb,
    reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    cleared boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (run_id, floor_index)
);

CREATE INDEX IF NOT EXISTS idx_pve_run_stages_run_id ON pve_run_stages(run_id);

CREATE TABLE IF NOT EXISTS audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL,
    entity_type text,
    entity_id uuid,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created_at ON audit_logs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS pvp_queue_entries (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    queue_key text NOT NULL DEFAULT 'default',
    battle_mode text NOT NULL DEFAULT '1v1',
    stake_dust bigint NOT NULL DEFAULT 0,
    bp_value integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'waiting',
    team_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    formation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    opponent_entry_id uuid REFERENCES pvp_queue_entries(id) ON DELETE SET NULL,
    match_id uuid,
    expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
    matched_at timestamptz,
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (stake_dust >= 0),
    CHECK (bp_value >= 0),
    CHECK (status IN ('waiting', 'matched', 'cancelled', 'expired')),
    CHECK (battle_mode IN ('1v1', '4v4', 'arena_2x3'))
);

CREATE INDEX IF NOT EXISTS idx_pvp_queue_entries_lookup ON pvp_queue_entries(queue_key, battle_mode, status, bp_value, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_queue_entries_user_status ON pvp_queue_entries(user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS pvp_matches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    queue_key text NOT NULL DEFAULT 'default',
    battle_mode text NOT NULL DEFAULT '1v1',
    entry_a_id uuid NOT NULL REFERENCES pvp_queue_entries(id) ON DELETE CASCADE,
    entry_b_id uuid NOT NULL REFERENCES pvp_queue_entries(id) ON DELETE CASCADE,
    user_a_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stake_dust bigint NOT NULL DEFAULT 0,
    bp_a integer NOT NULL DEFAULT 0,
    bp_b integer NOT NULL DEFAULT 0,
    bp_gap_pct numeric(6, 2) NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'resolved',
    battle_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    battle_result jsonb NOT NULL DEFAULT '{}'::jsonb,
    formation_a jsonb NOT NULL DEFAULT '{}'::jsonb,
    formation_b jsonb NOT NULL DEFAULT '{}'::jsonb,
    reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    card_state_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
    battle_id uuid REFERENCES battles(id) ON DELETE SET NULL,
    winner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    winner_side text,
    created_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz,
    CHECK (status IN ('created', 'running', 'resolved', 'failed', 'cancelled')),
    CHECK (winner_side IS NULL OR winner_side IN ('A', 'B', 'Tie'))
);

CREATE INDEX IF NOT EXISTS idx_pvp_matches_queue_created_at ON pvp_matches(queue_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_matches_user_a_created_at ON pvp_matches(user_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pvp_matches_user_b_created_at ON pvp_matches(user_b_id, created_at DESC);

CREATE TABLE IF NOT EXISTS card_death_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    hero_id uuid NOT NULL REFERENCES heroes(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode text NOT NULL,
    source_type text NOT NULL,
    source_id uuid,
    side text,
    slot_key text,
    hp_before integer,
    hp_after integer,
    death_state text NOT NULL,
    revived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (mode IN ('pvp', 'pve')),
    CHECK (death_state IN ('pvp_dead', 'pve_injured'))
);

CREATE INDEX IF NOT EXISTS idx_card_death_records_user_created_at ON card_death_records(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_card_death_records_hero_created_at ON card_death_records(hero_id, created_at DESC);

CREATE TABLE IF NOT EXISTS daily_checkins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claim_date date NOT NULL,
    reward_dust bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, claim_date),
    CHECK (reward_dust >= 0)
);

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user_date ON daily_checkins(user_id, claim_date DESC);

CREATE TABLE IF NOT EXISTS daily_task_progress (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_date date NOT NULL,
    task_key text NOT NULL,
    progress integer NOT NULL DEFAULT 0,
    target integer NOT NULL DEFAULT 1,
    reward_dust bigint NOT NULL DEFAULT 0,
    claimed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, task_date, task_key),
    CHECK (progress >= 0),
    CHECK (target > 0),
    CHECK (reward_dust >= 0)
);

CREATE INDEX IF NOT EXISTS idx_daily_task_progress_user_date ON daily_task_progress(user_id, task_date DESC);

ALTER TABLE pvp_queue_entries ADD COLUMN IF NOT EXISTS formation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pvp_matches ADD COLUMN IF NOT EXISTS formation_a jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pvp_matches ADD COLUMN IF NOT EXISTS formation_b jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pvp_matches ADD COLUMN IF NOT EXISTS reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pvp_matches ADD COLUMN IF NOT EXISTS card_state_changes jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'pvp_queue_entries_battle_mode_check'
          AND conrelid = 'pvp_queue_entries'::regclass
    ) THEN
        ALTER TABLE pvp_queue_entries DROP CONSTRAINT pvp_queue_entries_battle_mode_check;
    END IF;

    ALTER TABLE pvp_queue_entries
    ADD CONSTRAINT pvp_queue_entries_battle_mode_check
    CHECK (battle_mode IN ('1v1', '4v4', 'arena_2x3'));
END $$;
"""


@lru_cache(maxsize=1)
def get_database_url() -> str:
    return get_settings().database_url


def get_database_schema() -> str:
    return get_settings().db_schema


def _set_search_path(conn) -> None:
    schema = get_database_schema()
    with conn.cursor() as cur:
        cur.execute(sql.SQL("SET search_path TO {}, public").format(sql.Identifier(schema)))


def _connect():
    database_url = get_database_url()
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL is not configured and SUB_URL/SUB_PASS could not be converted into a database URL"
        )
    conn = psycopg.connect(database_url, row_factory=dict_row)
    _set_search_path(conn)
    return conn


def initialize_schema() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            schema = get_database_schema()
            cur.execute(sql.SQL("CREATE SCHEMA IF NOT EXISTS {}").format(sql.Identifier(schema)))
            cur.execute(sql.SQL("SET search_path TO {}, public").format(sql.Identifier(schema)))
            cur.execute(SCHEMA_SQL)
        conn.commit()


@contextmanager
def get_connection():
    conn = _connect()
    try:
        yield conn
    finally:
        conn.close()


def fetch_one(query: str, params: Optional[Iterable[Any]] = None) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params or ())
            return cur.fetchone()


def fetch_all(query: str, params: Optional[Iterable[Any]] = None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params or ())
            return cur.fetchall()


def execute(query: str, params: Optional[Iterable[Any]] = None) -> None:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(query, params or ())
        conn.commit()


def upsert_user(email: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (email, email_verified_at)
                VALUES (%s, now())
                ON CONFLICT (email)
                DO UPDATE SET email_verified_at = now()
                RETURNING id, email, email_verified_at, created_at
                """,
                (email,),
            )
            user = cur.fetchone()
        conn.commit()
        return user


def ensure_user_wallet(user_id, initial_balance: Optional[int] = None):
    if initial_balance is None:
        initial_balance = get_settings().starter_dust_balance
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_wallets (user_id, dust_balance)
                VALUES (%s, %s)
                ON CONFLICT (user_id) DO NOTHING
                """,
                (user_id, int(initial_balance)),
            )
        conn.commit()


def get_user_wallet(user_id):
    ensure_user_wallet(user_id)
    return fetch_one(
        """
        SELECT user_id, dust_balance, created_at, updated_at
        FROM user_wallets
        WHERE user_id = %s
        """,
        (user_id,),
    )


def get_recent_resource_transactions(user_id, limit: int = 20):
    return fetch_all(
        """
        SELECT id, resource_type, resource_key, delta, balance_after, reason, ref_type, ref_id, metadata, created_at
        FROM resource_transactions
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (user_id, limit),
    )


def record_resource_transaction(
    user_id,
    resource_type: str,
    delta: int,
    reason: str,
    resource_key: Optional[str] = None,
    balance_after: Optional[int] = None,
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO resource_transactions (
                    user_id, resource_type, resource_key, delta, balance_after,
                    reason, ref_type, ref_id, metadata
                )
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id, created_at
                """,
                (
                    user_id,
                    resource_type,
                    resource_key,
                    delta,
                    balance_after,
                    reason,
                    ref_type,
                    ref_id,
                    serialize_json(metadata or {}),
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return row


def adjust_dust_balance(user_id, delta: int, reason: str, ref_type: Optional[str] = None, ref_id: Optional[str] = None, metadata: Optional[Dict[str, Any]] = None):
    ensure_user_wallet(user_id)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT dust_balance
                FROM user_wallets
                WHERE user_id = %s
                FOR UPDATE
                """,
                (user_id,),
            )
            wallet = cur.fetchone()
            current_balance = int(wallet["dust_balance"] if wallet else 0)
            next_balance = current_balance + int(delta)
            if next_balance < 0:
                raise ValueError("Insufficient dust")
            cur.execute(
                """
                UPDATE user_wallets
                SET dust_balance = %s, updated_at = now()
                WHERE user_id = %s
                """,
                (next_balance, user_id),
            )
            cur.execute(
                """
                INSERT INTO resource_transactions (
                    user_id, resource_type, delta, balance_after, reason, ref_type, ref_id, metadata
                )
                VALUES (%s, 'dust', %s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id, created_at
                """,
                (
                    user_id,
                    int(delta),
                    next_balance,
                    reason,
                    ref_type,
                    ref_id,
                    serialize_json(metadata or {}),
                ),
            )
            txn = cur.fetchone()
        conn.commit()
        return {"balance": next_balance, "transaction": txn}


def ensure_user_relic(user_id, relic_type: str):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO user_relics (user_id, relic_type)
                VALUES (%s, %s)
                ON CONFLICT (user_id, relic_type) DO NOTHING
                """,
                (user_id, relic_type),
            )
        conn.commit()


def get_user_relics(user_id):
    return fetch_all(
        """
        SELECT user_id, relic_type, amount, created_at, updated_at
        FROM user_relics
        WHERE user_id = %s
        ORDER BY relic_type ASC
        """,
        (user_id,),
    )


def adjust_relic_balance(
    user_id,
    relic_type: str,
    delta: int,
    reason: str,
    ref_type: Optional[str] = None,
    ref_id: Optional[str] = None,
    metadata: Optional[Dict[str, Any]] = None,
):
    ensure_user_relic(user_id, relic_type)
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT amount
                FROM user_relics
                WHERE user_id = %s AND relic_type = %s
                FOR UPDATE
                """,
                (user_id, relic_type),
            )
            row = cur.fetchone()
            current_amount = int(row["amount"] if row else 0)
            next_amount = current_amount + int(delta)
            if next_amount < 0:
                raise ValueError("Insufficient relics")
            cur.execute(
                """
                UPDATE user_relics
                SET amount = %s, updated_at = now()
                WHERE user_id = %s AND relic_type = %s
                """,
                (next_amount, user_id, relic_type),
            )
            cur.execute(
                """
                INSERT INTO resource_transactions (
                    user_id, resource_type, resource_key, delta, balance_after, reason, ref_type, ref_id, metadata
                )
                VALUES (%s, 'relic', %s, %s, %s, %s, %s, %s, %s::jsonb)
                RETURNING id, created_at
                """,
                (
                    user_id,
                    relic_type,
                    int(delta),
                    next_amount,
                    reason,
                    ref_type,
                    ref_id,
                    serialize_json(metadata or {}),
                ),
            )
            txn = cur.fetchone()
        conn.commit()
        return {"amount": next_amount, "transaction": txn}


def serialize_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)
