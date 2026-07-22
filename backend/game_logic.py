import math
import random
from typing import Dict, Any

from vfx_contract import normalize_projectile_type_effect


STAT_COSTS = {
    "HP": 1,
    "MP": 1,
    "ATK": 4,
    "DEF": 8,
    "CC": 4,
    "SPEED": 10,
    "CA": 4,
    "PI": 8,
    "EV": 6,
    "AC": 4,
}


def _visual_token(value: Any, fallback: str = "") -> str:
    token = str(value if value is not None else fallback).strip().lower().replace(" ", "_").replace("-", "_")
    return token or fallback


def _legacy_type_catalog(effect_type: Any) -> str:
    token = _visual_token(effect_type, "flesh")
    if token in {"weapon", "flesh", "slash", "claw"}:
        return "instant"
    return "proj"


def _legacy_type_effect(effect_type: Any, type_catalog: str | None = None) -> str:
    token = _visual_token(effect_type, "flesh")
    catalog = type_catalog or _legacy_type_catalog(token)
    if catalog == "instant":
        if token == "weapon":
            return "slash"
        if token == "flesh":
            return "claw"
    if catalog == "proj" and token == "weapon":
        return "arrow"
    if catalog == "proj":
        return normalize_projectile_type_effect(token)
    return token


def _visual_type_contract(source: Dict[str, Any] | None, fallback_type: Any = None) -> Dict[str, str | None]:
    source = source if isinstance(source, dict) else {}
    legacy_type = source.get("TYPE", fallback_type)
    catalog = _visual_token(source.get("type_catalog", source.get("typeCatalog")), "")
    if catalog == "projectile":
        catalog = "proj"
    if catalog == "melee":
        catalog = "instant"
    if catalog not in {"proj", "instant"}:
        catalog = _legacy_type_catalog(legacy_type)

    buff_effect = _visual_token(source.get("buff_type_effect", source.get("buffTypeEffect")), "")
    raw_effect = _visual_token(source.get("type_effect", source.get("typeEffect")), "") or _legacy_type_effect(legacy_type, catalog)
    return {
        "type_catalog": catalog,
        "type_effect": normalize_projectile_type_effect(raw_effect, legacy_type) if catalog == "proj" else raw_effect,
        "buff_type_effect": buff_effect or None,
    }


