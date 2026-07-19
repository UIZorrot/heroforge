from battle_logic import _visual_type_contract as battle_visual_type_contract
from game_logic import _visual_type_contract as generated_visual_type_contract
from starter_cards import STARTER_CARDS
from vfx_contract import CANONICAL_PROJECTILE_TYPE_EFFECTS, PROJECTILE_TYPE_EFFECTS, normalize_projectile_type_effect


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
