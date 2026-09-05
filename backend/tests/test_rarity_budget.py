import random

from game_logic import (
    RARITY_BP_MULTIPLIER,
    STAT_COSTS,
    adjust_based_on_bp,
    rarity_stat_budget,
    resolve_rarity,
    roll_rarity,
)


def _stat_point_budget(hero: dict) -> int:
    state = hero["state"]
    return sum(int(float(state[stat])) * STAT_COSTS[stat] for stat in STAT_COSTS)


def _base_payload(*, rarity: str) -> dict:
    return {
        "name": "Budget Probe",
        "description": "Rarity budget probe",
        "BP": 1000,
        "rarity": rarity,
        "template": "warrior",
        "state_weights": {
            "HP": 5,
            "MP": 5,
            "ATK": 5,
            "DEF": 5,
            "CC": 5,
            "SPEED": 5,
            "CA": 5,
            "PI": 5,
            "EV": 5,
            "AC": 5,
            "TYPE": "weapon",
        },
        "skill": {
            "s1": {
                "name": "Cut",
                "description": "A cut.",
                "TYPE": "weapon",
                "type_catalog": "instant",
                "type_effect": "strike",
                "TARGET": "Enemy",
                "TARGET_NUM": "1",
                "ROLE": "damage",
            },
            "s2": {
                "name": "Guard",
                "description": "A guard.",
                "TYPE": "weapon",
                "type_catalog": "instant",
                "type_effect": "strike",
                "TARGET": "Self",
                "TARGET_NUM": "1",
                "ROLE": "defend",
            },
        },
    }


def test_resolve_rarity_defaults_to_common_without_roll():
    assert resolve_rarity(None) == "common"
    assert resolve_rarity("MYTHIC") == "mythic"
    assert resolve_rarity("nope") == "common"


def test_roll_rarity_only_emits_known_values():
    rng = random.Random(7)
    values = {roll_rarity(rng) for _ in range(200)}
    assert values <= set(RARITY_BP_MULTIPLIER)


def test_rarity_stat_budget_scales_nominal_bp():
    assert rarity_stat_budget(10000, "common") == 10000
    assert rarity_stat_budget(10000, "mythic") == 11000
    assert rarity_stat_budget(1000, "rare") == 1030


def test_adjust_based_on_bp_keeps_nominal_bp_and_writes_rarity():
    hero = adjust_based_on_bp(_base_payload(rarity="epic"))
    assert hero["BP"] == "1000"
    assert hero["rarity"] == "epic"


def test_same_bp_mythic_gets_higher_stat_budget_than_common():
    random.seed(42)
    common = adjust_based_on_bp(_base_payload(rarity="common"))
    random.seed(42)
    mythic = adjust_based_on_bp(_base_payload(rarity="mythic"))

    assert common["BP"] == mythic["BP"] == "1000"
    assert _stat_point_budget(mythic) > _stat_point_budget(common)