TEMPLATE_PROFILES = {
    "knight": {
        "hpmp_range": (0.50, 0.58),
        "hp_ratio": (0.68, 0.78),
        "bias": {
            "HP": 1.25,
            "MP": 0.75,
            "ATK": 1.00,
            "DEF": 1.45,
            "CC": 0.80,
            "SPEED": 0.75,
            "CA": 0.95,
            "PI": 1.10,
            "EV": 0.70,
            "AC": 0.90,
        },
        "damage": 0.95,
        "mp_cost": 0.14,
    },
    "paladin": {
        "hpmp_range": (0.52, 0.62),
        "hp_ratio": (0.70, 0.82),
        "bias": {
            "HP": 1.30,
            "MP": 1.00,
            "ATK": 0.90,
            "DEF": 1.40,
            "CC": 0.75,
            "SPEED": 0.70,
            "CA": 0.90,
            "PI": 1.00,
            "EV": 0.60,
            "AC": 1.15,
        },
        "damage": 0.90,
        "mp_cost": 0.15,
    },
    "warrior": {
        "hpmp_range": (0.46, 0.54),
        "hp_ratio": (0.58, 0.68),
        "bias": {
            "HP": 1.15,
            "MP": 0.85,
            "ATK": 1.25,
            "DEF": 1.15,
            "CC": 1.00,
            "SPEED": 0.95,
            "CA": 1.05,
            "PI": 0.95,
            "EV": 0.85,
            "AC": 0.95,
        },
        "damage": 1.05,
        "mp_cost": 0.16,
    },
    "berserker": {
        "hpmp_range": (0.38, 0.48),
        "hp_ratio": (0.52, 0.64),
        "bias": {
            "HP": 1.05,
            "MP": 0.70,
            "ATK": 1.45,
            "DEF": 0.80,
            "CC": 1.30,
            "SPEED": 1.05,
            "CA": 1.35,
            "PI": 0.85,
            "EV": 0.75,
            "AC": 0.85,
        },
        "damage": 1.25,
        "mp_cost": 0.14,
    },
    "assassin": {
        "hpmp_range": (0.34, 0.42),
        "hp_ratio": (0.44, 0.56),
        "bias": {
            "HP": 0.80,
            "MP": 0.90,
            "ATK": 1.20,
            "DEF": 0.70,
            "CC": 1.15,
            "SPEED": 1.40,
            "CA": 1.10,
            "PI": 1.20,
            "EV": 1.30,
            "AC": 1.10,
        },
        "damage": 1.20,
        "mp_cost": 0.15,
    },
    "rogue": {
        "hpmp_range": (0.36, 0.46),
        "hp_ratio": (0.46, 0.58),
        "bias": {
            "HP": 0.90,
            "MP": 0.80,
            "ATK": 1.05,
            "DEF": 0.70,
            "CC": 1.05,
            "SPEED": 1.35,
            "CA": 1.00,
            "PI": 1.20,
            "EV": 1.35,
            "AC": 1.10,
        },
        "damage": 1.05,
        "mp_cost": 0.12,
    },
    "mage": {
        "hpmp_range": (0.48, 0.56),
        "hp_ratio": (0.36, 0.46),
        "bias": {
            "HP": 0.85,
            "MP": 1.45,
            "ATK": 1.05,
            "DEF": 0.85,
            "CC": 1.10,
            "SPEED": 1.00,
            "CA": 1.15,
            "PI": 0.90,
            "EV": 0.90,
            "AC": 1.15,
        },
        "damage": 1.15,
        "mp_cost": 0.20,
    },
    "sorcerer": {
        "hpmp_range": (0.50, 0.60),
        "hp_ratio": (0.32, 0.44),
        "bias": {
            "HP": 0.80,
            "MP": 1.55,
            "ATK": 1.00,
            "DEF": 0.75,
            "CC": 1.05,
            "SPEED": 0.95,
            "CA": 1.35,
            "PI": 0.85,
            "EV": 0.85,
            "AC": 1.20,
        },
        "damage": 1.25,
        "mp_cost": 0.24,
    },
    "cleric": {
        "hpmp_range": (0.52, 0.64),
        "hp_ratio": (0.46, 0.58),
        "bias": {
            "HP": 1.00,
            "MP": 1.35,
            "ATK": 0.75,
            "DEF": 1.05,
            "CC": 0.75,
            "SPEED": 0.85,
            "CA": 0.80,
            "PI": 0.80,
            "EV": 0.75,
            "AC": 1.25,
        },
        "damage": 0.80,
        "mp_cost": 0.18,
    },
    "ranger": {
        "hpmp_range": (0.40, 0.48),
        "hp_ratio": (0.48, 0.58),
        "bias": {
            "HP": 1.00,
            "MP": 0.90,
            "ATK": 1.10,
            "DEF": 0.85,
            "CC": 1.05,
            "SPEED": 1.20,
            "CA": 1.05,
            "PI": 1.00,
            "EV": 1.15,
            "AC": 1.25,
        },
        "damage": 1.00,
        "mp_cost": 0.14,
    },
    "sniper": {
        "hpmp_range": (0.38, 0.46),
        "hp_ratio": (0.42, 0.52),
        "bias": {
            "HP": 0.85,
            "MP": 0.85,
            "ATK": 1.20,
            "DEF": 0.65,
            "CC": 1.30,
            "SPEED": 1.10,
            "CA": 1.10,
            "PI": 1.35,
            "EV": 0.95,
            "AC": 1.45,
        },
        "damage": 1.10,
        "mp_cost": 0.13,
    },
    "tank": {
        "hpmp_range": (0.58, 0.66),
        "hp_ratio": (0.78, 0.88),
        "bias": {
            "HP": 1.50,
            "MP": 0.70,
            "ATK": 0.85,
            "DEF": 1.55,
            "CC": 0.70,
            "SPEED": 0.65,
            "CA": 0.80,
            "PI": 1.20,
            "EV": 0.55,
            "AC": 0.80,
        },
        "damage": 0.85,
        "mp_cost": 0.12,
    },
    "guardian": {
        "hpmp_range": (0.56, 0.66),
        "hp_ratio": (0.70, 0.82),
        "bias": {
            "HP": 1.45,
            "MP": 0.80,
            "ATK": 0.80,
            "DEF": 1.45,
            "CC": 0.80,
            "SPEED": 0.70,
            "CA": 0.80,
            "PI": 1.25,
            "EV": 0.60,
            "AC": 1.05,
        },
        "damage": 0.90,
        "mp_cost": 0.12,
    },
    "summoner": {
        "hpmp_range": (0.50, 0.62),
        "hp_ratio": (0.34, 0.46),
        "bias": {
            "HP": 0.90,
            "MP": 1.50,
            "ATK": 0.85,
            "DEF": 0.85,
            "CC": 0.95,
            "SPEED": 0.90,
            "CA": 1.10,
            "PI": 0.80,
            "EV": 0.85,
            "AC": 1.25,
        },
        "damage": 1.00,
        "mp_cost": 0.22,
    },
}


