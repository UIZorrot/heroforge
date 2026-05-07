# Arena MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first formal playable Arena PvP loop with 2 by 3 formation, 5% BP matchmaking, 30 Dust entry, winner-takes-all settlement, PvP death, 200 Dust revival, and daily Dust recovery.

**Architecture:** Start from the existing Flask + PostgreSQL + React implementation and evolve the current PvP queue instead of replacing the app shell. Backend owns all economic settlement, lifecycle state, matchmaking, and battle results; frontend only validates obvious input and renders backend state.

**Tech Stack:** Flask, psycopg/PostgreSQL or Supabase Postgres, pytest, React 19, TypeScript, Vite.

---

## Priority Order

| Priority | Area | Reason | Exit Condition |
| --- | --- | --- | --- |
| P0 | Constants, schema, API state contract | Highest coupling. Arena, Forge, Vault, death, revive, and economy all depend on these values and fields. | Backend exposes Forge 100, Arena 30, Revive 200, BP tolerance 5, and hero lifecycle states. |
| P1 | Arena backend core | This creates the first real playable competitive mode. | Two users can queue valid 2 by 3 formations and receive a resolved match. |
| P1 | Dust settlement | Economy bugs are high-risk and hard to repair after launch. | Entry, cancel, expire, win, tie, and failed-match refunds are transactionally recorded. |
| P1 | PvP death and revival | Card lifecycle changes affect Vault, Arena, and monetization. | 0 HP cards become `pvp_dead`; revival costs 200 Dust and restores Arena eligibility. |
| P2 | Arena frontend | The game is web-only, so the formal mode must be readable and playable from the browser. | User can place cards on a 2 by 3 board, queue, view result, and revive dead cards. |
| P2 | Battle visualization | Needed for trust and comprehension after automatic resolution. | Result screen shows board state, winner/tie, Dust delta, relic drop, and dead cards. |
| P3 | Daily activity | Prevents Dust dead-ends and supports retention. | User can claim daily sign-in and task Dust once per day. |
| P4 | Ladder shell | Important product direction, but lower coupling than Arena MVP. | A placeholder rank surface can show after Arena is stable. |
| P5 | Chronicle/relic marketplace | Valuable, but lower coupling and not required for first playable competitive loop. | Keep in spec until Arena instrumentation shows the economy shape. |

## File Map

- `backend/config.py`: MVP economy and matchmaking defaults.
- `backend/db.py`: schema bootstrap and safe migrations for lifecycle, formation, match rewards, death records, and daily activity.
- `backend/main.py`: economy snapshot, hero list, Arena join/cancel/poll, settlement, revive, daily endpoints.
- `backend/battle_logic.py`: formation-aware `arena_2x3` battle input and board history output.
- `backend/tests/integration/test_backend_api.py`: integration coverage for config, queue, settlement, death, revive, and daily rewards.
- `frontend/src/types.ts`: Arena formation, lifecycle, reward, daily, and API response types.
- `frontend/src/lib/api.ts`: Arena, revive, and daily API client functions.
- `frontend/src/components/PvpArena.tsx`: 2 by 3 formation board, queue controls, result panel, revive CTA.
- `frontend/src/components/BattleVisualizer.tsx`: board-state result rendering.
- `frontend/src/components/HeroCard.tsx`: card lifecycle badges and disabled Arena state.
- `frontend/src/App.tsx`: route/shell integration for Arena and daily activity entry points.

## Task 1: Freeze MVP Constants

**Files:**
- Modify: `backend/config.py`
- Test: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write failing config snapshot assertions**

Add or extend a backend integration test that fetches the economy snapshot and asserts:

```python
def test_economy_snapshot_uses_arena_mvp_values(client, auth_headers):
    response = client.get("/api/economy/snapshot", headers=auth_headers)
    assert response.status_code == 200
    data = response.get_json()

    assert data["costs"]["forge"] == 100
    assert data["costs"]["pvp_entry"] == 30
    assert data["costs"]["pvp_stake"] == 30
    assert data["costs"]["pvp_revive"] == 200
    assert data["pvp"]["match_tolerance_pct"] == 5
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
cd backend
pytest tests/integration/test_backend_api.py::test_economy_snapshot_uses_arena_mvp_values -q
```

Expected: fails until config and snapshot include `pvp_revive` and the new defaults.

- [ ] **Step 3: Update defaults**

Set defaults in `backend/config.py`:

```python
dust_cost_forge=_get_int_env("DUST_COST_FORGE", 100)
dust_cost_pvp_entry=_get_int_env("DUST_COST_PVP_ENTRY", 30)
pvp_stake_dust=_get_int_env("PVP_STAKE_DUST", _get_int_env("DUST_COST_PVP_ENTRY", 30))
pvp_match_tolerance_pct=_get_int_env("PVP_MATCH_TOLERANCE_PCT", 5)
```

Add a settings field:

```python
dust_cost_pvp_revive: int
```

Load it:

```python
dust_cost_pvp_revive=_get_int_env("DUST_COST_PVP_REVIVE", 200)
```

- [ ] **Step 4: Expose revive cost in economy snapshot**

In `backend/main.py`, extend the existing economy snapshot cost payload:

```python
"pvp_revive": settings.dust_cost_pvp_revive,
```

- [ ] **Step 5: Verify**

Run:

```powershell
cd backend
pytest tests/integration/test_backend_api.py::test_economy_snapshot_uses_arena_mvp_values -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/config.py backend/main.py backend/tests/integration/test_backend_api.py
git commit -m "feat: freeze arena mvp economy defaults"
```

## Task 2: Add Card Lifecycle and Arena Schema

**Files:**
- Modify: `backend/db.py`
- Test: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write schema assertions**

Add an integration test that verifies expected columns exist:

```python
def test_arena_lifecycle_schema_exists(db_conn):
    with db_conn.cursor() as cur:
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'heroes'
              AND column_name IN (
                'pvp_life_state',
                'pve_life_state',
                'card_status',
                'locked_reason',
                'pvp_dead_at',
                'decomposed_at',
                'active_pvp_entry_id'
              )
        """)
        hero_columns = {row["column_name"] for row in cur.fetchall()}

        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'pvp_queue_entries'
              AND column_name = 'formation_snapshot'
        """)
        queue_columns = {row["column_name"] for row in cur.fetchall()}

        cur.execute("""
            SELECT to_regclass('card_death_records') AS table_name
        """)
        death_table = cur.fetchone()["table_name"]

    assert hero_columns == {
        "pvp_life_state",
        "pve_life_state",
        "card_status",
        "locked_reason",
        "pvp_dead_at",
        "decomposed_at",
        "active_pvp_entry_id",
    }
    assert queue_columns == {"formation_snapshot"}
    assert death_table is not None
```

- [ ] **Step 2: Run the failing schema test**

Run:

```powershell
cd backend
pytest tests/integration/test_backend_api.py::test_arena_lifecycle_schema_exists -q
```

Expected: fails until schema bootstrap creates the fields and table.

- [ ] **Step 3: Extend schema bootstrap**

In `backend/db.py`, add lifecycle fields to the `heroes` table definition:

```sql
pvp_life_state text NOT NULL DEFAULT 'active',
pve_life_state text NOT NULL DEFAULT 'active',
card_status text NOT NULL DEFAULT 'active',
locked_reason text,
pvp_dead_at timestamptz,
decomposed_at timestamptz,
active_pvp_entry_id uuid,
CHECK (pvp_life_state IN ('active', 'pvp_dead')),
CHECK (pve_life_state IN ('active', 'pve_injured')),
CHECK (card_status IN ('active', 'locked', 'decomposed'))
```

Add `formation_snapshot` to `pvp_queue_entries`:

```sql
formation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
```

Add match persistence fields to `pvp_matches`:

```sql
formation_a jsonb NOT NULL DEFAULT '{}'::jsonb,
formation_b jsonb NOT NULL DEFAULT '{}'::jsonb,
reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
card_state_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
```

Create `card_death_records` exactly as designed in `spec-doc/04-arena-mvp-implementation-plan.md`.

- [ ] **Step 4: Add safe ALTER migration block**

Because existing databases already have tables, add idempotent `ALTER TABLE IF EXISTS` statements in the schema initialization path:

```sql
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS pvp_life_state text NOT NULL DEFAULT 'active';
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS pve_life_state text NOT NULL DEFAULT 'active';
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS card_status text NOT NULL DEFAULT 'active';
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS locked_reason text;
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS pvp_dead_at timestamptz;
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS decomposed_at timestamptz;
ALTER TABLE heroes ADD COLUMN IF NOT EXISTS active_pvp_entry_id uuid;
ALTER TABLE pvp_queue_entries ADD COLUMN IF NOT EXISTS formation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pvp_matches ADD COLUMN IF NOT EXISTS formation_a jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pvp_matches ADD COLUMN IF NOT EXISTS formation_b jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pvp_matches ADD COLUMN IF NOT EXISTS reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE pvp_matches ADD COLUMN IF NOT EXISTS card_state_changes jsonb NOT NULL DEFAULT '[]'::jsonb;
```

