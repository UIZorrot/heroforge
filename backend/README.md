# Backend

Gameplay changes are maintained in [CHANGELOG.md](../CHANGELOG.md). Current combat rules and concrete plans for missing features are in [the battle feature contract](../docs/battle-feature-contract.md).

This service handles:

- forging heroes from image input
- running 1v1 and team battles
- email-code login through Resend
- saving users, sessions, heroes, and battles in PostgreSQL

## Architecture

- `LLM stage`: chooses name, description, BP, template, stat weights, and skill structure
- `Numeric generator stage`: pure rule-based stat and skill value generation
- `Battle engine`: deterministic battle simulation with limited randomness
- `Storage`: Supabase Postgres or any PostgreSQL connection string
- `Email`: Resend for login codes
- `LLM`: OpenAI-compatible API (OpenAI preferred, Kimi fallback)
## Environment

Required:

- `OPENAI_API_KEY` (preferred) or `KIMI_API_KEY` (fallback)
- `OPENAI_BASE_URL` / `OPENAI_MODEL` when using OpenAI
- `KIMI_BASE_URL` / `KIMI_MODEL` when using Kimi
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `APP_URL`
- `CORS_ORIGINS`
- `DUST_COST_FORGE`
- `DUST_COST_REPAIR`
- `DUST_COST_PVE_ENTRY`
- `DUST_COST_PVP_ENTRY`
- `DUST_COST_PVP_REVIVE`
- `PVP_STAKE_DUST`
- `PVP_MATCH_TOLERANCE_PCT`
- `PVP_LOW_TIER_RELIC_DROP_PCT`
- `PVP_QUEUE_TTL_MINUTES`
- `PVP_BATTLE_SESSION_WAIT_SECONDS`

Database:

- preferred: `DATABASE_URL`
- or Supabase direct connection inputs:
  - `SUB_URL`
  - `SUB_PASS`
  - optional `SUPABASE_DB_USER`
  - optional `SUPABASE_DB_NAME`
- `DB_SCHEMA` defaults to `app`

Example Supabase style:

```env
SUB_URL=https://<project-ref>.supabase.co
SUB_PASS=your-supabase-db-password
SUPABASE_DB_USER=postgres
SUPABASE_DB_NAME=postgres
DB_SCHEMA=app
```

## Run

```bash
cd backend
uv sync
uv run python main.py
```

## Integration Tests

The backend includes end-to-end API tests that spin up a temporary Docker PostgreSQL container, exercise the real Flask routes, and write local debug artifacts.

Run them with:

```bash
cd backend
uv run pytest
```

Artifacts are written to:

- `backend/test-results/integration-report.json`
- `backend/test-results/postgres.log`
- `backend/test-results/pytest.log`

The test suite covers:

- email login and authenticated session checks
- economy snapshot reads
- forge generation and battle persistence
- repair, PvP entry, and PvE entry costs

## Auth flow

1. `POST /api/auth/request-code`
2. `POST /api/auth/verify-code`
3. Send the returned token as `Authorization: Bearer <token>`

## Main routes

- `GET /api/health`
- `POST /api/forge`
- `POST /api/battle`
- `POST /api/battle/team`
- `POST /api/economy/repair`
- `POST /api/economy/pvp-entry`
- `POST /api/cards/<card_id>/equip-relic`
- `POST /api/cards/<card_id>/enchant`
- `POST /api/cards/<card_id>/wash-enchant`
- `POST /api/pvp/join`
- `GET /api/pvp/entries/<entry_id>`
- `POST /api/pvp/cancel`
- `GET /api/me/economy`
- `GET /api/me/heroes`
- `GET /api/me/battles`
- `POST /api/pve/start`

## Notes

- Do not commit real secrets into `.env`.
- `SUB_URL` and `SUB_PASS` are interpreted as a Supabase Postgres connection.
- Business tables are created in the configured `DB_SCHEMA` instead of `public`.
- The numeric generator is rule-based; there is no AI in the final stat calculation.

## Schema Summary

Current core tables:

- `users`: account identity
- `login_codes`: email OTP login challenges
- `sessions`: bearer session tokens
- `heroes`: finalized hero cards
- `battles`: battle summaries

Economy tables:

- `user_wallets`: per-user dust balance
- `user_relics`: per-user relic inventory by type
- `resource_transactions`: immutable resource ledger

Generation and progression tables:

- `hero_generations`: full forge provenance and model output
- `battle_participants`: per-fighter battle snapshots
- `pve_runs`: theme tower run header
- `pve_run_party`: heroes entering a PvE run
- `pve_run_stages`: each floor/result/reward
- `audit_logs`: optional admin/system audit trail

Recommended environment-backed economy defaults:

- `STARTER_DUST_BALANCE=500`
- `DUST_COST_FORGE=100`
- `DUST_COST_REPAIR=60`
- `DUST_COST_PVE_ENTRY=40`
- `DUST_COST_PVP_ENTRY=30`
- `DUST_COST_PVP_REVIVE=200`
- `PVP_STAKE_DUST=30`
- `PVP_MATCH_TOLERANCE_PCT=5`
- `PVP_LOW_TIER_RELIC_DROP_PCT=3`
- `PVP_QUEUE_TTL_MINUTES=10`