ROLE_DAMAGE_RANGE = {
    "attack": (1.05, 2.20),
    "buff": (0.35, 0.95),
    "defense": (0.50, 1.35),
}


ROLE_MP_RANGE = {
    "attack": (0.12, 0.26),
    "buff": (0.08, 0.18),
    "defense": (0.10, 0.22),
}


def _safe_int(value: Any, default: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return value > 0
    if isinstance(value, str):
        return value.strip().lower() not in {"", "0", "false", "none", "null"}
    return bool(value)


def _normalize_template(template: Any) -> str:
    value = str(template or "warrior").strip().lower()
    return value if value in TEMPLATE_PROFILES else "warrior"


def _profile(template: Any) -> Dict[str, Any]:
    return TEMPLATE_PROFILES[_normalize_template(template)]


def calculate_actual_bp(state: Dict[str, Any]) -> int:
    hp = _safe_int(state.get("HP", 0))
    mp = _safe_int(state.get("MP", 0))
    atk = _safe_int(state.get("ATK", 0))
    defense = _safe_int(state.get("DEF", 0))
    cc = _safe_int(state.get("CC", 0))
    speed = _safe_int(state.get("SPEED", 0))
    ca = _safe_int(state.get("CA", 0))
    pi = _safe_int(state.get("PI", 0))
    ev = _safe_int(state.get("EV", 0))
    ac = _safe_int(state.get("AC", 0))

    return hp + mp + 4 * atk + 8 * defense + 4 * cc + 10 * speed + 4 * ca + 8 * pi + 6 * ev + 4 * ac


def _weighted_choice(candidates):
    total = sum(score for _, score in candidates)
    if total <= 0:
        return candidates[0][0]

    pick = random.uniform(0, total)
    upto = 0.0
    for key, score in candidates:
        upto += score
        if upto >= pick:
            return key
    return candidates[-1][0]


def _build_state(original_bp: int, weights: Dict[str, Any], template: str) -> Dict[str, str]:
    profile = _profile(template)

    priorities = {}
    for stat in STAT_COSTS:
        base_weight = max(1.0, min(10.0, _safe_float(weights.get(stat), 5.0)))
        bias = profile["bias"].get(stat, 1.0)
        priorities[stat] = base_weight * bias * random.uniform(0.85, 1.15)

    hpmp_ratio = random.uniform(*profile["hpmp_range"])
    hpmp_ratio = min(hpmp_ratio, 0.96)
    hpmp_pool = max(2, int(original_bp * hpmp_ratio))
    hp_ratio = random.uniform(*profile["hp_ratio"])
    hp_points = max(1, int(hpmp_pool * hp_ratio))
    mp_points = max(0, hpmp_pool - hp_points)

    remaining_bp = max(0, original_bp - hp_points - mp_points)
    other_stats = ["ATK", "DEF", "CC", "SPEED", "CA", "PI", "EV", "AC"]
    other_total = sum(priorities[stat] for stat in other_stats) or float(len(other_stats))

    generated = {
        "HP": hp_points,
        "MP": mp_points,
    }

    spent = 0
    for stat in other_stats:
        share = priorities[stat] / other_total
        points = remaining_bp * share
        value = max(0, int(points / STAT_COSTS[stat]))
        generated[stat] = value
        spent += value * STAT_COSTS[stat]

    leftover = original_bp - hp_points - mp_points - spent
    if leftover > 0:
        spendable_stats = [stat for stat in other_stats if STAT_COSTS[stat] <= leftover]
        while leftover > 0 and spendable_stats:
            chosen = _weighted_choice([(stat, priorities[stat]) for stat in spendable_stats])
            cost = STAT_COSTS[chosen]
            if cost <= leftover:
                generated[chosen] += 1
                leftover -= cost
            else:
                spendable_stats = [stat for stat in spendable_stats if stat != chosen]
        if leftover > 0:
            generated["HP"] += leftover
            leftover = 0

    generated_state = {key: str(value) for key, value in generated.items()}
    generated_state["TYPE"] = str(weights.get("TYPE") or weights.get("template") or weights.get("TEMPLATE") or "flesh")
    visual = _visual_type_contract(weights, generated_state["TYPE"])
    generated_state["type_catalog"] = str(visual["type_catalog"])
    generated_state["type_effect"] = str(visual["type_effect"])
    return generated_state


def _infer_role(skill: Dict[str, Any]) -> str:
    role = str(skill.get("ROLE") or "").strip().lower()
    if role in {"attack", "buff", "defense"}:
        return role

    if _truthy(skill.get("IS_PASSIVE")):
        return "buff"
    if _truthy(skill.get("BUFF_DEF")) or _truthy(skill.get("BUFF_EV")) or _truthy(skill.get("BUFF_AC")):
        return "defense"
    if _truthy(skill.get("BUFF_DMG")) or _truthy(skill.get("DMG")):
        return "attack"
    return "buff"


def _skill_numeric_value(field: str, skill: Dict[str, Any], state: Dict[str, str], profile: Dict[str, Any], role: str) -> int:
    buff_name = str(skill.get("BUFF_NAME", "")).strip().lower()
    target = str(skill.get("TARGET", "")).strip().lower()

    hp = _safe_int(state.get("HP", 0))
    mp = _safe_int(state.get("MP", 0))
    atk = _safe_int(state.get("ATK", 0))
    defense = _safe_int(state.get("DEF", 0))
    cc = _safe_int(state.get("CC", 0))
    ev = _safe_int(state.get("EV", 0))
    ac = _safe_int(state.get("AC", 0))

    if field == "DMG":
        rate = random.uniform(*ROLE_DAMAGE_RANGE[role]) * profile["damage"]
        return max(0, int(atk * rate))

    if field == "BUFF_HP":
        if buff_name == "heal":
            rate = random.uniform(0.10, 0.24)
            return max(0, int((hp if target != "enemy" else mp or hp) * rate))
        if buff_name in {"wound", "burn"}:
            rate = random.uniform(0.08, 0.20)
            return max(0, int(atk * rate))
        return max(0, int(atk * random.uniform(0.05, 0.14)))

    if field == "BUFF_MP":
        if buff_name == "heal":
            rate = random.uniform(0.08, 0.18)
            return max(0, int(mp * rate))
        return max(0, int(mp * random.uniform(0.04, 0.10)))

    if field == "BUFF_DMG":
        if buff_name == "curse":
            rate = random.uniform(0.08, 0.20)
            return max(0, int(atk * rate))
        if buff_name == "pray":
            rate = random.uniform(0.08, 0.22)
            return max(0, int(atk * rate))
        return max(0, int(atk * random.uniform(0.05, 0.16)))

    if field == "BUFF_CC":
        rate = random.uniform(0.05, 0.18)
        return max(0, int(cc * rate))

    if field == "BUFF_DEF":
        if buff_name == "curse":
            rate = random.uniform(0.08, 0.18)
            return max(0, int(defense * rate))
        if role == "defense":
            rate = random.uniform(0.08, 0.22)
            return max(0, int(defense * rate))
        return max(0, int(defense * random.uniform(0.05, 0.14)))

    if field == "BUFF_EV":
        rate = random.uniform(0.05, 0.16)
        return max(0, int(ev * rate))

    if field == "BUFF_AC":
        rate = random.uniform(0.05, 0.16)
        return max(0, int(ac * rate))

    return 0


def _build_skill(skill: Dict[str, Any], state: Dict[str, str], template: str) -> Dict[str, Any]:
    profile = _profile(template)
    role = _infer_role(skill)
    generated = skill.copy()

    if "BUFF_NAME" in generated and isinstance(generated["BUFF_NAME"], str):
        generated["BUFF_NAME"] = generated["BUFF_NAME"].strip().lower()

    is_passive = _truthy(skill.get("IS_PASSIVE"))
    generated["IS_PASSIVE"] = "True" if is_passive else "False"

    active_fields = ["DMG", "BUFF_HP", "BUFF_MP", "BUFF_DMG", "BUFF_CC", "BUFF_DEF", "BUFF_EV", "BUFF_AC"]
    for field in active_fields:
        if _truthy(skill.get(field)):
            generated[field] = str(_skill_numeric_value(field, skill, state, profile, role))
        else:
            generated[field] = "0"

    if is_passive:
        generated["MP_COST"] = "0"
    else:
        mp_cost_rate = random.uniform(*ROLE_MP_RANGE[role]) * profile["mp_cost"]
        actual_mp = _safe_int(state.get("MP", 0))
        generated["MP_COST"] = str(max(0, int(actual_mp * mp_cost_rate)))

    buff_time = _safe_int(skill.get("BUFF_TIME", 0))
    if buff_time <= 0 and any(_truthy(skill.get(field)) for field in active_fields):
        buff_time = 1 if generated.get("BUFF_NAME") == "stun" else random.randint(1, 3)
    generated["BUFF_TIME"] = str(buff_time)

    if generated.get("BUFF_NAME") == "stun":
        generated["IS_STUN"] = "True"
        generated["BUFF_TIME"] = str(max(1, buff_time))
    else:
        generated["IS_STUN"] = "True" if _truthy(skill.get("IS_STUN")) else "False"

    visual = _visual_type_contract(skill, state.get("TYPE"))
    generated["type_catalog"] = str(visual["type_catalog"])
    generated["type_effect"] = str(visual["type_effect"])
    if visual["buff_type_effect"]:
        generated["buff_type_effect"] = str(visual["buff_type_effect"])

    return generated


def adjust_based_on_bp(character_json: Dict[str, Any]) -> Dict[str, Any]:
    try:
        original_bp = int(character_json.get("BP", 1000))
    except (ValueError, TypeError):
        original_bp = 1000

    weights = character_json.get("state_weights") or character_json.get("state") or {}
    skills = character_json.get("skill", {})
    template = _normalize_template(character_json.get("template") or weights.get("template") or weights.get("TEMPLATE"))

    generated_state = _build_state(original_bp, weights, template)
    adjusted_skills = {}

    for skill_key, skill in skills.items():
        if isinstance(skill, dict):
            adjusted_skills[skill_key] = _build_skill(skill, generated_state, template)

    return {
        "name": str(character_json.get("name", "Unknown Hero")),
        "description": str(character_json.get("description", "")),
        "extra": str(character_json.get("extra", "")),
        "BP": str(original_bp),
        "state": generated_state,
        "skill": adjusted_skills,
    }