- [ ] **Step 5: Verify**

Run:

```powershell
cd backend
pytest tests/integration/test_backend_api.py::test_arena_lifecycle_schema_exists -q
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/db.py backend/tests/integration/test_backend_api.py
git commit -m "feat: add arena lifecycle schema"
```

## Task 3: Return Card Lifecycle to Frontend

**Files:**
- Modify: `backend/main.py`
- Modify: `frontend/src/types.ts`
- Test: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write response-shape test**

```python
def test_list_heroes_includes_lifecycle_fields(client, auth_headers, saved_hero):
    response = client.get("/api/me/heroes", headers=auth_headers)
    assert response.status_code == 200
    hero = response.get_json()["data"][0]

    assert hero["pvp_life_state"] == "active"
    assert hero["pve_life_state"] == "active"
    assert hero["card_status"] == "active"
    assert "locked_reason" in hero
    assert "active_pvp_entry_id" in hero
```

- [ ] **Step 2: Run failing test**

```powershell
cd backend
pytest tests/integration/test_backend_api.py::test_list_heroes_includes_lifecycle_fields -q
```

Expected: fails until `/api/me/heroes` selects and returns lifecycle fields.

- [ ] **Step 3: Update hero list SQL**

In `backend/main.py`, update the hero list query to select:

```sql
pvp_life_state,
pve_life_state,
card_status,
locked_reason,
pvp_dead_at,
decomposed_at,
active_pvp_entry_id
```

- [ ] **Step 4: Update frontend types**

In `frontend/src/types.ts`, add:

```ts
export type CardPvpLifeState = 'active' | 'pvp_dead';
export type CardPveLifeState = 'active' | 'pve_injured';
export type CardStatus = 'active' | 'locked' | 'decomposed';
```

Extend saved hero records:

```ts
pvp_life_state: CardPvpLifeState;
pve_life_state: CardPveLifeState;
card_status: CardStatus;
locked_reason?: string | null;
pvp_dead_at?: string | null;
decomposed_at?: string | null;
active_pvp_entry_id?: string | null;
```

- [ ] **Step 5: Verify backend and frontend**

```powershell
cd backend
pytest tests/integration/test_backend_api.py::test_list_heroes_includes_lifecycle_fields -q
cd ..\frontend
npm run build
```

Expected: pytest PASS and Vite build PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/main.py frontend/src/types.ts backend/tests/integration/test_backend_api.py
git commit -m "feat: expose card lifecycle state"
```

## Task 4: Implement 2 By 3 Arena Queue Payload

**Files:**
- Modify: `backend/main.py`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types.ts`
- Test: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Add backend validation tests**

Add tests for invalid formations:

```python
def test_arena_join_rejects_empty_formation(client, auth_headers):
    response = client.post(
        "/api/pvp/join",
        headers=auth_headers,
        json={"mode": "arena_2x3", "queueKey": "ranked", "formation": {}},
    )
    assert response.status_code == 400
    assert "Place 1 to 4 active cards" in response.get_json()["error"]


def test_arena_join_rejects_more_than_four_cards(client, auth_headers, five_saved_heroes):
    formation = {
        "front_0": five_saved_heroes[0]["id"],
        "front_1": five_saved_heroes[1]["id"],
        "front_2": five_saved_heroes[2]["id"],
        "back_0": five_saved_heroes[3]["id"],
        "back_1": five_saved_heroes[4]["id"],
        "back_2": None,
    }
    response = client.post(
        "/api/pvp/join",
        headers=auth_headers,
        json={"mode": "arena_2x3", "queueKey": "ranked", "formation": formation},
    )
    assert response.status_code == 400
    assert "Place 1 to 4 active cards" in response.get_json()["error"]
```

- [ ] **Step 2: Run failing tests**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "arena_join_rejects"
```

Expected: fails until formation validation exists.

- [ ] **Step 3: Add slot constants and normalizer**

In `backend/main.py`, add:

```python
ARENA_SLOT_KEYS = ("front_0", "front_1", "front_2", "back_0", "back_1", "back_2")


