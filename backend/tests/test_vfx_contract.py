from battle_logic import _visual_type_contract as battle_visual_type_contract
from game_logic import _build_skill, _visual_type_contract as generated_visual_type_contract
from starter_cards import STARTER_CARDS
from vfx_contract import (
    CANONICAL_BUFF_NAMES,
    CANONICAL_INSTANT_TYPE_EFFECTS,
    CANONICAL_PROJECTILE_TYPE_EFFECTS,
    PROJECTILE_TYPE_EFFECTS,
    normalize_projectile_type_effect,
)


def test_projectile_type_effects_match_asset_metadata_contract():
    assert CANONICAL_PROJECTILE_TYPE_EFFECTS == (
        "blood",
        "fire",
        "frost",
        "holy",
        "magic",
        "nature",
        "arrow",
        "lighting",
        "void",
        "water",
        "bullet",
        "rock",
    )


def test_legacy_projectile_metadata_is_normalized():
    assert normalize_projectile_type_effect("flesh") == "blood"
    assert normalize_projectile_type_effect("light") == "holy"
    assert normalize_projectile_type_effect("gun") == "bullet"
    assert normalize_projectile_type_effect("gunsmoke ranger") == "bullet"
    assert normalize_projectile_type_effect("thunder") == "lighting"
    assert normalize_projectile_type_effect("lightning") == "lighting"
    assert normalize_projectile_type_effect("dark") == "void"
    assert normalize_projectile_type_effect("poison") == "nature"
    assert normalize_projectile_type_effect("stone") == "rock"


def test_unknown_projectile_metadata_uses_magic_fallback():
    assert normalize_projectile_type_effect("unclassified_energy") == "magic"


def test_backend_visual_contracts_emit_canonical_projectile_metadata():
    source = {"TYPE": "thunder", "type_catalog": "proj", "type_effect": "lightning"}
    assert battle_visual_type_contract(source)["type_effect"] == "lighting"
    assert generated_visual_type_contract(source)["type_effect"] == "lighting"


def test_starter_projectile_metadata_uses_only_canonical_tokens():
    projectile_effects = []
    for card in STARTER_CARDS:
        state = card["state"]
        if state.get("type_catalog") == "proj":
            projectile_effects.append(state["type_effect"])
        for skill in card["skill"].values():
            if skill.get("type_catalog") == "proj":
                projectile_effects.append(skill["type_effect"])

    assert projectile_effects
    assert set(projectile_effects) <= PROJECTILE_TYPE_EFFECTS


def test_instant_type_effects_match_frontend_contract():
    # Keep in sync with frontend canonicalBattleInstantTypeEffects (battleVfxCatalog.ts).
    assert CANONICAL_INSTANT_TYPE_EFFECTS == (
        "magic",
        "thunder",
        "strike",
        "explode",
        "fire",
        "poison",
        "frost",
        "dark",
        "light",
        "nature",
        "water",
        "claw",
        "pierce",
        "blunt",
        "bullet_hit",
    )


def test_buff_names_match_frontend_contract():
    # Keep in sync with frontend canonicalBattleBuffTypeEffects (battleVfxCatalog.ts).
    assert CANONICAL_BUFF_NAMES == (
        "stun",
        "frozen",
        "poison",
        "wound",
        "burn",
        "curse",
        "heal",
        "pray",
    )


def test_weapon_maps_to_strike_instant_effect():
    source = {"TYPE": "weapon"}
    for contract in (battle_visual_type_contract, generated_visual_type_contract):
        visual = contract(source)
        assert visual["type_catalog"] == "instant"
        assert visual["type_effect"] == "strike"


def test_starter_instant_and_buff_metadata_uses_only_canonical_tokens():
    instant_effects = []
    buff_effects = []
    for card in STARTER_CARDS:
        state = card["state"]
        if state.get("type_catalog") == "instant":
            instant_effects.append(state["type_effect"])
        for skill in card["skill"].values():
            if skill.get("type_catalog") == "instant":
                instant_effects.append(skill["type_effect"])
            if skill.get("buff_type_effect"):
                buff_effects.append(skill["buff_type_effect"])

    assert instant_effects
    assert set(instant_effects) <= set(CANONICAL_INSTANT_TYPE_EFFECTS)
    assert buff_effects
    assert set(buff_effects) <= set(CANONICAL_BUFF_NAMES)


def _numeric_state() -> dict:
    return {
        "HP": "1000",
        "MP": "200",
        "ATK": "100",
        "DEF": "50",
        "CC": "10",
        "SPEED": "50",
        "CA": "10",
        "PI": "10",
        "EV": "10",
        "AC": "10",
        "TYPE": "magic",
    }


def test_generation_drops_unknown_buff_names():
    skill = {"ROLE": "attack", "DMG": 1, "BUFF_NAME": "silence", "BUFF_TIME": 2}
    built = _build_skill(skill, _numeric_state(), "mage")
    assert "BUFF_NAME" not in built


def test_generation_keeps_canonical_buff_names():
    skill = {"ROLE": "attack", "DMG": 1, "BUFF_NAME": " Poison ", "BUFF_TIME": 2}
    built = _build_skill(skill, _numeric_state(), "mage")
    assert built["BUFF_NAME"] == "poison"


def test_generation_clamps_targeting_fields():
    skill = {"ROLE": "attack", "DMG": 1, "TARGET": "everyone", "RANGE": "far", "TARGET_NUM": "lots"}
    built = _build_skill(skill, _numeric_state(), "mage")
    assert built["TARGET"] == "enemy"
    assert built["RANGE"] == "enemy"
    assert built["TARGET_NUM"] == "1"


def test_generation_keeps_valid_targeting_fields():
    skill = {"ROLE": "attack", "DMG": 1, "TARGET": "Ally", "RANGE": "ally", "TARGET_NUM": "3"}
    built = _build_skill(skill, _numeric_state(), "cleric")
    assert built["TARGET"] == "ally"
    assert built["RANGE"] == "ally"
    assert built["TARGET_NUM"] == "3"


def test_generation_melee_targeting_defaults_from_target():
    skill = {"ROLE": "attack", "DMG": 1, "TARGET": "Self", "RANGE": ""}
    built = _build_skill(skill, _numeric_state(), "warrior")
    assert built["TARGET"] == "self"
    assert built["RANGE"] == "self"
