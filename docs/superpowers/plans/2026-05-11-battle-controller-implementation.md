# Battle Controller Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split battle simulation from battle decision-making so the engine can run with a stochastic program controller today and a pluggable AI controller later, while keeping the GUI out of the combat loop.

**Architecture:** Keep battle resolution server-authoritative and pure. Introduce a small controller layer that receives a public battle observation and returns the next action, while the existing battle loop continues to own damage, buffs, targeting, and result logging. Default all current routes to the program controller so existing flows keep working, and expose the controller contract in a way that future AI integrations can consume without changing the simulation core.

**Tech Stack:** Flask, Python, pytest, React, TypeScript.

---

### Task 1: Extract a battle controller contract and public observation payload

**Files:**
- Modify: `backend/battle_logic.py`
- Modify: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write the failing test**

Add a test that imports the new public battle observation helper and asserts the returned structure only includes visible state, not private resolver internals:

```python
def test_public_battle_observation_exposes_only_visible_state():
    hero_a = _board_hero("Alpha")
    hero_b = _board_hero("Bravo")
    attacker = battle_logic.Battler(hero_a, "A", 0)
    defender = battle_logic.Battler(hero_b, "B", 0)

    observation = battle_logic.build_public_battle_observation(
        round_num=3,
        actor=attacker,
        allies=[attacker],
        enemies=[defender],
        label_a="Player A",
        label_b="Player B",
    )

    assert observation["round"] == 3
    assert observation["actor"]["tag"] == "A"
    assert observation["actor"]["hp"] == attacker.hp
    assert observation["actor"]["mp"] == attacker.mp
    assert observation["enemies"][0]["tag"] == "B"
    assert "secret" not in observation
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k public_battle_observation -v
```

Expected: fail because the helper does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Add a small protocol plus observation builder to `backend/battle_logic.py`:

```python
@dataclass
class BattleAction:
    kind: Literal["attack", "skill", "pass"]
    target_tag: str | None = None
    skill_slot: Literal["s1", "s2"] | None = None


class BattleController(Protocol):
    def choose_action(self, observation: Dict[str, Any]) -> BattleAction: ...


def build_public_battle_observation(round_num, actor, allies, enemies, label_a, label_b):
    return {
        "round": round_num,
        "labels": {"a": label_a, "b": label_b},
        "actor": _public_unit_snapshot(actor),
        "allies": [_public_unit_snapshot(unit) for unit in allies if unit and unit.hp > 0],
        "enemies": [_public_unit_snapshot(unit) for unit in enemies if unit and unit.hp > 0],
    }
```

Keep the snapshot public by excluding internal resolver state.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k public_battle_observation -v
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/battle_logic.py backend/tests/integration/test_backend_api.py
git commit -m "feat: add public battle observation contract"
```

### Task 2: Make the program controller stochastic and principle-driven

**Files:**
- Modify: `backend/battle_logic.py`
- Modify: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write the failing test**

Add a deterministic test that patches randomness and asserts the controller sometimes prefers skills and sometimes falls back to attacks based on MP and skill cost:

```python
def test_program_controller_can_choose_skill_or_attack(monkeypatch):
    hero = _board_hero("Mage", target_num=1)
    battler = battle_logic.Battler(hero, "A", 0)
    controller = battle_logic.ProgramBattleController()
    observation = battle_logic.build_public_battle_observation(
        round_num=1,
        actor=battler,
        allies=[battler],
        enemies=[battle_logic.Battler(_board_hero("Target"), "B", 0)],
        label_a="Player A",
        label_b="Player B",
    )

    monkeypatch.setattr(battle_logic.random, "random", lambda: 0.0)
    action = controller.choose_action(observation)

    assert action.kind in {"attack", "skill"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k program_controller -v
```

Expected: fail because the controller is not implemented yet.

- [ ] **Step 3: Write the minimal implementation**

Implement a `ProgramBattleController` in `backend/battle_logic.py` that:

```python
class ProgramBattleController:
    def choose_action(self, observation):
        actor = observation["actor"]
        skills = actor.get("skills", {})
        roll = random.random()
        if actor["mp"] <= 0 or roll < 0.35:
            return BattleAction(kind="attack")
        if skills.get("s2") and actor["mp"] >= skills["s2"].get("MP_COST", 0) and roll > 0.8:
            return BattleAction(kind="skill", skill_slot="s2")
        if skills.get("s1"):
            return BattleAction(kind="skill", skill_slot="s1")
        return BattleAction(kind="attack")
```

Keep the heuristics small and readable. Use randomness to avoid fully deterministic repetition, but preserve obvious principles:

- do not spend MP the actor does not have
- prefer a stronger skill when a higher-cost option is available
- fall back to a basic attack when no viable skill exists

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k program_controller -v
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/battle_logic.py backend/tests/integration/test_backend_api.py
git commit -m "feat: add stochastic program battle controller"
```

### Task 3: Thread the controller through battle simulation and expose an AI-ready hook

**Files:**
- Modify: `backend/battle_logic.py`
- Modify: `backend/main.py`
- Modify: `backend/tests/integration/test_backend_api.py`

- [ ] **Step 1: Write the failing test**

Add an integration test that posts a battle request with `controlMode: "program"` and asserts the returned payload includes the chosen control mode and still renders a valid battle result. If a second mode is supported in the API shape, assert the request is accepted even if the AI adapter uses the same simulation core for now:

```python
def test_battle_accepts_control_mode_and_returns_result(harness):
    headers = harness.login("integration-control-mode@example.com")
    hero_a = _board_hero("Alpha")
    hero_b = _board_hero("Bravo")
    result = harness.battle(headers, hero_a, hero_b, extra={"controlMode": "program"})

    assert result["controlMode"] == "program"
    assert result["winner"] in {"Alpha", "Bravo", "Tie"}
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k control_mode -v
```

Expected: fail because the endpoint does not yet echo or route control mode.

- [ ] **Step 3: Write the minimal implementation**

Update `run_auto_duel` / `run_team_duel` to accept a controller instance or a `control_mode` string and route decision selection through a tiny adapter. Keep the default behavior on the current program controller. Add an AI-facing observation hook that returns the same public state, so future AI code can consume it without touching the resolver.

In `backend/main.py`, read `controlMode` from the battle request body, default it to `"program"`, and include it in the response payload. Keep GUI behavior unchanged.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
pytest backend/tests/integration/test_backend_api.py -k control_mode -v
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add backend/battle_logic.py backend/main.py backend/tests/integration/test_backend_api.py
git commit -m "feat: thread battle control mode through simulation"
```