def _normalize_arena_formation(value):
    if not isinstance(value, dict):
        raise ValueError("Arena formation is required")

    formation = {slot: value.get(slot) or None for slot in ARENA_SLOT_KEYS}
    hero_ids = [str(hero_id) for hero_id in formation.values() if hero_id]

    if not (1 <= len(hero_ids) <= 4):
        raise ValueError("Place 1 to 4 active cards")
    if len(set(hero_ids)) != len(hero_ids):
        raise ValueError("A card can only occupy one Arena slot")

    return formation, hero_ids
```

- [ ] **Step 4: Update API client payload**

In `frontend/src/types.ts`, add:

```ts
export type ArenaSlotKey = 'front_0' | 'front_1' | 'front_2' | 'back_0' | 'back_1' | 'back_2';
export type ArenaFormation = Record<ArenaSlotKey, string | null>;
```

In `frontend/src/lib/api.ts`, change `joinPvpQueue` to send formation:

```ts
export async function joinPvpQueue(
  formation: ArenaFormation,
  queueKey = 'ranked',
  token?: string | null
): Promise<PvpJoinResponse> {
  return await requestJson<PvpJoinResponse>(
    '/api/pvp/join',
    {
      method: 'POST',
      body: JSON.stringify({ mode: 'arena_2x3', queueKey, formation }),
    },
    token
  );
}
```

- [ ] **Step 5: Verify**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "arena_join_rejects"
cd ..\frontend
npm run build
```

Expected: backend validation tests PASS; frontend build PASS after PvpArena call sites are updated in Task 8.

- [ ] **Step 6: Commit**

```powershell
git add backend/main.py frontend/src/types.ts frontend/src/lib/api.ts backend/tests/integration/test_backend_api.py
git commit -m "feat: accept arena formation queue payload"
```

## Task 5: Apply 5% BP Matchmaking

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write BP boundary tests**

```python
def test_arena_match_accepts_five_percent_bp_gap(client, auth_headers_a, auth_headers_b, heroes_1000_and_1050):
    entry_a = client.post("/api/pvp/join", headers=auth_headers_a, json=heroes_1000_and_1050["formation_a"])
    assert entry_a.status_code == 200

    entry_b = client.post("/api/pvp/join", headers=auth_headers_b, json=heroes_1000_and_1050["formation_b"])
    assert entry_b.status_code == 200
    assert entry_b.get_json()["status"] == "matched"


def test_arena_match_rejects_over_five_percent_bp_gap(client, auth_headers_a, auth_headers_b, heroes_1000_and_1051):
    client.post("/api/pvp/join", headers=auth_headers_a, json=heroes_1000_and_1051["formation_a"])
    entry_b = client.post("/api/pvp/join", headers=auth_headers_b, json=heroes_1000_and_1051["formation_b"])

    assert entry_b.status_code == 200
    assert entry_b.get_json()["status"] == "waiting"
```

- [ ] **Step 2: Run failing boundary tests**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "five_percent_bp_gap"
```

Expected: the 1051 case fails if code still uses `GREATEST` denominator or 10%.

- [ ] **Step 3: Change matching SQL**

Use lower denominator:

```sql
AND ABS(bp_value - %s) <= LEAST(bp_value, %s) * (%s / 100.0)
```

Persist `bp_gap_pct` with:

```python
round(abs(bp_a - bp_b) / max(min(bp_a, bp_b), 1) * 100, 2)
```

- [ ] **Step 4: Verify**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "five_percent_bp_gap"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add backend/main.py backend/tests/integration/test_backend_api.py
git commit -m "feat: enforce arena five percent bp matchmaking"
```

## Task 6: Implement Dust Settlement

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write settlement tests**

```python
def test_arena_winner_gets_pool_and_loser_gets_no_dust(client, matched_arena_result):
    result = matched_arena_result(winner="Player A")

    assert result["wallet_a_delta"] == 30
    assert result["wallet_b_delta"] == -30
    assert result["match"]["reward_payload"]["dust_pool"] == 60
    assert result["match"]["reward_payload"]["tie_refund"] is False


def test_arena_tie_refunds_both_entries(client, matched_arena_result):
    result = matched_arena_result(winner="Tie")

    assert result["wallet_a_delta"] == 0
    assert result["wallet_b_delta"] == 0
    assert result["match"]["winner_side"] == "Tie"
    assert result["match"]["reward_payload"]["tie_refund"] is True
```

