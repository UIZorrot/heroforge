from copy import deepcopy

import pytest

import battle_logic
import battle_sessions
import game_logic


def hero(name, speed=100, skills=None):
    return {"name": name, "BP": "1000", "state": {
        "HP": "5000", "MP": "100", "ATK": "100", "DEF": "0", "CC": "0",
        "SPEED": str(speed), "CA": "0", "PI": "0", "EV": "0", "AC": "0", "TYPE": "magic",
    }, "skill": skills or {}}


def skill(**changes):
    return {"name": "Volley", "TARGET": "Enemy", "RANGE": "enemy", "TARGET_NUM": "2",
            "ROLE": "attack", "DMG": "40", "MP_COST": "10", **changes}


def room(ability, preparing=False):
    return battle_sessions.BattleSession(
        session_id="features", battle_mode="arena_2x3", control_mode="manual",
        label_a="Alpha", label_b="Beta", team_a_payload=[hero("Caster", skills={"s1": ability})],
        team_b_payload=[hero("First", 50), hero("Second", 40)],
        participant_ids={"A": "local-test"}, require_confirmation=preparing, auto_ready_b=preparing,
    )


def cast(session, target="B2"):
    session.submit_action({"kind": "skill", "skillSlot": "s1", "actorTag": session.active_actor_tag,
                           "targetTag": target, "expectedEventCount": len(session.events)})


@pytest.fixture(autouse=True)
def stable_random(monkeypatch):
    monkeypatch.setattr(battle_logic.random, "random", lambda: 0.5)


def test_manual_area_skill_hits_primary_first_and_charges_once():
    session = room(skill())
    cast(session)
    assert [event["defender"] for event in session.events] == ["B2", "B1"]
    assert [unit.hp for unit in session.team_b_units if unit] == [4860, 4860]
    assert session.team_a_units[0].mp == 90
    assert sum(event["mpCostApplied"] for event in session.events) == 10
    assert len(session.board_history) == len(session.events) + 1
    assert session.board_history[1]["top"][1]["hp"] == 4860
    assert session.board_history[1]["top"][0]["hp"] == 5000


def test_target_count_does_not_override_range_or_resurrect_dead_units():
    session = room(skill(RANGE="melee", TARGET_NUM="6"))
    cast(session, "B1")
    assert len(session.events) == 1
    assert session.team_b_units[1].hp == 5000


def test_ally_area_heal_can_include_caster_and_charges_once():
    session = room(skill(TARGET="Ally", RANGE="ally", ROLE="buff", DMG="0", BUFF_HP="25"))
    extra = battle_logic.Battler(hero("Friend", 60), "A", 1)
    session.team_a_units[1] = extra
    actor = session.team_a_units[0]
    actor.hp -= 100
    extra.hp -= 100
    cast(session, "A2")
    assert actor.hp == extra.hp == 4925
    assert [event["heal"] for event in session.events] == [25, 25]
    assert [event["damage"] for event in session.events] == [0, 0]
    assert actor.mp == 90


def test_opening_passive_waits_for_preparation_and_cannot_be_cast():
    ability = skill(IS_PASSIVE=True, TARGET="Self", RANGE="self", ROLE="buff", DMG="0",
                    BUFF_NAME="pray", BUFF_TIME="3", BUFF_DMG="12")
    session = room(ability, preparing=True)
    assert session.events == []
    session.confirm_preparation("A", {"A1": 0})
    assert len(session.events) == 1
    assert session.team_a_units[0].atk == 112
    assert session.team_a_units[0].mp == 100
    assert all(option["skillSlot"] != "s1" for option in session.public_snapshot()["actionOptions"] if "skillSlot" in option)
    with pytest.raises(battle_sessions.BattleSessionError, match="Passive"):
        cast(session, "A1")
    session.submit_action({"kind": "attack", "actorTag": session.active_actor_tag, "targetTag": "B1", "expectedEventCount": 1})
    assert len([event for event in session.events if event["skillName"] == "Volley"]) == 1


def test_program_controller_never_selects_a_passive():
    actor = battle_logic.Battler(hero("Passive", skills={"s1": skill(IS_PASSIVE="True")}), "A")
    enemy = battle_logic.Battler(hero("Enemy"), "B")
    observation = battle_logic.build_public_battle_observation(1, actor, [actor], [enemy], "A", "B")
    assert battle_logic.ProgramBattleController().choose_action(observation).kind == "attack"
    assert battle_logic._pick_skill(actor, 1) is None


