# Battle Session REST Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose a session-based REST control surface for battle so an external program can observe state, submit one action at a time, and let the server-authoritative battle engine resolve combat without GUI intervention.

**Architecture:** Keep the current battle resolver as the single source of truth for damage, targeting, buffs, and results. Add a small in-memory battle session layer that stores active session state by UUID, exposes a public observation snapshot, and accepts one validated action per turn. The existing `/api/battle` and `/api/battle/team` routes keep their current automatic behavior for convenience, while the new session routes let a CLI or external agent drive combat step-by-step.

**Tech Stack:** Flask, Python, pytest, in-memory process state, React TypeScript only for response types if needed.

---

### Task 1: Add battle session state and public session snapshots

**Files:**
- Create: `backend/battle_sessions.py`
- Modify: `backend/battle_logic.py`
- Modify: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write the failing test**

Add a unit-level integration test that creates a battle session object from two board heroes and asserts the session exposes only public fields:

```python
def test_create_battle_session_returns_public_snapshot_only():
    hero_a = _board_hero("Alpha", range_mode="ranged", target_num=1)
    hero_b = _board_hero("Bravo", range_mode="melee", target_num=1)

    session = battle_sessions.create_battle_session(
        battle_mode="1v1",
        control_mode="rest",
        label_a="Alpha",
        label_b="Bravo",
        team_a=[hero_a],
        team_b=[hero_b],
    )

    snapshot = session.public_snapshot()

    assert session.session_id
    assert snapshot["sessionId"] == session.session_id
    assert snapshot["status"] == "awaiting_action"
    assert snapshot["controlMode"] == "rest"
    assert snapshot["battleMode"] == "1v1"
    assert snapshot["observation"]["actor"]["tag"].startswith("A")
    assert "internal_turn_queue" not in snapshot
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k create_battle_session_returns_public_snapshot_only -v
```

Expected: fail because `backend/battle_sessions.py` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `backend/battle_sessions.py` with an in-memory session store and a thin session object:

```python
@dataclass
class BattleSession:
    session_id: str
    battle_mode: str
    control_mode: str
    label_a: str
    label_b: str
    team_a: list[dict[str, Any]]
    team_b: list[dict[str, Any]]
    state: dict[str, Any]

    def public_snapshot(self) -> dict[str, Any]:
        return {
            "sessionId": self.session_id,
            "battleMode": self.battle_mode,
            "controlMode": self.control_mode,
            "labelA": self.label_a,
            "labelB": self.label_b,
            "status": self.state["status"],
            "round": self.state["round"],
            "activeActor": self.state.get("activeActor"),
            "observation": self.state["observation"],
            "result": self.state.get("result"),
        }
```

Use a module-level `dict[str, BattleSession]` plus an `RLock` so the session layer can safely serve concurrent requests in a single process. Reuse `battle_logic.build_public_battle_observation()` so the same public schema powers both the REST session view and the automatic battle loop.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k create_battle_session_returns_public_snapshot_only -v
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/battle_sessions.py backend/battle_logic.py backend/tests/integration/test_backend_api.py
git commit -m "feat: add battle session state container"
```

### Task 2: Add REST routes for creating, observing, and stepping battle sessions

**Files:**
- Modify: `backend/main.py`
- Modify: `backend/battle_sessions.py`
- Modify: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write the failing test**

Add one session lifecycle test that creates a session, fetches it, submits one action, and asserts the state advances:

```python
def test_battle_session_lifecycle_advances_one_turn(harness):
    headers = harness.login("integration-session-control@example.com")
    hero_a = _board_hero("Alpha", range_mode="ranged", target_num=1)
    hero_b = _board_hero("Bravo", range_mode="melee", target_num=1)

    create_response = harness.client.post(
        "/api/battle/sessions",
        headers=headers,
        json={
            "battleMode": "1v1",
            "controlMode": "rest",
            "labelA": "Alpha",
            "labelB": "Bravo",
            "teamA": [hero_a],
            "teamB": [hero_b],
        },
    )
    assert create_response.status_code == 201
    session_id = create_response.get_json()["data"]["sessionId"]

    get_response = harness.client.get(f"/api/battle/sessions/{session_id}", headers=headers)
    assert get_response.status_code == 200
    assert get_response.get_json()["data"]["status"] == "awaiting_action"

    step_response = harness.client.post(
        f"/api/battle/sessions/{session_id}/actions",
        headers=headers,
        json={"action": {"kind": "attack", "targetTag": "B1"}},
    )
    assert step_response.status_code == 200
    payload = step_response.get_json()["data"]
    assert payload["round"] >= 1
    assert payload["observation"]["actor"]["tag"].startswith("B")
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k battle_session_lifecycle_advances_one_turn -v
```

Expected: fail because the routes do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add these routes to `backend/main.py`:

```python
@app.route("/api/battle/sessions", methods=["POST"])
@auth_required
def create_battle_session_route():
    data = request.json or {}
    session = create_battle_session(
        battle_mode=str(data.get("battleMode") or "1v1"),
        control_mode=str(data.get("controlMode") or "rest"),
        label_a=str(data.get("labelA") or "Team A"),
        label_b=str(data.get("labelB") or "Team B"),
        team_a=data.get("teamA") or [],
        team_b=data.get("teamB") or [],
    )
    return jsonify({"data": session.public_snapshot()}), 201

