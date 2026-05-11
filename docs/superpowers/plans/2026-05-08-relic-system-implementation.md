# Relic System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first usable relic content loop: a server-side relic catalog, PvP low-tier relic drops that resolve to named relics, and frontend inventory/result rendering that uses the new metadata.

**Architecture:** Keep ownership simple and incremental. The backend already has `user_relics` and `resource_transactions`, so the first pass adds a pure catalog layer in code rather than a new table. The `/api/me/economy` snapshot becomes the single source of truth for both holdings and catalog metadata, and the frontend renders relic names, tiers, and icon prompts from that payload.

**Tech Stack:** Flask, PostgreSQL, React, TypeScript, pytest, Vite.

---

### Task 1: Add the relic catalog and expose it in economy snapshots

**Files:**
- Create: `backend/relic_catalog.py`
- Modify: `backend/main.py`
- Modify: `backend/tests/integration/test_backend_api.py`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Write the failing test**

Add a test that asserts `/api/me/economy` includes a non-empty `relic_catalog` list and that each entry has the expected public fields:

```python
def test_initial_economy_includes_relic_catalog(harness):
    headers = harness.login("integration-relic-catalog@example.com")
    economy = harness.economy(headers)

    assert isinstance(economy["relic_catalog"], list)
    assert any(row["relic_type"] == "low_ember_shard" for row in economy["relic_catalog"])
    assert any(row["relic_type"] == "named_echo_heart" for row in economy["relic_catalog"])
    ember = next(row for row in economy["relic_catalog"] if row["relic_type"] == "low_ember_shard")
    assert ember["display_name"] == "Ember Shard"
    assert ember["tier"] == "common"
    assert "soulslike item icon" in ember["icon_prompt"]
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k relic_catalog -v
```

