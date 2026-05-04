# Arena MVP Implementation Plan

## 1. Goal

Ship the first formal playable mode: Arena PvP.

The MVP must replace the current duel-shaped PvP with a web-first Arena mode where each player brings 1 to 4 cards, places them on a 2 by 3 formation board, matches only opponents within 5% total BP, pays 30 Dust to enter, and resolves automatically.

This plan prioritizes high-core, high-coupling systems first:

- card state,
- battle input and result shape,
- Arena queue and settlement,
- Dust accounting,
- revival,
- frontend formation UX.

Chronicle, relic trading, ladder, and advanced market systems are lower-coupling modules and should not block Arena MVP.

## 2. Locked MVP Rules

### 2.1 Formation

- Each side has 6 slots: 2 rows by 3 lanes.
- Slot keys are `front_0`, `front_1`, `front_2`, `back_0`, `back_1`, `back_2`.
- A player can deploy 1 to 4 cards.
- Empty slots are legal.
- Duplicate card IDs are illegal.
- Dead, decomposed, locked-for-trade, or already-queued cards are illegal.

### 2.2 Matchmaking

- Arena uses total team BP.
- Match is valid only if BP gap is within 5%.
- Use the stricter lower-BP denominator:

```text
gap_pct = abs(bp_a - bp_b) / min(bp_a, bp_b) * 100
valid if gap_pct <= 5
```

- If either side has `0 BP`, reject queue entry.
- Team sizes do not need to match.
- Only BP gap matters for MVP eligibility.

### 2.3 Dust Values

| Action | MVP Dust Value | Notes |
| --- | ---: | --- |
| Forge new card | 100 | Replace current backend default if still set to 120. |
| Arena entry | 30 | Charged when entering queue. |
| Arena winner payout | 60 | Winner receives both entries. |
| Arena tie | 30 refund each | No payout, both players receive their own entry back. |
| PvP revive | 200 | Fixed for MVP; no rarity/BP scaling yet. |

### 2.4 Rewards

- Winner receives the full Dust pool.
- Loser receives no Dust from the match.
- Tie refunds each player's own entry Dust.
- Winner has a small chance to receive a low-tier relic.
- Suggested first relic drop rate: 3%.
- Relic reward must be logged as a resource transaction.

### 2.5 Death and Revival

- Every card that reaches `0 HP` in formal Arena becomes `pvp_dead`.
- This applies to both winner and loser.
- `pvp_dead` cards cannot enter Arena.
- `pvp_dead` cards can still be visible in Vault.
- MVP can allow `pvp_dead` cards in Chronicle, because PvE death is tracked separately.
- Revival costs 200 Dust and returns the card to `active`.
- Revival creates both a Dust transaction and a card lifecycle record.

## 3. Backend Implementation Tasks

### 3.1 Configuration

Update `backend/config.py` defaults:

```text
DUST_COST_FORGE = 100
DUST_COST_PVP_ENTRY = 30
PVP_STAKE_DUST = 30
DUST_COST_PVP_REVIVE = 200
PVP_MATCH_TOLERANCE_PCT = 5
PVP_LOW_TIER_RELIC_DROP_PCT = 3
```

Keep environment overrides, but make the committed default match the design.

### 3.2 Database Migration

The current project keeps schema creation in `backend/db.py`. For MVP, add safe `ALTER TABLE IF EXISTS` style migrations or extend the schema bootstrap so existing databases gain the fields below.

#### Heroes

Add explicit card lifecycle state:

```sql
ALTER TABLE heroes
ADD COLUMN IF NOT EXISTS pvp_life_state text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS pve_life_state text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS card_status text NOT NULL DEFAULT 'active',
ADD COLUMN IF NOT EXISTS locked_reason text,
ADD COLUMN IF NOT EXISTS pvp_dead_at timestamptz,
ADD COLUMN IF NOT EXISTS decomposed_at timestamptz,
ADD COLUMN IF NOT EXISTS active_pvp_entry_id uuid;
```

Expected values:

```text
pvp_life_state: active, pvp_dead
pve_life_state: active, pve_injured
card_status: active, locked, decomposed
```

Indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_heroes_user_pvp_life_state ON heroes(user_id, pvp_life_state);
CREATE INDEX IF NOT EXISTS idx_heroes_active_pvp_entry ON heroes(active_pvp_entry_id);
```

#### PvP Queue Entries

Store submitted board positions separately from card snapshots:

```sql
ALTER TABLE pvp_queue_entries
ADD COLUMN IF NOT EXISTS formation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
```

Recommended payload:

```json
{
  "board": {
    "front_0": null,
    "front_1": "hero-id",
    "front_2": null,
    "back_0": "hero-id",
    "back_1": "hero-id",
    "back_2": "hero-id"
  },
  "slots": [
    { "slot": "front_1", "hero_id": "hero-id", "row": "front", "lane": 1 }
  ]
}
```

#### PvP Matches

Persist settlement, reward, and card-state deltas:

```sql
ALTER TABLE pvp_matches
ADD COLUMN IF NOT EXISTS formation_a jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS formation_b jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS card_state_changes jsonb NOT NULL DEFAULT '[]'::jsonb;
```

#### Card Death Records

Create a dedicated lifecycle audit table:

```sql
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
```

#### Daily Activity

Use two simple tables for MVP: one for sign-in, one for task progress.

```sql
CREATE TABLE IF NOT EXISTS daily_checkins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    claim_date date NOT NULL,
    reward_dust bigint NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, claim_date)
);

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
    UNIQUE (user_id, task_date, task_key)
);
```

MVP task keys:

- `daily_login`
- `forge_one_card`
- `enter_arena_once`
- `win_arena_once`
- `revive_or_decompose_once`

### 3.3 API Contract

#### Economy Snapshot

Extend `/api/economy/snapshot`:

```json
{
  "costs": {
    "forge": 100,
    "pvp_entry": 30,
    "pvp_revive": 200
  },
  "pvp": {
    "match_tolerance_pct": 5,
    "low_tier_relic_drop_pct": 3
  }
}
```

#### List Cards

Extend `/api/me/heroes` hero rows:

```json
{
  "id": "hero-id",
  "pvp_life_state": "active",
  "pve_life_state": "active",
  "card_status": "active",
  "locked_reason": null,
  "active_pvp_entry_id": null
}
```

#### Join Arena

Replace current duel-shaped join payload with formation payload:

```http
POST /api/pvp/join
```

```json
{
  "mode": "arena_2x3",
  "queueKey": "ranked",
  "formation": {
    "front_0": null,
    "front_1": "hero-id-a",
    "front_2": null,
    "back_0": "hero-id-b",
    "back_1": "hero-id-c",
    "back_2": "hero-id-d"
  }
}
```

Validation:

- authenticated user,
- 1 to 4 non-null card IDs,
- all cards belong to user,
- no duplicates,
- all cards `card_status = active`,
- all cards `pvp_life_state = active`,
- no selected card already has `active_pvp_entry_id`,
- total BP > 0,
- wallet has at least 30 Dust.

Successful waiting response:

```json
{
  "status": "waiting",
  "entry": {},
  "economy": {}
}
```

Matched response:

```json
{
  "status": "matched",
  "entry": {},
  "opponent": {},
  "match": {},
  "battle": {},
  "reward": {
    "dust_delta": 60,
    "relic_drop": null
  },
  "card_state_changes": []
}
```

#### Cancel Arena Queue

```http
POST /api/pvp/cancel
```

Rules:

- Only waiting entries can be cancelled.
- Refund 30 Dust.
- Clear `active_pvp_entry_id` on selected cards.

#### Poll Arena Entry

```http
GET /api/pvp/entries/:entry_id
```

Return entry, match, battle result, reward payload, and card state changes when resolved.

#### Revive Card

```http
POST /api/cards/:card_id/revive
```

Rules:

- card must belong to current user,
- card must have `pvp_life_state = pvp_dead`,
- wallet must have at least 200 Dust,
- subtract 200 Dust with reason `pvp_revive`,
- set `pvp_life_state = active`,
- clear `pvp_dead_at`,
- update latest open `card_death_records.revived_at`,
- return updated card and economy snapshot.

#### Daily Activity

```http
GET /api/daily/me
POST /api/daily/sign-in/claim
POST /api/daily/tasks/:task_key/claim
```

`GET /api/daily/me` returns today's check-in state and task progress.

`POST /api/daily/sign-in/claim` grants a small fixed Dust amount once per day.

`POST /api/daily/tasks/:task_key/claim` grants task Dust only when `progress >= target` and `claimed_at IS NULL`.

### 3.4 Backend Logic Changes

#### Queue Join

Replace `heroIds + battleMode` as the source of truth with `formation`.

Implementation steps:

1. Parse and normalize 6 slots.
2. Extract non-null card IDs.
3. Load cards with lifecycle fields.
4. Compute total BP.
5. Charge 30 Dust.
6. Insert `pvp_queue_entries` with `formation_snapshot`.
7. Lock selected cards by setting `active_pvp_entry_id`.
8. Find opponent with same `queue_key`, `mode = arena_2x3`, and 5% lower-denominator BP gap.
9. If no opponent is found, return waiting response.
10. If matched, create `pvp_matches`, resolve battle, settle rewards, mark card deaths, clear queue locks.

#### Match Resolution

Settlement order should be deterministic:

1. Save battle result.
2. Determine winner side or tie.
3. Apply Dust payout or tie refunds.
4. Roll low-tier relic only for non-tie winner.
5. Detect all cards with final HP `<= 0`.
6. Mark those cards `pvp_dead`.
7. Insert `card_death_records`.
8. Clear `active_pvp_entry_id` for both teams.
9. Persist `reward_payload` and `card_state_changes`.

If battle resolution throws, refund both entries and clear card locks.

#### Battle Engine

Update `backend/battle_logic.py` to support `arena_2x3` input.

MVP targeting rules:

- Front row protects back row in the same lane.
- If same-lane front enemy exists, melee attacks target it first.
- If same-lane front is empty, melee can target nearest occupied front slot, then nearest back slot.
- Ranged, spell, and support skills can use lane distance but do not need full pathfinding.
- Distance is lane delta plus row penalty.
- Board history should include slot key, HP, max HP, side, and card ID for replay.

This can be simple for MVP. The important requirement is a stable, explainable board-state shape for frontend replay.

### 3.5 Backend Test Cases

Add integration tests in `backend/tests/integration/test_backend_api.py` or a new Arena test file:

- config snapshot returns forge `100`, Arena entry `30`, revive `200`, BP tolerance `5`.
- queue rejects 0 cards.
- queue rejects more than 4 cards.
- queue rejects duplicate slots.
- queue rejects `pvp_dead` cards.
- queue charges 30 Dust.
- cancel refunds 30 Dust.
- expired queue refunds 30 Dust.
- matching accepts 1000 vs 1050 BP.
- matching rejects 1000 vs 1051 BP.
- winner receives 60 Dust.
- loser receives 0 Dust.
- tie refunds 30 Dust to both players.
- all cards with final HP `<= 0` become `pvp_dead`.
- revive costs 200 Dust and returns card to `active`.
- daily check-in can be claimed once per day.
- daily task cannot be claimed before target progress.
- daily task cannot be claimed twice.

## 4. Frontend Implementation Tasks

### 4.1 Types

Update `frontend/src/types.ts`:

```ts
export type ArenaSlotKey =
  | 'front_0'
  | 'front_1'
  | 'front_2'
  | 'back_0'
  | 'back_1'
  | 'back_2';