def test_all_buff_fields_apply_independently_and_expire():
    actor = battle_logic.Battler(hero("Actor"), "A")
    actor.hp, actor.mp = 4900, 50
    ability = skill(TARGET="Self", ROLE="buff", DMG="0", BUFF_NAME="pray", BUFF_TIME="2",
                    BUFF_HP="25", BUFF_MP="7", BUFF_DMG="12", BUFF_DEF="8", BUFF_CC="9", BUFF_EV="4", BUFF_AC="5")
    battle_logic._resolve_skill_hit(actor, actor, ability, 1, lambda *args, **kwargs: None, [])
    assert (actor.atk, actor.def_val, actor.cc, actor.ev, actor.ac) == (112, 8, 9, 4, 5)
    assert actor.spd == 100
    actor.tick_buffs(2, lambda *args, **kwargs: None)
    assert (actor.hp, actor.mp) == (4925, 57)
    actor.tick_buffs(3, lambda *args, **kwargs: None)
    assert (actor.atk, actor.def_val, actor.cc, actor.ev, actor.ac) == (100, 0, 0, 0, 0)


def test_curse_changes_only_marked_stats_and_cannot_create_negative_damage():
    target = battle_logic.Battler(hero("Target"), "B")
    target.base_def, target.base_ev, target.base_ac = 70, 20, 30
    target.add_buff("curse", 2, 12, [], effects={"BUFF_DMG": 12, "BUFF_DEF": 8, "BUFF_EV": 4})
    assert (target.atk, target.def_val, target.ev, target.ac) == (88, 62, 16, 30)
    target.add_buff("pray", 2, 200, [])
    assert target.def_val == 80


def test_periodic_status_keeps_its_additional_stat_fields():
    target = battle_logic.Battler(hero("Target"), "B")
    target.add_buff("heal", 2, 25, [], effects={"BUFF_HP": 25, "BUFF_CC": 9})
    assert target.cc == 9
    target.add_buff("poison", 2, 20, [], effects={"BUFF_DMG": 20, "BUFF_CC": 4})
    assert target.cc == 5
    assert target.atk == 100  # DoT magnitude is not an attack reduction.


def test_stun_applied_after_target_acted_still_skips_its_next_action():
    unit = battle_logic.Battler(hero("Stunned"), "B")
    unit.add_buff("stun", 1, 0, [])
    unit.tick_buffs(2, lambda *args, **kwargs: None)
    assert unit.is_stunned
    unit.consume_stun()
    assert not unit.is_stunned


class AlwaysSkill:
    def choose_action(self, observation):
        return battle_logic.BattleAction(kind="skill", skill_slot="s1", target_tag="B2")


def test_automatic_team_combat_uses_area_resolution_and_event_snapshots():
    result = battle_logic.run_team_duel([hero("Caster", skills={"s1": skill()})],
                                      [hero("First", 50), hero("Second", 40)], "arena_2x3", "Alpha", "Beta", controller=AlwaysSkill())
    assert [event["defender"] for event in result["events"][:2]] == ["B2", "B1"]
    assert sum(event["mpCostApplied"] for event in result["events"][:2]) == 10
    assert len(result["boardHistory"]) == len(result["events"]) + 1


@pytest.mark.parametrize("mode", ["legacy", "program"])
def test_opening_passives_also_apply_in_automatic_modes(mode):
    ability = skill(IS_PASSIVE=True, TARGET="Self", RANGE="self", ROLE="buff", DMG="0",
                    BUFF_NAME="pray", BUFF_TIME="2", BUFF_DMG="12")
    actor = hero("Caster", skills={"s1": ability})
    enemy = hero("Enemy", 50)
    result = battle_logic.run_auto_duel(actor, enemy) if mode == "legacy" else battle_sessions.create_battle_session(
        "1v1", "program", "A", "B", [deepcopy(actor)], [enemy]).result
    openings = [event for event in result["events"] if event["skillName"] == "Volley"]
    assert len(openings) == 1
    assert openings[0]["mpCostApplied"] == 0
    assert openings[0]["damage"] == 0