- [ ] **Step 2: Run failing settlement tests**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "arena_winner_gets_pool or arena_tie_refunds"
```

Expected: fails until reward payload is persisted and tie refund is normalized.

- [ ] **Step 3: Persist reward payload**

In `_resolve_pvp_match`, build:

```python
reward_payload = {
    "entry_cost": int(match_row["stake_dust"]),
    "dust_pool": int(match_row["stake_dust"]) * 2,
    "winner_side": winner_side,
    "winner_user_id": winner_user_id,
    "tie_refund": winner_side == "Tie",
    "relic_drop": relic_drop,
}
```

Store it in `pvp_matches.reward_payload`.

- [ ] **Step 4: Ensure refund/payout reasons are stable**

Use these transaction reasons:

```text
pvp_stake
pvp_cancel_refund
pvp_entry_expire_refund
pvp_tie_refund
pvp_payout
pvp_match_refund
```

- [ ] **Step 5: Verify**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "arena_winner_gets_pool or arena_tie_refunds"
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add backend/main.py backend/tests/integration/test_backend_api.py
git commit -m "feat: settle arena dust rewards"
```

## Task 7: Implement PvP Death and Revival

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/db.py`
- Modify: `frontend/src/lib/api.ts`
- Test: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write death and revive tests**

```python
def test_zero_hp_arena_cards_become_pvp_dead(client, matched_arena_result, dead_hero_id):
    result = matched_arena_result(dead_hero_ids=[dead_hero_id])

    hero = result["get_hero"](dead_hero_id)
    assert hero["pvp_life_state"] == "pvp_dead"
    assert hero["pvp_dead_at"] is not None


def test_pvp_dead_card_cannot_queue_until_revived(client, auth_headers, pvp_dead_hero):
    response = client.post(
        "/api/pvp/join",
        headers=auth_headers,
        json={
            "mode": "arena_2x3",
            "queueKey": "ranked",
            "formation": {"front_1": pvp_dead_hero["id"]},
        },
    )
    assert response.status_code == 400
    assert "Revive it before Arena" in response.get_json()["error"]


def test_revive_card_costs_200_dust(client, auth_headers, pvp_dead_hero):
    response = client.post(f"/api/cards/{pvp_dead_hero['id']}/revive", headers=auth_headers)
    assert response.status_code == 200
    data = response.get_json()

    assert data["card"]["pvp_life_state"] == "active"
    assert data["economy"]["costs"]["pvp_revive"] == 200
```

- [ ] **Step 2: Run failing tests**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "pvp_dead or revive_card"
```

Expected: fails until card death detection and revive endpoint exist.

- [ ] **Step 3: Add death application helper**

In `backend/main.py`, add a helper that receives final battle units and updates every `hp <= 0` hero:

```python
def _apply_arena_card_deaths(match_id, side, user_id, defeated_units):
    changes = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            for unit in defeated_units:
                cur.execute(
                    """
                    UPDATE heroes
                    SET pvp_life_state = 'pvp_dead',
                        pvp_dead_at = now(),
                        active_pvp_entry_id = NULL
                    WHERE id = %s AND user_id = %s
                    RETURNING id, pvp_life_state, pvp_dead_at
                    """,
                    (unit["hero_id"], user_id),
                )
                row = cur.fetchone()
                if row:
                    cur.execute(
                        """
                        INSERT INTO card_death_records (
                            hero_id, user_id, mode, source_type, source_id, side,
                            slot_key, hp_after, death_state
                        )
                        VALUES (%s, %s, 'pvp', 'pvp_match', %s, %s, %s, %s, 'pvp_dead')
                        """,
                        (unit["hero_id"], user_id, match_id, side, unit["slot_key"], unit["hp"]),
                    )
                    changes.append(normalize_json_value(row))
        conn.commit()
    return changes
```

- [ ] **Step 4: Add revive endpoint**

Add:

```python
@app.route("/api/cards/<card_id>/revive", methods=["POST"])
@require_auth
def revive_card(card_id):
    user = current_user()
    hero = fetch_one(
        """
        SELECT id, user_id, pvp_life_state
        FROM heroes
        WHERE id = %s AND user_id = %s
        """,
        (card_id, user["id"]),
    )
    if not hero:
        return jsonify({"error": "Card not found"}), 404
    if hero["pvp_life_state"] != "pvp_dead":
        return jsonify({"error": "Only pvp_dead cards can be revived"}), 400

    adjust_dust_balance(
        user["id"],
        -settings.dust_cost_pvp_revive,
        "pvp_revive",
        ref_type="hero",
        ref_id=card_id,
        metadata={"cost": settings.dust_cost_pvp_revive},
    )
    # Then update hero state and latest death record in one connection.
```