@app.route("/api/battle/sessions/<session_id>", methods=["GET"])
@auth_required
def get_battle_session_route(session_id):
    session = get_battle_session(session_id)
    if not session:
        return jsonify({"error": "Battle session not found"}), 404
    return jsonify({"data": session.public_snapshot()})

@app.route("/api/battle/sessions/<session_id>/actions", methods=["POST"])
@auth_required
def advance_battle_session_route(session_id):
    data = request.json or {}
    session = get_battle_session(session_id)
    if not session:
        return jsonify({"error": "Battle session not found"}), 404
    result = submit_battle_session_action(session_id, data.get("action") or {})
    return jsonify({"data": result})
```

The session action handler should:

- reject actions from the wrong turn with HTTP 409
- reject malformed actions with HTTP 400
- apply the action through the battle resolver
- advance to the next actor or next round
- mark the session `resolved` when the battle ends

Keep the automatic `/api/battle` and `/api/battle/team` routes intact so existing UI and smoke tests still work.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k battle_session_lifecycle_advances_one_turn -v
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/battle_sessions.py backend/tests/integration/test_backend_api.py
git commit -m "feat: add battle session REST routes"
```

### Task 3: Document the REST control flow in a SKILL.md manual

**Files:**
- Create: `docs/superpowers/skills/2026-05-11-battle-session-control/SKILL.md`

- [ ] **Step 1: Write the failing check**

Create a short verification script or grep check that fails until the skill document exists:

```bash
test -f docs/superpowers/skills/2026-05-11-battle-session-control/SKILL.md
```

- [ ] **Step 2: Run the check to verify it fails**

Run:

```bash
test -f docs/superpowers/skills/2026-05-11-battle-session-control/SKILL.md
```

Expected: non-zero exit because the file does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Create `docs/superpowers/skills/2026-05-11-battle-session-control/SKILL.md` with:

```markdown
# Battle Session REST Control

Use this when a program needs to drive battle through REST without GUI intervention.

## Workflow
1. `POST /api/battle/sessions` to create a session.
2. `GET /api/battle/sessions/:id` to read the public observation.
3. `POST /api/battle/sessions/:id/actions` to submit one action for the active actor.
4. Repeat until `status == "resolved"`.

## Action shape
```json
{
  "action": {
    "kind": "attack",
    "targetTag": "B1",
    "skillSlot": "s1"
  }
}
```

## Rules
- The GUI cannot inject manual battle input.
- The server is authoritative for damage, buffs, targeting, and end-of-battle resolution.
- The session should only expose public battle state.
```

- [ ] **Step 4: Run the check to verify it passes**

Run:

```bash
test -f docs/superpowers/skills/2026-05-11-battle-session-control/SKILL.md
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/skills/2026-05-11-battle-session-control/SKILL.md
git commit -m "docs: add battle session control manual"
```