Expected: fail because `relic_catalog` is not present yet.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/relic_catalog.py` with a static catalog list and lookup helpers:

```python
RELIC_CATALOG = [
    {
        "relic_type": "low_ember_shard",
        "display_name": "Ember Shard",
        "tier": "common",
        "family": "Fire",
        "lore_summary": "Cinder fragment from a burnt altar.",
        "effect_profile": "Fire-aligned Forge bias and aggressive archetype bias.",
        "forge_bias": "fire",
        "battle_bias": "offense",
        "icon_prompt": "soulslike item icon, ember shard, jagged red-orange crystal, charred metal prongs, floating ash, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
    # ... add the first shipped low-tier and named relics ...
]
```

In `backend/main.py`, import `get_relic_catalog()` and include it in `economy_snapshot(user)`:

```python
def economy_snapshot(user):
    wallet = get_user_wallet(user["id"])
    relics = get_user_relics(user["id"])
    transactions = get_recent_resource_transactions(user["id"], 20)
    return {
        "wallet": normalize_json_value(wallet) if wallet else None,
        "relics": normalize_rows(relics),
        "relic_catalog": get_relic_catalog(),
        "transactions": normalize_rows(transactions),
        "costs": {...},
        "starter": {...},
        "pvp": {...},
    }
```

Extend `frontend/src/types.ts` with the catalog shape so the client can render it:

```ts
export interface RelicDefinition {
  relic_type: string;
  display_name: string;
  tier: 'common' | 'rare' | 'epic' | 'legendary' | 'limited';
  family: string;
  lore_summary: string;
  effect_profile: string;
  forge_bias: string;
  battle_bias: string;
  icon_prompt: string;
  is_limited: boolean;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k relic_catalog -v
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/relic_catalog.py backend/main.py backend/tests/integration/test_backend_api.py frontend/src/types.ts
git commit -m "feat: add relic catalog snapshot"
```

### Task 2: Make Arena drops resolve to real low-tier relics

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/tests/integration/test_backend_api.py`
- Modify: `frontend/src/components/PvpArena.tsx`
- Modify: `frontend/src/types.ts`

- [ ] **Step 1: Write the failing test**

Change the PvP drop assertion so it verifies the reward is one of the shipped low-tier relics instead of the placeholder `arena_low_tier_relic`:

```python
def test_pvp_win_can_grant_low_tier_relic(harness, monkeypatch):
    ...
    assert join_b["reward"]["relic_drop"]["relic_type"] in {
        "low_ember_shard",
        "low_frost_shard",
        "low_radiant_shard",
        "low_void_shard",
        "low_storm_shard",
        "low_beast_fang",
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k pvp_win_can_grant_low_tier_relic -v
```

Expected: fail because the match reward still uses the generic relic key.

- [ ] **Step 3: Write the minimal implementation**

In `backend/relic_catalog.py`, add a helper that returns the low-tier drop pool:

```python
def get_low_tier_relic_types() -> list[str]:
    return [row["relic_type"] for row in RELIC_CATALOG if row["tier"] == "common" and not row["is_limited"]]
```

In `backend/main.py`, replace the hard-coded `arena_low_tier_relic` drop with a random pick from the low-tier pool and include the full definition in `reward_payload`:

```python
def _maybe_grant_pvp_relic_drop(winner_user_id, match_row):
    ...
    relic_type = secrets.choice(get_low_tier_relic_types())
    relic_result = adjust_relic_balance(...)
    relic_definition = get_relic_definition(relic_type)
    return {
        "relic_drop": {
            "relic_type": relic_type,
            "display_name": relic_definition["display_name"],
            "tier": relic_definition["tier"],
            "amount": 1,
        }
    }
```

Update `frontend/src/components/PvpArena.tsx` so the result card shows `display_name` when present, and falls back to `relic_type` only if the payload predates the catalog.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k relic -v
```

Expected: pass, and the reward payload now references a real catalog entry.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/integration/test_backend_api.py frontend/src/components/PvpArena.tsx backend/relic_catalog.py
git commit -m "feat: route arena relic drops through catalog"
```

### Task 3: Render relic holdings in the vault using catalog metadata

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/lib/api.ts` if a typed helper is needed

- [ ] **Step 1: Write the failing test**

Add a frontend-oriented test or snapshot if the repo already has one; otherwise make this a manual verification step after the TypeScript build:

```ts
expect(economy.relic_catalog.length).toBeGreaterThan(0);
expect(economy.relics[0].relic_type).toBeDefined();
```

- [ ] **Step 2: Run the check to verify it fails**

Run:

```bash
npm run build
```

Expected: TypeScript errors if the new catalog type is not wired through.

- [ ] **Step 3: Write the minimal implementation**

Update the vault sidebar and detail panel in `frontend/src/App.tsx` so relic holdings render with the catalog name, family, and tier:

```tsx
const relicCatalogByType = useMemo(
  () => Object.fromEntries((economy?.relic_catalog ?? []).map((row) => [row.relic_type, row])),
  [economy]
);

{economy?.relics.map((relic) => {
  const definition = relicCatalogByType[relic.relic_type];
  return (
    <div key={relic.relic_type} className="...">
      <div>{definition?.display_name ?? relic.relic_type}</div>
      <div>{definition?.family ?? 'Unknown'}</div>
      <div>{definition?.tier ?? 'common'}</div>
      <div>{relic.amount}</div>
    </div>
  );
})}
```

If the layout has room, add the icon prompt as a small muted caption so the content team can copy it straight into image generation workflows.

- [ ] **Step 4: Run the check to verify it passes**

Run:

```bash
npm run build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.tsx frontend/src/types.ts frontend/src/lib/api.ts
git commit -m "feat: render relic inventory metadata"
```

### Task 4: Final verification and cleanup

**Files:**
- Modify: none, unless verification exposes a small mismatch

- [ ] **Step 1: Run the backend integration suite**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -q
```

Expected: all tests pass, including the new relic catalog and Arena drop coverage.

- [ ] **Step 2: Run the frontend build**

Run:

```bash
npm run build
```

Expected: build succeeds with no type errors.

- [ ] **Step 3: Inspect the economy payload once**

Confirm the `/api/me/economy` payload now includes:

```json
{
  "relics": [],
  "relic_catalog": [
    {
      "relic_type": "low_ember_shard",
      "display_name": "Ember Shard"
    }
  ]
}
```

- [ ] **Step 4: Commit any final polish**

If verification exposed a small mismatch between backend fields and frontend rendering, fix it immediately and commit once more with a narrow message.

---

### Self-Review

**Spec coverage**
- Low-tier relics: covered by Tasks 1, 2, and 3.
- Named relics: covered by Task 1 via catalog metadata.
- Icon prompts: covered by Task 1 and surfaced in Task 3.
- PvP low-tier drops: covered by Task 2.
- Inventory rendering: covered by Task 3.

**Placeholder scan**
- No `TBD` or generic “implement later” steps remain.
- Every task names exact files and exact validation commands.

**Type consistency**
- `relic_type` is the stable key everywhere.
- `RelicDefinition` is the shared frontend type for catalog data.
- `economy.relic_catalog` is the snapshot field used by the client.
