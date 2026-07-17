# Hero Forge Minimum Ops Plan

## Objective

This is the minimum operational bar for a public MVP. It is intentionally small. The goal is not full platform maturity; the goal is safe enough launch discipline.

## Runtime Split

- Frontend: static build served from a simple web host
- Backend: Flask app with production environment variables
- Database: PostgreSQL / Supabase Postgres
- Email: Resend
- Forge provider: Gemini

## Required Environment Checks

Backend:

- `DATABASE_URL` or valid Supabase connection inputs
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `APP_URL`
- `CORS_ORIGINS`

Frontend:

- `VITE_BACKEND_URL`
- `VITE_APP_MODE=live` for public environments; use `VITE_APP_MODE=mock` only for isolated local preview builds

## Release Flow

1. Run backend integration tests
2. Run frontend production build
3. Verify production env vars
4. Deploy backend
5. Deploy frontend
6. Run a smoke test:
   - request login code
   - verify login
   - forge one card
   - confirm Vault shows it
   - run Train
   - queue Arena
   - claim Daily reward
   - buy or sell one relic in Market

## Logging

Minimum requirement:

- capture backend stdout/stderr centrally
- preserve deploy timestamps
- preserve request failure traces

Preferred next step:

- add structured logs with request ids

## Health Checks

Backend:

- `GET /api/health`

Application smoke:

- one synthetic login-code request in non-production test environment
- one synthetic database read against economy snapshot

## Database Safety

Minimum:

- daily automated backup or Supabase equivalent retention
- confirm restore instructions exist before public launch

Recommended:

- document rollback contact and restore owner

## Rollback Rule

Rollback immediately if any of these happen after deploy:

- login code delivery fails broadly
- forge endpoint fails for valid requests
- Arena join or settlement starts failing
- resource ledger updates become inconsistent
- Market buy/sell stops settling correctly

## Security Backlog

These are not launch blockers for the current turn, but they should be scheduled next:

- IP-level auth rate limiting
- stricter CORS enforcement from config instead of wildcard
- abuse monitoring on OTP requests
- frontend/backend error monitoring
