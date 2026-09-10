import battle_sessions


def _hero(name: str, speed: int):
    return {
        "name": name,
        "BP": "1000",
        "state": {
            "HP": "360",
            "MP": "100",
            "ATK": "82",
            "DEF": "12",
            "CC": "0",
            "SPEED": str(speed),
            "CA": "0",
            "PI": "0",
            "EV": "0",
            "AC": "0",
            "TYPE": "weapon",
        },
        "skill": {},
    }


def test_program_session_resolves_immediately_with_replay_history():
    session = battle_sessions.create_battle_session(
        battle_mode="arena_2x3",
        control_mode="program",
        label_a="Forger",
        label_b="Rival",
        team_a=[_hero("Alpha", 55)],
        team_b=[_hero("Beta", 45)],
        wait_seconds=30,
    )

    snapshot = session.public_snapshot()
    assert snapshot["status"] == "resolved"
    assert snapshot["controlMode"] == "program"
    assert snapshot["result"]["winnerLabel"] in {"Forger", "Rival", "Tie"}
    assert snapshot["events"]
    assert len(snapshot["boardHistory"]) > 1


def test_program_session_rejects_manual_actions():
    session = battle_sessions.create_battle_session(
        battle_mode="1v1",
        control_mode="program",
        label_a="Forger",
        label_b="Rival",
        team_a=[_hero("Alpha", 55)],
        team_b=[_hero("Beta", 45)],
        wait_seconds=30,
    )

    try:
        session.submit_action({"kind": "attack", "actorTag": "A1"})
    except battle_sessions.BattleSessionError as exc:
        assert "do not accept manual actions" in str(exc)
    else:
        raise AssertionError("program sessions must reject manual actions")


def _prepared(control="program", auto_ready=False):
    return battle_sessions.create_battle_session(
        "arena_2x3", control, "Forger", "Rival", [_hero("Alpha", 55), _hero("Ally", 40)], [_hero("Beta", 45)],
        require_confirmation=True, auto_ready_b=auto_ready, participant_ids={"A": "user-a", "B": "user-b"},
    )


def test_preparation_waits_for_both_confirmations_and_uses_final_slots():
    session = _prepared()
    assert session.status == "preparing"
    assert not session.events and session.waiting_until_ms is None
    assert session.auto_advance_due(now_ms=10**18) is False
    first = session.confirm_preparation("A", {"A1": 5, "A2": 0})
    assert first["status"] == "preparing" and first["readiness"] == {"A": True, "B": False}
    assert not first["events"]
    assert session.team_a_units[5].name == "Alpha"
    result = session.confirm_preparation("B", {"B1": 3})
    assert result["status"] == "resolved" and result["events"]
    initial = result["boardHistory"][0]
    assert initial["bottom"][5]["name"] == "Alpha"
    assert initial["top"][3]["name"] == "Beta"
    count = len(result["events"])
    assert len(session.confirm_preparation("A", {"A1": 5, "A2": 0})["events"]) == count


def test_preparation_rejects_foreign_duplicate_missing_and_locked_moves():
    import pytest
    session = _prepared()
    for positions in ({"B1": 0}, {"A1": 0}, {"A1": 0, "A2": 0}, {"A1": 6, "A2": 0}, {"A1": True, "A2": 0}):
        with pytest.raises(battle_sessions.BattleSessionError):
            session.confirm_preparation("A", positions)
    assert session.ready_sides == {"A": False, "B": False}
    session.confirm_preparation("A", {"A1": 0, "A2": 1})
    with pytest.raises(battle_sessions.BattleSessionError, match="locked"):
        session.confirm_preparation("A", {"A1": 1, "A2": 0})


def test_simulated_opponent_is_ready_but_combat_waits_for_player():
    session = _prepared(auto_ready=True)
    assert session.public_snapshot()["readiness"] == {"A": False, "B": True}
    assert not session.events
    assert session.confirm_preparation("A", {"A1": 0, "A2": 4})["status"] == "resolved"


def test_rest_actions_cannot_skip_preparation_and_clock_starts_after_confirmation():
    import pytest
    session = _prepared(control="rest")
    with pytest.raises(battle_sessions.BattleSessionError, match="Both sides"):
        session.submit_action({"actorTag": "A1", "kind": "attack"})
    session.confirm_preparation("A", {"A1": 0, "A2": 1})
    assert session.waiting_until_ms is None
    snapshot = session.confirm_preparation("B", {"B1": 0})
    assert snapshot["status"] == "awaiting_action" and snapshot["waitingUntil"] is not None


def test_simultaneous_confirmations_start_combat_exactly_once():
    from concurrent.futures import ThreadPoolExecutor
    session = _prepared()
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(session.confirm_preparation, side, positions) for side, positions in (("A", {"A1": 1, "A2": 0}), ("B", {"B1": 2}))]
        for future in futures:
            future.result()
    assert session.status == "resolved"
    assert sum("Battle finished" in log for log in session.logs) == 1