- [ ] **Step 5: Add frontend API function**

In `frontend/src/lib/api.ts`:

```ts
export async function reviveCard(cardId: string, token?: string | null): Promise<{ ok: true; card: unknown; economy: EconomySnapshot }> {
  return await requestJson<{ ok: true; card: unknown; economy: EconomySnapshot }>(
    `/api/cards/${cardId}/revive`,
    { method: 'POST' },
    token
  );
}
```

- [ ] **Step 6: Verify**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "pvp_dead or revive_card"
cd ..\frontend
npm run build
```

Expected: pytest PASS and frontend build PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/main.py backend/db.py frontend/src/lib/api.ts backend/tests/integration/test_backend_api.py
git commit -m "feat: add arena death and revival"
```

## Task 8: Build Arena Formation Frontend

**Files:**
- Modify: `frontend/src/components/PvpArena.tsx`
- Modify: `frontend/src/components/HeroCard.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add board state**

In `PvpArena.tsx`, replace selected ID array as source of truth with:

```ts
const EMPTY_FORMATION: ArenaFormation = {
  front_0: null,
  front_1: null,
  front_2: null,
  back_0: null,
  back_1: null,
  back_2: null,
};

const [formation, setFormation] = useState<ArenaFormation>(EMPTY_FORMATION);
const [pendingHeroId, setPendingHeroId] = useState<string | null>(null);
```

- [ ] **Step 2: Add eligibility helpers**

```ts
function isArenaEligible(hero: SavedHero) {
  return hero.pvp_life_state === 'active' && hero.card_status === 'active' && !hero.active_pvp_entry_id;
}

function formationHeroIds(formation: ArenaFormation) {
  return Object.values(formation).filter((id): id is string => Boolean(id));
}
```

- [ ] **Step 3: Render 2 by 3 board**

Use rows:

```ts
const ARENA_ROWS: Array<{ label: string; slots: ArenaSlotKey[] }> = [
  { label: 'Front', slots: ['front_0', 'front_1', 'front_2'] },
  { label: 'Back', slots: ['back_0', 'back_1', 'back_2'] },
];
```

Each slot button:

```tsx
<button
  type="button"
  disabled={waiting}
  onClick={() => assignPendingHeroToSlot(slot)}
  className="arena-slot"
>
  {hero ? hero.character.name : 'Empty'}
</button>
```

- [ ] **Step 4: Update queue call**

Replace:

```ts
joinPvpQueue(selectedHeroIds, '4v4', queueKey, currentToken)
```

with:

```ts
joinPvpQueue(formation, queueKey, currentToken)
```

- [ ] **Step 5: Add UX copy and disabled states**

Show these exact states:

```text
Need 30 Dust to enter Arena.
Place 1 to 4 active cards.
This card is dead. Revive it before Arena.
Arena only matches opponents within 5% total BP.
```

- [ ] **Step 6: Verify**

```powershell
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add frontend/src/components/PvpArena.tsx frontend/src/components/HeroCard.tsx frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat: build arena formation ui"
```

## Task 9: Render Arena Result and Revive CTA

**Files:**
- Modify: `frontend/src/components/PvpArena.tsx`
- Modify: `frontend/src/components/BattleVisualizer.tsx`
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Display settlement payload**

In `PvpArena.tsx`, show:

```tsx
<StatPill label="Entry" value="30 Dust" tone="amber" />
<StatPill label="Payout" value={matchRecord.winner_side === 'Tie' ? 'Refunded' : '60 Dust'} tone="emerald" />
<StatPill label="Result" value={matchRecord.winner_side ?? 'Pending'} tone="slate" />
```

- [ ] **Step 2: Display dead cards**

Render `card_state_changes` where `pvp_life_state === 'pvp_dead'`:

```tsx
{deadCards.map((card) => (
  <button key={card.id} type="button" onClick={() => handleRevive(card.id)}>
    Revive for 200 Dust
  </button>
))}
```

- [ ] **Step 3: Call revive API**

```ts
async function handleRevive(cardId: string) {
  const currentToken = token ?? getStoredToken();
  await reviveCard(cardId, currentToken);
  await onRefresh();
}
```

- [ ] **Step 4: Update battle visualizer board labels**

`BattleVisualizer.tsx` should render `front_0`, `front_1`, `front_2`, `back_0`, `back_1`, and `back_2` as two rows per side. Empty slots must render as empty cells instead of disappearing.

- [ ] **Step 5: Verify**

```powershell
cd frontend
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add frontend/src/components/PvpArena.tsx frontend/src/components/BattleVisualizer.tsx frontend/src/lib/api.ts
git commit -m "feat: show arena results and revival actions"
```

## Task 10: Add Daily Dust Activity

**Files:**
- Modify: `backend/db.py`
- Modify: `backend/main.py`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/App.tsx`
- Create: `frontend/src/components/DailyActivity.tsx`
- Test: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write daily backend tests**

