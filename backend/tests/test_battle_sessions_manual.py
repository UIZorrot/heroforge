import pytest

import battle_sessions
from test_battle_sessions_program import _hero


def session(two_players=True, preparing=False):
    return battle_sessions.BattleSession(
        session_id="manual-test", battle_mode="arena_2x3", control_mode="manual",
        label_a="Alpha", label_b="Beta", team_a_payload=[_hero("Alpha", 60)],
        team_b_payload=[_hero("Beta", 50), _hero("Gamma", 40)],
        participant_ids={"A": "user-a", "B": "user-b"} if two_players else {"A": "user-a"},
        wait_seconds=999, require_confirmation=preparing,
    )


def action(room, target="B1"):
    return {"actorTag": room.active_actor_tag, "kind": "attack", "targetTag": target, "expectedEventCount": len(room.events)}


def test_thirty_seconds_start_only_after_both_players_confirm(monkeypatch):
    monkeypatch.setattr(battle_sessions, "_now_ms", lambda: 100_000)
    room = session(preparing=True)
    room.confirm_preparation("A", {"A1": 0})
    assert room.waiting_until_ms is None
    assert not room.auto_advance_due(999_999)
    room.confirm_preparation("B", {"B1": 0, "B2": 1})
    assert room.waiting_until_ms == 130_000
    assert room.public_snapshot()["waitSeconds"] == 30
    assert room.public_snapshot()["waitingUntil"] == 130_000


def test_both_players_can_choose_any_legal_primary_target_and_stale_actions_fail():
    room = session()
    assert "B2" in room.public_snapshot()["actionOptions"][0]["targets"]
    stale = action(room, "B2")
    room.submit_action(stale)
    assert room.events[-1]["defender"] == "B2"
    assert room.active_actor_tag == "B1"
    assert room.expected_action_source == "manual"
    assert room.public_snapshot()["actionOptions"]
    count = len(room.events)
    with pytest.raises(battle_sessions.BattleSessionError, match="turn has changed"):
        room.submit_action(stale)
    assert len(room.events) == count
    room.submit_action(action(room, "A1"))
    assert room.events[-1]["attacker"] == "B1"


def test_timeout_acts_once_and_never_extends_the_current_deadline(monkeypatch):
    now = [100_000]
    monkeypatch.setattr(battle_sessions, "_now_ms", lambda: now[0])
    room = session()
    assert not room.auto_advance_due(129_999)
    now[0] = 130_000
    assert room.auto_advance_due()
    count = len(room.events)
    assert count == 1 and room.last_action_source == "program"
    assert room.waiting_until_ms == 160_000
    assert not room.auto_advance_due()
    assert len(room.events) == count
    assert room.public_snapshot()["waitingUntil"] == 160_000


def test_late_submission_cannot_beat_server_timeout(monkeypatch):
    now = [100_000]
    monkeypatch.setattr(battle_sessions, "_now_ms", lambda: now[0])
    room = session()
    pending = action(room)
    now[0] = 130_000
    with pytest.raises(battle_sessions.BattleSessionError, match="Time expired"):
        room.submit_action(pending)
    assert len(room.events) == 1 and room.last_action_source == "program"


def test_solo_human_can_think_indefinitely_but_ai_advances():
    room = session(two_players=False)
    assert room.waiting_until_ms is None
    assert not room.auto_advance_due(10**18)
    room.submit_action(action(room))
    assert room.expected_action_source == "program"
    assert room.waiting_until_ms is not None
    assert not room.public_snapshot()["actionOptions"]


def test_illegal_target_and_unaffordable_skill_do_not_consume_turn():
    room = session()
    with pytest.raises(battle_sessions.BattleSessionError):
        room.submit_action(action(room, "A1"))
    assert not room.events
    room.current_actor.character["skill"] = {"s1": {"name": "Costly", "MP_COST": 9999, "TARGET": "Enemy"}}
    assert room.public_snapshot()["actionOptions"][1]["disabled"] == "Not enough MP"
    with pytest.raises(battle_sessions.BattleSessionError):
        room.submit_action(action(room) | {"kind": "skill", "skillSlot": "s1"})
    assert not room.events
