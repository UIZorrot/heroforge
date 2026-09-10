# Hero Forge MVP Launch Checklist

## Scope Lock

First public MVP includes only:

- Forge
- Vault
- Train
- Arena
- Daily rewards
- Relic market

Vault MVP navigation currently opens directly on `Card`. The combined `Overview`
screen is intentionally hidden, not removed; its implementation remains available
for restoration after the card, shard, and relic views have stable information density.

Not in MVP:

- Chronicle / PvE campaign
- Stripe recharge
- Card brokerage ownership transfer
- Full ladder seasons and reward program

## P0 Before Public Launch

- Remove or disable preview-only entry points in production
- Set `VITE_APP_MODE=live` in public environments
- Ensure Home/Profile only show real data or explicit beta text
- Keep Chronicle visible only as a future-mode explanation, not a fake playable feature
- Verify OTP login works with real email delivery in production
- Verify Forge works with production Gemini credentials
- Verify Forge, Arena, Market, Daily, and Vault on one real account from end to end
- Verify a fresh new user can complete the first loop:
  login -> forge -> view card in vault -> train -> queue Arena -> claim daily -> open market
- Confirm backend integration tests are green before each release
- Confirm frontend production build is green before each release

## P1 Immediately After Public Launch

- Add lightweight product analytics for:
  - login success
  - first forge completion
  - first Arena queue
  - first market trade
  - daily claim rate
- Add a simple release checklist for environment variables and rollback
- Add basic error monitoring for frontend and backend
- Add a player-facing patch notes surface

## Deferred Until Later

- IP-level auth rate limiting and stronger abuse controls
- Recharge / Stripe
- Chronicle implementation
- Seasonal ladder expansion
- Card brokerage trading flow

## Runtime Mode Policy

Use one frontend environment switch:

- `VITE_APP_MODE=live` for the real backend and production data
- `VITE_APP_MODE=mock` for isolated local UI and battle preview testing

This may enable:

- mock login
- demo session mode
- fake store pricing
- preview-only profile stats
- marketing-only landing content

The mode defaults to `live`. Mock mode never sends requests to the backend, and its browser storage is namespaced separately from live mode. Never deploy `VITE_APP_MODE=mock` to a public environment.