export type CardPvpLifeState = 'active' | 'pvp_dead';
export type CardStatus = 'active' | 'locked' | 'decomposed';

export type ArenaFormation = Record<ArenaSlotKey, string | null>;
```

Extend `SavedHero`, `PvpQueueEntry`, and `PvpMatchRecord` with lifecycle, formation, reward, and state-change fields.

### 4.2 API Client

Update `frontend/src/lib/api.ts`:

- `joinPvpQueue(formation, queueKey, token)`
- `cancelPvpEntry(entryId, token)`
- `fetchPvpEntryStatus(entryId, token)`
- `reviveCard(cardId, token)`
- `fetchDaily(token)`
- `claimDailyCheckin(token)`
- `claimDailyTask(taskKey, token)`

The frontend should not calculate rewards itself. It displays backend settlement payloads.

### 4.3 Arena Screen

Refactor `frontend/src/components/PvpArena.tsx`.

Required screen areas:

- Header: Arena name, current Dust, entry cost, BP tolerance.
- Formation board: 2 rows by 3 lanes.
- Vault picker: eligible cards only by default, with toggle to show dead/locked cards.
- Selected team summary: card count, total BP, empty slots.
- Queue action: enter, cancel, resume.
- Match result: winner, Dust delta, relic drop, card deaths.
- Revival prompt: dead cards with `Revive for 200 Dust` button.

Button states:

- `Enter Arena`: enabled only when 1 to 4 valid cards are placed and wallet has at least 30 Dust.
- `Cancel Queue`: enabled only for waiting queue entry.
- `Clear Result`: enabled after result has been acknowledged.
- `Revive`: enabled only for `pvp_dead` card and wallet has at least 200 Dust.

Validation copy:

- "Place 1 to 4 active cards."
- "This card is dead. Revive it before Arena."
- "This card is already queued."
- "Need 30 Dust to enter Arena."
- "Arena only matches opponents within 5% total BP."

### 4.4 Board Interaction

MVP interaction can be click-based instead of drag-and-drop:

1. Click a card in Vault.
2. Click an empty board slot.
3. Click an occupied slot to remove or replace.
4. Board persists in local storage until queue starts.
5. Board locks while queued.

Drag-and-drop can be added later after the data contract is stable.

### 4.5 Battle Visualizer

Update `frontend/src/components/BattleVisualizer.tsx` to render the 2 by 3 board from backend `boardHistory`.

Minimum visual states:

- alive,
- damaged,
- dead this match,
- empty slot,
- winner side,
- tie.

Use card portraits and compact stat chips. MVP does not need animation-heavy combat, but it should clearly show which cards died and why revival is needed.

### 4.6 Vault and Card Face

Update Vault/card display:

- show `pvp_dead` badge,
- disable Arena select for dead cards,
- show revive CTA,
- show card lifecycle tooltip,
- preserve visual card appeal instead of making dead cards look useless.

Death should feel consequential, not like a broken asset.

### 4.7 Daily Rewards UI

Add a small daily activity surface, either on Home/Profile first:

- claim daily sign-in Dust,
- show task list,
- show progress,
- claim completed task rewards,
- link Arena-related tasks to Arena screen.

MVP daily rewards are primarily a Dust safety valve so players are not permanently stuck after Forge, Arena entry, and revival costs.

### 4.8 Frontend Test and Verification

At minimum:

- TypeScript build passes.
- Arena screen renders with no heroes.
- Arena screen renders with active and dead heroes.
- Enter button is disabled without Dust.
- Enter button is disabled with invalid formation.
- Revive button calls API and refreshes economy/heroes.
- Battle result displays tie refund and winner payout correctly.

## 5. Recommended Development Order

### Phase 1: Data and Config

- Set Dust and BP defaults.
- Add lifecycle, formation, death record, match reward, and daily tables/fields.
- Extend economy snapshot and hero list response.

Exit condition: backend starts against an existing database without destructive migration.

### Phase 2: Arena Backend Rules

- Accept formation payload.
- Validate cards and board.
- Charge and refund 30 Dust correctly.
- Match with 5% lower-denominator BP rule.
- Keep existing auto-resolution path if possible, but feed it formation-aware teams.

Exit condition: API tests prove queue, cancel, match, tie refund, and payout.

### Phase 3: Death and Revival

- Detect dead cards from battle result.
- Persist `pvp_dead`.
- Block dead cards from Arena.
- Add revive endpoint.

Exit condition: a dead Arena card cannot requeue until revived for 200 Dust.

### Phase 4: Arena Frontend

- Replace roster-only Arena UI with 2 by 3 board.
- Update API client and types.
- Show costs, BP tolerance, queue state, result, deaths, and revive CTA.

Exit condition: a player can complete one Arena match from the browser.

### Phase 5: Daily Activity

- Add daily tables and endpoints.
- Add simple UI surface.
- Wire progress events from Forge, Arena entry, Arena win, and revive/decompose.

Exit condition: a player can earn Dust daily without purchasing.

## 6. Non-MVP Items

Do not block Arena MVP on:

- full ladder rating,
- relic trading marketplace,
- Chronicle maze combat,
- drag-and-drop polish,
- advanced battle animation,
- rarity-scaled revival,
- flash-card economic exceptions,
- anti-collusion ranking models.

These should be designed after the first formal Arena loop is playable and measurable.

## 7. Acceptance Criteria

Arena MVP is complete when:

- The user can place 1 to 4 active cards on a 2 by 3 formation.
- The UI shows total BP, 5% matching rule, 30 Dust entry cost, and current wallet.
- The backend charges 30 Dust on queue entry.
- Queue cancellation and expiration refund 30 Dust.
- The backend matches only within 5% lower-denominator BP gap.
- The backend resolves a match automatically.
- Winner receives 60 Dust.
- Tie refunds 30 Dust to both players.
- Loser receives no Dust.
- Winner can receive a low-tier relic at a small configured chance.
- Every card with 0 HP becomes `pvp_dead`.
- `pvp_dead` cards cannot enter Arena.
- Revival costs 200 Dust and returns the card to Arena eligibility.
- Forge cost is 100 Dust.
- Daily sign-in and daily tasks can grant Dust once per day.
- All Dust and relic changes are recorded in `resource_transactions`.
- All card deaths and revivals are auditable.