def test_generator_constrains_invalid_passive_and_preserves_template():
    generated = game_logic.adjust_based_on_bp({"name": "Opening", "BP": "1000", "template": "knight",
        "state_weights": {}, "skill": {"s1": skill(IS_PASSIVE=True, IS_STUN=True, BUFF_NAME="stun", BUFF_TIME="99")}})
    opening = generated["skill"]["s1"]
    assert generated["template"] == "knight"
    assert (opening["TARGET"], opening["RANGE"], opening["TARGET_NUM"]) == ("self", "self", "1")
    assert (opening["DMG"], opening["MP_COST"], opening["IS_STUN"]) == ("0", "0", "False")
    assert opening["BUFF_NAME"] == "pray" and int(opening["BUFF_DMG"]) > 0
    assert opening["BUFF_TIME"] == "3"


@pytest.mark.parametrize("name,field", [("heal", "BUFF_HP"), ("frozen", "BUFF_EV"), ("poison", "BUFF_DMG")])
def test_named_status_cannot_be_generated_without_a_real_effect(name, field):
    generated = game_logic.adjust_based_on_bp({"BP": "1000", "template": "mage", "state_weights": {},
        "skill": {"s1": {"BUFF_NAME": name, "BUFF_TIME": 0, "TARGET": "Self" if name == "heal" else "Enemy"}}})
    assert int(generated["skill"]["s1"][field]) > 0
    assert 1 <= int(generated["skill"]["s1"]["BUFF_TIME"]) <= 3


def test_pve_six_targets_share_one_cast_and_include_sixth_enemy():
    session = battle_sessions.BattleSession(
        session_id="pve", battle_mode="pve_4v6", control_mode="manual", label_a="Party", label_b="Monsters",
        team_a_payload=[hero("Caster", 200, {"s1": skill(TARGET_NUM="6")})] + [hero(f"Ally{i}", 100) for i in range(3)],
        team_b_payload=[hero(f"Enemy{i}", 50) for i in range(6)], participant_ids={"A": "tester"})
    cast(session, "B6")
    assert [event["defender"] for event in session.events] == ["B6", "B1", "B2", "B3", "B4", "B5"]
    assert len({event["actionId"] for event in session.events}) == 1
    assert [event["targetIndex"] for event in session.events] == list(range(6))
    assert all(event["targetCount"] == 6 for event in session.events)
    assert sum(event["mpCostApplied"] for event in session.events) == 10
    assert len(session.team_a_units) == len(session.team_b_units) == 6
    assert session.team_a_units[4:] == [None, None]
    assert session.team_b_units[5].hp == 4860
    assert len(session.board_history) == 7


def test_pve_automatic_mode_preserves_enemy_sixth_turn_and_group_ids():
    result = battle_logic.run_team_duel([hero("Caster", 200, {"s1": skill(TARGET_NUM="6")})] * 4,
                                       [hero(f"Enemy{i}", 50) for i in range(6)], "pve_4v6", "Party", "Monsters")
    assert any(event["attacker"] == "B6" for event in result["events"])
    opening = result["events"][:6]
    assert len({event["actionId"] for event in opening}) == 1
    assert all(event["targetCount"] == 6 for event in opening)
    assert result["board"]["bottom"][4:] == [None, None]


@pytest.mark.parametrize("players,enemies", [(5, 6), (4, 7), (0, 6), (4, 0)])
def test_pve_rejects_invalid_sizes_instead_of_dropping_units(players, enemies):
    a, b = [hero("Ally")] * players, [hero("Enemy")] * enemies
    with pytest.raises(battle_sessions.BattleSessionError, match="pve_4v6"):
        battle_sessions.BattleSession(session_id="invalid", battle_mode="pve_4v6", control_mode="manual",
                                      label_a="A", label_b="B", team_a_payload=a, team_b_payload=b)
    with pytest.raises(ValueError, match="pve_4v6"):
        battle_logic.run_team_duel(a, b, "pve_4v6", "A", "B")


@pytest.mark.parametrize("presentation", ["sky", "instant", "direct", "auto", "invalid"])
def test_skill_delivery_metadata_is_visual_only_and_survives_resolution(presentation):
    session = room(skill(VFX_PRESENTATION=presentation))
    cast(session)
    expected = "instant" if presentation == "sky" else presentation if presentation in {"instant", "direct"} else "auto"
    assert all(event["vfxPresentation"] == expected for event in session.events)
    assert [unit.hp for unit in session.team_b_units if unit] == [4860, 4860]
    assert sum(event["mpCostApplied"] for event in session.events) == 10
