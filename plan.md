# Hero Forge Progress & Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement follow-up work task-by-task. Treat the sections below as the current source of truth.

**Goal:** Ship Hero Forge as a playable hero-forging and tactical combat game with a server-authoritative economy, stable Arena PvP, and a clean content expansion path.

**Architecture:** Keep the high-coupling systems server-authoritative in Flask + PostgreSQL: economy, card lifecycle, queueing, battle resolution, and settlement. Let the React frontend render state, enforce obvious input rules, and present the game loop. Prefer coupling-aware sequencing: stabilize shared core systems first, then expand low-coupling content modules.

**Tech Stack:** Flask, PostgreSQL/psycopg, pytest, React 19, TypeScript, Vite.

---

## How To Read This Plan

The project is split into two classes of work:

1. High-coupling core modules
   - shared by Forge, Vault, Train, Arena, economy, and future systems
   - changes here affect many parts of the app
   - these must stay stable before anything else scales

2. Low-coupling functional modules
   - valuable features that can move in parallel or later
   - typically have clearer boundaries and fewer downstream dependencies
   - these should not block the core loop

The main question for progress is not "how many tasks exist", but "which coupling class is stable".

---

## Current State Snapshot

### Verified

- Backend integration tests pass: `19 passed`
- Frontend production build passes
- Arena PvP is playable end-to-end
- Card lifecycle is exposed to the frontend
- Daily dust recovery exists
- Ladder shell exists

### Core Implementation Already Landed

- Forge economics are frozen at the MVP defaults
- Arena formation uses a 2 by 3 board
- Queue matchmaking uses the 5% lower-denominator BP rule
- Queue entry charges and refunds Dust correctly
- Match settlement persists reward payloads
- PvP-dead cards are blocked from Arena until revived
- Revive costs 200 Dust and restores Arena eligibility
- Battle results carry board history and range-aware targeting
- Hero list responses include lifecycle fields
- Forge no longer accepts materials or relic input; cards are generated first and relic enchantment is a separate operation

### Still Open

- Landing page / onboarding clarity
- Deeper PvE content beyond the current shell
- Chronicle expansion
- Relic marketplace
- Product polish and onboarding guidance

---

## High-Coupling Core Modules

These are the systems that define the game loop and should be treated as shared infrastructure.

| Module | Status | Evidence | Why It Matters | Next Step |
| --- | --- | --- | --- | --- |
| Resource / economy ledger | Done | [backend/config.py](/D:/_Project/HF/backend/config.py#L97), [backend/main.py](/D:/_Project/HF/backend/main.py#L634), [backend/db.py](/D:/_Project/HF/backend/db.py#L50) | Every mode spends or grants Dust / Relics | Keep ledger rules server-authoritative and avoid ad hoc client-side economy logic |
| Card lifecycle / vault state | Done | [backend/db.py](/D:/_Project/HF/backend/db.py#L50), [backend/main.py](/D:/_Project/HF/backend/main.py#L2201), [frontend/src/types.ts](/D:/_Project/HF/frontend/src/types.ts#L47) | Arena, Vault, revive, and future content all depend on lifecycle state | Preserve these fields as the canonical source of truth |
| Arena queue / matchmaking / settlement | Done | [backend/main.py](/D:/_Project/HF/backend/main.py#L1265), [backend/main.py](/D:/_Project/HF/backend/main.py#L2073), [backend/main.py](/D:/_Project/HF/backend/main.py#L1120) | This is the first formal competitive loop | Keep the BP rule, stake handling, and cancellation semantics stable |
| Battle engine / board snapshot | Done | [backend/battle_logic.py](/D:/_Project/HF/backend/battle_logic.py#L185), [backend/battle_logic.py](/D:/_Project/HF/backend/battle_logic.py#L759) | Battle output feeds PvP trust, replay, and future UX | Expand only after the state contract remains stable |
| Frontend API / type contract | Done | [frontend/src/lib/api.ts](/D:/_Project/HF/frontend/src/lib/api.ts#L166), [frontend/src/types.ts](/D:/_Project/HF/frontend/src/types.ts#L223) | UI correctness depends on matching backend state | Keep the TS types aligned with backend payloads |

### Core Risk Areas

- Economy invariants must not drift between snapshot, queue charge, refund, payout, and revive
- Card lifecycle checks must remain server-side only
- Queue locking must prevent duplicate or stale Arena entry
- Battle result payloads must stay stable enough for the frontend to render

---

## Low-Coupling Functional Modules

These modules matter, but they can move with less risk to the rest of the product.

| Module | Status | Evidence | Why It Matters | Next Step |
| --- | --- | --- | --- | --- |
| Daily dust activity | Done | [backend/main.py](/D:/_Project/HF/backend/main.py#L1620), [frontend/src/components/DailyActivity.tsx](/D:/_Project/HF/frontend/src/components/DailyActivity.tsx#L11) | Keeps players from hitting Dust dead-ends | Add richer task design only after economy shape is settled |
| Ladder shell | Done | [frontend/src/App.tsx](/D:/_Project/HF/frontend/src/App.tsx#L1466), [backend/main.py](/D:/_Project/HF/backend/main.py#L1540) | Provides a place for rank surfaces without blocking Arena | Expand after Arena telemetry is useful |
| PvE shell / Chronicle stub | Partial | [backend/main.py](/D:/_Project/HF/backend/main.py#L231), [frontend/src/App.tsx](/D:/_Project/HF/frontend/src/App.tsx#L1466) | Useful for retention and long-term progression | Build content only after core combat and economy stay stable |
| Landing page / onboarding | Needs work | [docs/game-overview.md](/D:/_Project/HF/docs/game-overview.md#L1), [docs/product-report.md](/D:/_Project/HF/docs/product-report.md#L1) | Strong first impression and conversion path | Simplify CTA flow and make the value proposition obvious |
| Relic marketplace | Not started | Spec-only | Important long-term economy layer | Keep deferred until reward and transaction patterns are stable |

### Low-Coupling Guidance

- Use these modules to improve retention or presentation, not to unblock core gameplay
- Avoid letting them introduce new shared contracts into the Arena or economy path
- If a feature needs changes in schema, settlement, and battle logic at once, it is probably not low-coupling

---

## Next Priority Order

1. Improve landing page and onboarding clarity
2. Expand PvE / Chronicle only if it can stay isolated from Arena and economy rules
3. Design relic marketplace rules after economy telemetry is meaningful
4. Add product analytics or telemetry for actual player behavior
5. Polish visual surfaces and retention surfaces once the main loop is stable

---

## What Is Not A Priority Right Now

- Reworking Arena core logic that already passes tests
- Moving battle settlement into the frontend
- Expanding PvE into a full content tree before the core loop is finished
- Building the relic marketplace before reward and transaction behavior is well understood
- Adding more shell features that do not change the playable loop

---

## Verification Status

- Backend integration suite: passing
- Frontend build: passing
- Arena loop: implemented and playable
- Remaining work: mostly product surface, expansion content, and presentation
