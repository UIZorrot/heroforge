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