```python
def test_daily_sign_in_can_only_claim_once(client, auth_headers):
    first = client.post("/api/daily/sign-in/claim", headers=auth_headers)
    second = client.post("/api/daily/sign-in/claim", headers=auth_headers)

    assert first.status_code == 200
    assert second.status_code == 400
    assert "already claimed" in second.get_json()["error"]


def test_daily_task_claim_requires_completion(client, auth_headers):
    response = client.post("/api/daily/tasks/win_arena_once/claim", headers=auth_headers)

    assert response.status_code == 400
    assert "not complete" in response.get_json()["error"]
```

- [ ] **Step 2: Run failing tests**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "daily"
```

Expected: fails until daily tables and endpoints exist.

- [ ] **Step 3: Add daily tables**

Add `daily_checkins` and `daily_task_progress` from `spec-doc/04-arena-mvp-implementation-plan.md` to `backend/db.py`.

- [ ] **Step 4: Add daily endpoints**

In `backend/main.py`, add:

```text
GET /api/daily/me
POST /api/daily/sign-in/claim
POST /api/daily/tasks/<task_key>/claim
```

Use `adjust_dust_balance` for all Dust grants with reasons:

```text
daily_sign_in
daily_task_reward
```

- [ ] **Step 5: Add frontend daily component**

Create `frontend/src/components/DailyActivity.tsx` with:

```tsx
export function DailyActivity() {
  return (
    <section className="rounded-3xl border border-amber-300/20 bg-stone-950/70 p-5">
      <div className="text-xs uppercase tracking-[0.28em] text-amber-200">Daily</div>
      <h2 className="mt-2 text-2xl text-stone-50">Dust Recovery</h2>
      <p className="mt-2 text-sm text-stone-300">
        Claim daily Dust and finish lightweight tasks so Arena entry and revival do not dead-end the account.
      </p>
    </section>
  );
}
```

Then wire API data and claim buttons after backend endpoints pass.

- [ ] **Step 6: Verify**

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q -k "daily"
cd ..\frontend
npm run build
```

Expected: pytest PASS and frontend build PASS.

- [ ] **Step 7: Commit**

```powershell
git add backend/db.py backend/main.py frontend/src/lib/api.ts frontend/src/types.ts frontend/src/App.tsx frontend/src/components/DailyActivity.tsx backend/tests/integration/test_backend_api.py
git commit -m "feat: add daily dust activity"
```

## Final Verification

- [ ] Run backend integration tests:

```powershell
cd backend
pytest tests/integration/test_backend_api.py -q
```

- [ ] Run frontend build:

```powershell
cd frontend
npm run build
```

- [ ] Manual browser smoke test:

```text
1. Log in.
2. Confirm economy shows Forge 100, Arena 30, Revive 200.
3. Forge or load at least 4 cards.
4. Place 1 to 4 active cards on the 2 by 3 Arena board.
5. Enter queue and confirm 30 Dust is charged.
6. Cancel queue and confirm 30 Dust is refunded.
7. Match two accounts within 5% BP.
8. Confirm winner receives 60 Dust or tie refunds both players.
9. Confirm 0 HP cards show as pvp_dead in Vault.
10. Revive a dead card for 200 Dust.
11. Claim daily sign-in Dust.
```

## Implementation Notes

- Do not implement Chronicle before Arena MVP is playable.
- Do not implement relic marketplace before transaction and reward payloads are stable.
- Keep Dust settlement server-authoritative.
- Keep card lifecycle server-authoritative.
- Prefer small commits by task so economy bugs can be reviewed in isolation.
