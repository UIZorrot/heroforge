import random
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Literal, Protocol

from vfx_contract import CANONICAL_BUFF_NAMES, CANONICAL_INSTANT_TYPE_EFFECTS, normalize_projectile_type_effect


# Negative statuses merge into curse, positive ones into pray; burn is a fire DoT.
BUFF_ALIASES = {
    "stun": "stun",
    "frozen": "frozen",
    "poison": "poison",
    "wound": "wound",
    "burn": "burn",
    "curse": "curse",
    "corrupt": "curse",
    "weakness": "curse",
    "vulnerable": "curse",
    "heal": "heal",
    "pray": "pray",
    "bless": "pray",
    "haste": "pray",
}
SUPPORT_SKILL_ROLES = {"buff", "support", "heal", "defense", "utility"}

INSTANT_TYPE_EFFECTS = set(CANONICAL_INSTANT_TYPE_EFFECTS)
BUFF_TYPE_EFFECTS = set(CANONICAL_BUFF_NAMES)


def _character_from_hero(hero: Dict[str, Any]) -> Dict[str, Any]:
    return hero.get("character", hero)


def _visual_token(value: Any, fallback: str = "") -> str:
    text = str(value if value is not None else fallback).strip().lower().replace(" ", "_").replace("-", "_")
    return text or fallback


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
            return "strike"
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
    raw_catalog = source.get("type_catalog", source.get("typeCatalog"))
    catalog = _visual_token(raw_catalog, "") if raw_catalog is not None else _legacy_type_catalog(legacy_type)
    if catalog == "projectile":
        catalog = "proj"
    if catalog == "melee":
        catalog = "instant"
    if catalog not in {"proj", "instant"}:
        catalog = _legacy_type_catalog(legacy_type)
    raw_effect = _visual_token(source.get("type_effect", source.get("typeEffect")), "") or _legacy_type_effect(legacy_type, catalog)
    effect = normalize_projectile_type_effect(raw_effect, legacy_type) if catalog == "proj" else raw_effect
    buff_effect = _visual_token(source.get("buff_type_effect", source.get("buffTypeEffect")), "")
    return {
        "type_catalog": catalog,
        "type_effect": effect,
        "buff_type_effect": buff_effect or None,
    }


def _event_visual_contract(actor: "Battler", skill: Dict[str, Any] | None = None) -> Dict[str, str | None]:
    state = actor.character.get("state", {})
    fallback_type = state.get("TYPE") if isinstance(state, dict) else None
    source = skill if isinstance(skill, dict) else state
    visual = _visual_type_contract(source, fallback_type)
    presentation = str(source.get("VFX_PRESENTATION", source.get("vfxPresentation", "auto"))).lower()
    visual["vfx_presentation"] = "instant" if presentation == "sky" else presentation if presentation in {"instant", "direct"} else "auto"
    return visual


def _state_snapshot(unit: "Battler") -> Dict[str, Any]:
    visual = _visual_type_contract(unit.character.get("state", {}), unit.character.get("state", {}).get("TYPE"))
    return {
        "HP": unit.hp,
        "MP": unit.mp,
        "ATK": unit.atk,
        "DEF": unit.def_val,
        "CC": unit.cc,
        "SPEED": unit.spd,
        "CA": unit.base_ca,
        "PI": unit.base_pi,
        "EV": unit.ev,
        "AC": unit.ac,
        "TYPE": unit.character.get("state", {}).get("TYPE"),
        "type_catalog": visual["type_catalog"],
        "type_effect": visual["type_effect"],
    }


class Battler:
    def __init__(self, hero: Dict[str, Any], tag: str, slot_index: int | None = None):
        self.hero = hero
        self.slot_index = slot_index
        self.tag = tag if slot_index is None else f"{tag}{slot_index + 1}"
        self.character = _character_from_hero(hero)
        self.name = self.character["name"]
        state = self.character["state"]

        self.max_hp = max(1, int(state.get("HP", 0)))
        self.max_mp = max(0, int(state.get("MP", 0)))
        self.hp = self.max_hp
        self.mp = self.max_mp

        self.base_atk = max(1, int(state.get("ATK", 0)))
        self.base_def = min(80, max(0, int(state.get("DEF", 0))))
        self.base_spd = max(1, int(state.get("SPEED", 0)))
        self.base_cc = min(100, max(0, int(state.get("CC", 0))))
        self.base_ca = min(100, max(0, int(state.get("CA", 0))))
        self.base_ac = min(100, max(0, int(state.get("AC", 0))))
        self.base_ev = min(100, max(0, int(state.get("EV", 0))))
        self.base_pi = min(80, max(0, int(state.get("PI", 0))))

        self.buffs: List[Dict[str, Any]] = []

    def sum_buff(self, name: str) -> float:
        return sum(b["value"] for b in self.buffs if b["name"] == name and "effects" not in b)

    def stat_modifier(self, field: str) -> int:
        return sum(
            _safe_int(buff.get("effects", {}).get(field, 0))
            * (1 if buff["name"] in {"pray", "heal"} else -1)
            for buff in self.buffs
            if buff["name"] in {"pray", "heal", "curse", "frozen", "poison", "wound", "burn"}
            and not (field == "BUFF_DMG" and buff["name"] in {"poison", "wound", "burn"})
        )

    @property
    def atk(self):
        return max(1, self.base_atk - self.sum_buff("curse") + self.sum_buff("pray") + self.stat_modifier("BUFF_DMG"))

    @property
    def def_val(self):
        return min(80, max(0, self.base_def - self.sum_buff("curse") + self.sum_buff("pray") + self.stat_modifier("BUFF_DEF")))

    @property
    def spd(self):
        frost = sum(_safe_int(buff.get("effects", {}).get("BUFF_EV", 0)) for buff in self.buffs if buff["name"] == "frozen")
        return max(1, self.base_spd + self.sum_buff("pray") - (self.sum_buff("frozen") + frost) * 5)

    @property
    def cc(self):
        return min(100, max(0, self.base_cc + self.stat_modifier("BUFF_CC")))

    @property
    def ca(self):
        return self.base_ca

    @property
    def ac(self):
        return min(100, max(0, self.base_ac - self.sum_buff("frozen") + self.stat_modifier("BUFF_AC")))

    @property
    def ev(self):
        return min(100, max(0, self.base_ev - (self.base_ev if self.sum_buff("frozen") > 0 else 0) + self.stat_modifier("BUFF_EV")))

    @property
    def pi(self):
        return self.base_pi

    @property
    def is_stunned(self):
        return any(b["name"] == "stun" for b in self.buffs)

    def add_buff(self, name: str, duration: int, value: float, logs: List[str], effects=None):
        if not name or duration <= 0:
            return

        normalized = BUFF_ALIASES.get(str(name).strip().lower(), str(name).strip().lower())
        buff = {"name": normalized, "duration": duration, "value": value}
        if effects is not None:
            buff["effects"] = dict(effects)
        self.buffs.append(buff)

        label = normalized
        if normalized == "wound":
            label = f"wound(-{value})"
        elif normalized == "poison":
            label = f"poison(-{value})"
        elif normalized == "burn":
            label = f"burn(-{value})"
        elif normalized == "curse":
            label = f"curse(-{value})"
        elif normalized == "heal":
            label = f"heal(+{value})"
        elif normalized == "pray":
            label = f"pray(+{value})"

        logs.append(f"{self.tag} gains [{label}] for {duration} turn(s)")

    def tick_buffs(self, round_num: int, push_event_fn):
        wound_damage = self.sum_buff("wound")
        poison_damage = self.sum_buff("poison")
        burn_damage = self.sum_buff("burn")
        regen_value = self.sum_buff("heal")

        for buff in self.buffs:
            effects = buff.get("effects", {})
            hp_effect = _safe_int(effects.get("BUFF_HP", 0))
            if buff["name"] in {"wound", "poison", "burn"}:
                dot = hp_effect or _safe_int(effects.get("BUFF_DMG", 0))
                if buff["name"] == "wound":
                    wound_damage += dot
                elif buff["name"] == "poison":
                    poison_damage += dot
                else:
                    burn_damage += dot
            elif buff["name"] in {"heal", "pray"}:
                regen_value += hp_effect
            elif buff["name"] in {"curse", "frozen"}:
                poison_damage += hp_effect

            if self.hp > 0 and effects.get("BUFF_MP"):
                sign = -1 if buff["name"] in {"curse", "frozen", "wound", "poison", "burn"} else 1
                self.mp = min(self.max_mp, max(0, self.mp + sign * _safe_int(effects["BUFF_MP"])))

        if wound_damage > 0:
            dmg = int(wound_damage)
            self.hp = max(0, self.hp - dmg)
            push_event_fn(round_num, self.tag, "dot_damage", dmg, False, False, False, "wound", 0)

        if poison_damage > 0:
            dmg = int(poison_damage)
            self.hp = max(0, self.hp - dmg)
            push_event_fn(round_num, self.tag, "dot_damage", dmg, False, False, False, "poison", 0)

        if burn_damage > 0:
            dmg = int(burn_damage)
            self.hp = max(0, self.hp - dmg)
            push_event_fn(round_num, self.tag, "dot_damage", dmg, False, False, False, "burn", 0)

        if regen_value > 0 and self.hp > 0:
            heal_amt = int(regen_value)
            self.hp = min(self.max_hp, self.hp + heal_amt)
            push_event_fn(round_num, self.tag, "heal", 0, False, False, False, "heal", 0, heal_amt)

        for buff in self.buffs:
            if buff["name"] != "stun":
                buff["duration"] -= 1
        self.buffs = [buff for buff in self.buffs if buff["duration"] > 0]

    def consume_stun(self):
        for buff in self.buffs:
            if buff["name"] == "stun":
                buff["duration"] -= 1
        self.buffs = [buff for buff in self.buffs if buff["duration"] > 0]


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _skill_range(skill: Dict[str, Any] | None) -> str:
    if not isinstance(skill, dict):
        return "enemy"
    value = str(skill.get("RANGE") or skill.get("TARGET") or "enemy").strip().lower()
    return value or "enemy"


def _target_num(skill: Dict[str, Any] | None) -> int:
    if not isinstance(skill, dict):
        return 1
    return max(1, _safe_int(skill.get("TARGET_NUM", 1), 1))


def _skill_target_mode(skill: Dict[str, Any] | None) -> str:
    if not isinstance(skill, dict):
        return "enemy"
    return str(skill.get("TARGET") or "Enemy").strip().lower() or "enemy"


def _skill_role(skill: Dict[str, Any] | None) -> str:
    if not isinstance(skill, dict):
        return "attack"
    return str(skill.get("ROLE") or "attack").strip().lower() or "attack"


def _skill_damage(skill: Dict[str, Any] | None) -> int:
    return _safe_int(skill.get("DMG", 0), 0) if isinstance(skill, dict) else 0


def _is_support_skill(skill: Dict[str, Any] | None) -> bool:
    return bool(
        isinstance(skill, dict)
        and _skill_damage(skill) <= 0
        and _skill_target_mode(skill) in {"self", "ally"}
    )


def _is_passive(skill: Dict[str, Any] | None) -> bool:
    return isinstance(skill, dict) and str(skill.get("IS_PASSIVE", "")).lower() in {"true", "1"}


def _buff_value_from_skill(skill: Dict[str, Any]) -> int:
    for field in ["BUFF_HP", "BUFF_MP", "BUFF_DMG", "BUFF_CC", "BUFF_DEF", "BUFF_EV", "BUFF_AC"]:
        value = _safe_int(skill.get(field, 0), 0)
        if value != 0:
            return value
    return 0


def _unit_snapshot(unit: Battler, side: str, slot_index: int) -> Dict[str, Any]:
    skills = unit.character.get("skill", {})
    fallback_type = unit.character.get("state", {}).get("TYPE")
    return {
        "tag": unit.tag,
        "side": side,
        "slot": slot_index,
        "name": unit.name,
        "alive": unit.hp > 0,
        "hp": unit.hp,
        "maxHp": unit.max_hp,
        "mp": unit.mp,
        "maxMp": unit.max_mp,
        "buffs": [buff.copy() for buff in unit.buffs],
        "state": _state_snapshot(unit),
        "skills": {
            key: _public_skill_snapshot(skill, fallback_type)
            for key, skill in skills.items()
            if isinstance(skill, dict)
        },
    }


def _public_skill_snapshot(skill: Dict[str, Any] | None, fallback_type: Any = None) -> Dict[str, Any] | None:
    if not isinstance(skill, dict):
        return None
    visual = _visual_type_contract(skill, fallback_type)
    next_skill = skill.copy()
    next_skill["type_catalog"] = visual["type_catalog"]
    next_skill["type_effect"] = visual["type_effect"]
    if visual["buff_type_effect"]:
        next_skill["buff_type_effect"] = visual["buff_type_effect"]
    return next_skill


def _public_unit_snapshot(unit: Battler, side: str, slot_index: int) -> Dict[str, Any]:
    skills = unit.character.get("skill", {})
    fallback_type = unit.character.get("state", {}).get("TYPE")
    return {
        "tag": unit.tag,
        "side": side,
        "slot": slot_index,
        "name": unit.name,
        "alive": unit.hp > 0,
        "hp": unit.hp,
        "maxHp": unit.max_hp,
        "mp": unit.mp,
        "maxMp": unit.max_mp,
        "buffs": [buff.copy() for buff in unit.buffs],
        "state": _state_snapshot(unit),
        "skills": {
            key: _public_skill_snapshot(skill, fallback_type)
            for key, skill in skills.items()
            if isinstance(skill, dict)
        },
    }


def build_public_battle_observation(
    round_num: int,
    actor: Battler,
    allies: List[Battler],
    enemies: List[Battler],
    label_a: str,
    label_b: str,
) -> Dict[str, Any]:
    return {
        "round": round_num,
        "labels": {"a": label_a, "b": label_b},
        "actor": _public_unit_snapshot(actor, "A" if actor.tag.startswith("A") else "B", actor.slot_index or 0),
        "allies": [
            _public_unit_snapshot(unit, "A" if unit.tag.startswith("A") else "B", unit.slot_index or 0)
            for unit in allies
            if unit and unit.hp > 0
        ],
        "enemies": [
            _public_unit_snapshot(unit, "A" if unit.tag.startswith("A") else "B", unit.slot_index or 0)
            for unit in enemies
            if unit and unit.hp > 0
        ],
    }


@dataclass(frozen=True)
class BattleAction:
    kind: Literal["attack", "skill", "wait", "pass"]
    target_tag: str | None = None
    skill_slot: Literal["s1", "s2"] | None = None


class BattleController(Protocol):
    def choose_action(self, observation: Dict[str, Any]) -> BattleAction: ...


class ProgramBattleController:
    def _pick_target_tag(self, observation: Dict[str, Any], skill: Dict[str, Any] | None) -> str | None:
        actor = observation.get("actor") or {}
        allies = [unit for unit in observation.get("allies") or [] if isinstance(unit, dict) and unit.get("alive", True)]
        enemies = [unit for unit in observation.get("enemies") or [] if isinstance(unit, dict) and unit.get("alive", True)]
        actor_tag = actor.get("tag")
        actor_slot = actor.get("slot")
        target_mode = str((skill or {}).get("TARGET") or "Enemy").strip().lower()
        range_mode = _skill_range(skill)

        if target_mode == "self":
            return actor_tag
        if target_mode == "ally":
            return min(allies, key=lambda unit: _safe_int(unit.get("hp", 0)) / max(1, _safe_int(unit.get("maxHp", 1)))).get("tag") if allies else None
        if target_mode == "enemy":
            if not enemies:
                return None

            living = [unit for unit in enemies if unit.get("alive", True)]
            if not living:
                return None

            if actor_slot is None:
                return living[0].get("tag")

            same_lane = [unit for unit in living if unit.get("slot") == actor_slot]
            if range_mode == "melee":
                return same_lane[0].get("tag") if same_lane else None

            if range_mode == "ranged":
                def priority(unit: Dict[str, Any]):
                    dist = abs(_safe_int(unit.get("slot", 0), 0) - _safe_int(actor_slot, 0))
                    hp = _safe_int(unit.get("hp", 0), 0)
                    return (0 if dist <= 1 else 1, dist, hp)

                ordered = same_lane + sorted([unit for unit in living if unit.get("slot") != actor_slot], key=priority)
                return ordered[0].get("tag") if ordered else None

            def priority(unit: Dict[str, Any]):
                dist = abs(_safe_int(unit.get("slot", 0), 0) - _safe_int(actor_slot, 0))
                hp = _safe_int(unit.get("hp", 0), 0)
                return (dist, hp)

            return sorted(living, key=priority)[0].get("tag")
        return None

    def choose_action(self, observation: Dict[str, Any]) -> BattleAction:
        actor = observation.get("actor") or {}
        skills = actor.get("skills") or {}
        mp = _safe_int(actor.get("mp", 0), 0)
        actor_hp = _safe_int(actor.get("hp", 0), 0)
        actor_max_hp = max(1, _safe_int(actor.get("maxHp", 0), 0))

        available_skills = []
        for slot in ("s1", "s2"):
            skill = skills.get(slot)
            if not isinstance(skill, dict) or _is_passive(skill):
                continue
            skill_cost = _infer_skill_cost(skill)
            if mp >= skill_cost:
                target_tag = self._pick_target_tag(observation, skill)
                if target_tag is None and _skill_target_mode(skill) != "self":
                    continue
                available_skills.append((slot, skill, skill_cost, target_tag))

        if not available_skills:
            return BattleAction(kind="attack", target_tag=self._pick_target_tag(observation, {"TARGET": "Enemy", "RANGE": "enemy"}))

        support_skills = [item for item in available_skills if _is_support_skill(item[1])]
        skill_bias = 0.85
        if support_skills and actor_hp < actor_max_hp:
            skill_bias = 0.95
        elif support_skills:
            skill_bias = 0.9

        if random.random() > skill_bias:
            return BattleAction(kind="attack", target_tag=self._pick_target_tag(observation, {"TARGET": "Enemy", "RANGE": "enemy"}))

        chosen_slot, chosen_skill, _ = max(
            [(slot, skill, cost) for slot, skill, cost, _ in available_skills],
            key=lambda item: (
                _safe_int(item[1].get("DMG", 0), 0),
                _safe_int(item[1].get("BUFF_DMG", 0), 0)
                + _safe_int(item[1].get("BUFF_CC", 0), 0)
                + _safe_int(item[1].get("BUFF_DEF", 0), 0)
                + _safe_int(item[1].get("BUFF_EV", 0), 0),
                -_safe_int(item[2], 0),
            ),
        )

        if random.random() > 0.75 and len(available_skills) > 1:
            chosen_slot = random.choice([slot for slot, _, _, _ in available_skills])
            chosen_skill = skills.get(chosen_slot) or chosen_skill

        target_tag = next((target for slot, skill, _, target in available_skills if slot == chosen_slot), None)
        if target_tag is None:
            target_tag = self._pick_target_tag(observation, chosen_skill)
        return BattleAction(kind="skill", target_tag=target_tag, skill_slot=chosen_slot)


def _coerce_battle_action(action: Any) -> BattleAction:
    if isinstance(action, BattleAction):
        return action
    if isinstance(action, dict):
        kind = str(action.get("kind") or action.get("action") or "attack").strip().lower()
        if kind not in {"attack", "skill", "pass"}:
            kind = "attack"
        skill_slot = action.get("skill_slot")
        if skill_slot not in {"s1", "s2"}:
            skill_slot = None
        target_tag = action.get("target_tag")
        if target_tag is not None:
            target_tag = str(target_tag)
        return BattleAction(kind=kind, target_tag=target_tag, skill_slot=skill_slot)
    return BattleAction(kind="attack")


def _controller_mode_name(controller: BattleController | None) -> str:
    if controller is None:
        return "program"
    if isinstance(controller, ProgramBattleController):
        return "program"
    name = controller.__class__.__name__.replace("BattleController", "").replace("Controller", "")
    return name.lower() or "program"


def _choose_battle_action(
    controller: BattleController | None,
    actor: Battler,
    own_team: List[Battler],
    enemy_team: List[Battler],
    round_num: int,
    label_a: str,
    label_b: str,
) -> tuple[Dict[str, Any], BattleAction]:
    battle_controller = controller or ProgramBattleController()
    observation = build_public_battle_observation(round_num, actor, own_team, enemy_team, label_a, label_b)
    return observation, _coerce_battle_action(battle_controller.choose_action(observation))


def _board_snapshot(round_num: int, team_a: List[Battler], team_b: List[Battler], label_a: str, label_b: str) -> Dict[str, Any]:
    return {
        "round": round_num,
        "riverLabel": f"Round {round_num}",
        "topLabel": label_b,
        "bottomLabel": label_a,
        "top": [_unit_snapshot(unit, "B", index) if unit else None for index, unit in enumerate(team_b)],
        "bottom": [_unit_snapshot(unit, "A", index) if unit else None for index, unit in enumerate(team_a)],
    }


def _ordered_board_targets(
    attacker: Battler,
    allies: List[Battler],
    enemies: List[Battler],
    skill: Dict[str, Any] | None,
) -> List[Battler]:
    target_mode = str(skill.get("TARGET", "Enemy") if isinstance(skill, dict) else "Enemy").strip().lower()
    if target_mode == "self":
        return [attacker]

    pool = allies if target_mode == "ally" else enemies
    living = [unit for unit in pool if unit and unit.hp > 0]
    if not living:
        return []

    range_mode = _skill_range(skill)
    same_lane = [unit for unit in living if unit.slot_index == attacker.slot_index]

    def lane_distance(unit: Battler) -> int:
        return abs(_safe_int(unit.slot_index, 0) - _safe_int(attacker.slot_index, 0))

    def priority(unit: Battler):
        dist = lane_distance(unit)
        if range_mode == "melee":
            return (dist, unit.hp)
        if range_mode == "ranged":
            return (0 if dist <= 1 else 1, dist, unit.hp)
        return (dist, unit.hp)

    if range_mode == "melee":
        ordered = sorted([unit for unit in living if unit.slot_index == attacker.slot_index], key=priority)
    elif range_mode == "ranged":
        ordered = same_lane + sorted(
            [unit for unit in living if unit.slot_index != attacker.slot_index],
            key=priority,
        )
        ordered = [unit for unit in ordered if lane_distance(unit) <= 1]
    else:
        ordered = same_lane + sorted([unit for unit in living if unit.slot_index != attacker.slot_index], key=priority)

    if target_mode == "ally" and not ordered:
        ordered = sorted(living, key=priority)

    if not ordered and range_mode not in {"melee", "ranged"}:
        ordered = sorted(living, key=priority)

    return ordered


def _affected_targets(primary: Battler | None, candidates: List[Battler], skill: Dict[str, Any] | None) -> List[Battler]:
    """The player chooses the primary target; remaining targets follow range priority."""
    if primary is None:
        return []
    return ([primary] + [unit for unit in candidates if unit is not primary])[:_target_num(skill)]


def _resolve_skill_hit(actor: Battler, target: Battler, skill, round_num, push_event, logs, mp_cost=0, action_id=None, target_index=0, target_count=1):
    """Shared by manual sessions, automatic team combat and legacy 1v1 combat."""
    skill_damage = _skill_damage(skill)
    visual = _event_visual_contract(actor, skill)
    buff_name = str((skill or {}).get("BUFF_NAME") or "").strip().lower()
    buff_name = BUFF_ALIASES.get(buff_name, buff_name)
    event_args = {
        "action_id": action_id,
        "target_index": target_index,
        "target_count": target_count,
        "defender_tag": target.tag,
        "attacker_slot": actor.slot_index,
        "defender_slot": target.slot_index,
        "attack_type": str((skill or {}).get("TYPE") or actor.character.get("state", {}).get("TYPE") or ""),
        "buff_name": buff_name or None,
        "skill_role": _skill_role(skill),
        "range_mode": _skill_range(skill) if skill else None,
        **visual,
    }
    is_crit, damage = False, 0
    if not _is_support_skill(skill):
        hit_chance = max(0.2, min(1.5, 1 + (actor.ac - target.ev) / 100.0))
        if random.random() > hit_chance:
            push_event(round_num, actor.tag, "skill" if skill else "attack", 0, False, True, False,
                       skill.get("name") if skill else None, mp_cost, **event_args)
            return
        is_crit = random.random() < actor.cc / 100.0
        mitigation = min(0.8, max(0.0, (target.def_val - actor.pi * 0.5) / 100.0))
        damage = max(1, int((actor.atk + skill_damage) * (1 + actor.ca / 100.0 if is_crit else 1) * (1 - mitigation)))
        target.hp = max(0, target.hp - damage)

    applied_stun = False
    heal = 0
    if skill and target.hp > 0:
        duration = max(0, _safe_int(skill.get("BUFF_TIME", 0)))
        effects = {field: max(0, _safe_int(skill.get(field, 0))) for field in
                   ("BUFF_HP", "BUFF_MP", "BUFF_DMG", "BUFF_CC", "BUFF_DEF", "BUFF_EV", "BUFF_AC")}
        if buff_name == "stun" or str(skill.get("IS_STUN", "")).lower() in {"true", "1"}:
            target.add_buff("stun", max(1, duration), 0, logs)
            applied_stun = True
        if buff_name in BUFF_TYPE_EFFECTS and buff_name != "stun" and duration > 0 and any(effects.values()):
            target.add_buff(buff_name, duration, _buff_value_from_skill(skill), logs, effects=effects)
        elif not buff_name and _is_support_skill(skill):
            # Untimed support effects are immediate; named statuses tick at round start.
            heal = min(target.max_hp - target.hp, effects["BUFF_HP"])
            target.hp += heal
            target.mp = min(target.max_mp, target.mp + effects["BUFF_MP"])
            stat_effects = {key: value for key, value in effects.items() if key not in {"BUFF_HP", "BUFF_MP"}}
            if any(stat_effects.values()):
                target.add_buff("pray", max(1, duration), _buff_value_from_skill(skill), logs, effects=stat_effects)

    push_event(round_num, actor.tag, "skill" if skill else "attack", damage, is_crit, False, applied_stun,
               skill.get("name") if skill else None, mp_cost, heal, **event_args)


def _apply_opening_passives(team_a, team_b, round_num, push_event, logs):
    # Opening passives fire once, without using a turn or MP. Their statuses have
    # the same duration as active skills and start ticking on the following round.
    for own, enemy in ((team_a, team_b), (team_b, team_a)):
        for actor in own:
            if not actor or actor.hp <= 0:
                continue
            for skill_slot, skill in actor.character.get("skill", {}).items():
                if not _is_passive(skill):
                    continue
                targets = _ordered_board_targets(actor, own, enemy, skill)
                affected = targets[:_target_num(skill)]
                for index, target in enumerate(affected):
                    _resolve_skill_hit(actor, target, skill, round_num, push_event, logs,
                                       action_id=f"opening:{actor.tag}:{skill_slot}",
                                       target_index=index, target_count=len(affected))


def _alive_total(team: List[Battler]) -> int:
    return sum(max(0, unit.hp) for unit in team if unit)


def _alive_count(team: List[Battler]) -> int:
    return sum(1 for unit in team if unit and unit.hp > 0)


def _flatten_buffs(team: List[Battler]) -> List[Dict[str, Any]]:
    buffs: List[Dict[str, Any]] = []
    for unit in team:
        if not unit:
            continue
        for buff in unit.buffs:
            buffs.append(buff.copy())
    return buffs


def _run_board_duel(
    team_a: List[Dict[str, Any]],
    team_b: List[Dict[str, Any]],
    label_a: str,
    label_b: str,
    lanes: int,
    controller: BattleController | None = None,
    control_mode: str | None = None,
):
    team_a_units = [Battler(hero, "A", index) for index, hero in enumerate(team_a[:lanes])]
    team_b_units = [Battler(hero, "B", index) for index, hero in enumerate(team_b[:lanes])]
    battle_controller = controller or ProgramBattleController()
    control_mode = control_mode or _controller_mode_name(controller)

    while len(team_a_units) < lanes:
        team_a_units.append(None)
    while len(team_b_units) < lanes:
        team_b_units.append(None)

    events: List[Dict[str, Any]] = []
    logs: List[str] = []
    max_rounds = 30
    board_history: List[Dict[str, Any]] = [_board_snapshot(1, team_a_units, team_b_units, label_a, label_b)]

    def push_event(
        round_num,
        attacker_tag,
        action_type,
        damage,
        is_crit,
        is_miss,
        is_stunned,
        skill_name=None,
        mp_cost_applied=0,
        heal=0,
        defender_tag=None,
        attacker_slot=None,
        defender_slot=None,
        attack_type=None,
        buff_name=None,
        skill_role=None,
        range_mode=None,
        type_catalog=None,
        type_effect=None,
        buff_type_effect=None,
        vfx_presentation=None,
        action_id=None,
        target_index=0,
        target_count=1,
    ):
        if defender_tag is None:
            attacker_side = str(attacker_tag)[0] if str(attacker_tag) else "A"
            defender_tag = "B" if attacker_side == "A" else "A"

        if action_type == "dot_damage":
            log = f"[Round {round_num}] {attacker_tag} suffers {damage} damage over time"
        elif action_type == "heal":
            log = f"[Round {round_num}] {attacker_tag} heals {heal} HP"
        elif action_type == "stunned":
            log = f"[Round {round_num}] {attacker_tag} is stunned and cannot act"
        else:
            skill_label = f"[{skill_name}]" if skill_name else "[Attack]"
            crit_text = " crit" if is_crit else ""
            miss_text = " miss" if is_miss else ""
            log = f"[Round {round_num}] {attacker_tag} uses {skill_label} on {defender_tag} for {damage} damage{crit_text}{miss_text}"

        logs.append(log)
        events.append({
            "round": round_num,
            "vfxPresentation": vfx_presentation,
            "actionId": action_id,
            "targetIndex": target_index,
            "targetCount": target_count,
            "attacker": attacker_tag,
            "defender": defender_tag,
            "attackerSlot": attacker_slot,
            "defenderSlot": defender_slot,
            "actionType": action_type,
            "skillName": skill_name,
            "attackType": attack_type,
            "typeCatalog": type_catalog,
            "typeEffect": type_effect,
            "buffTypeEffect": buff_type_effect,
            "type_catalog": type_catalog,
            "type_effect": type_effect,
            "buff_type_effect": buff_type_effect,
            "buffName": buff_name,
            "skillRole": skill_role,
            "rangeMode": range_mode,
            "damage": damage,
            "heal": heal,
            "isCrit": is_crit,
            "isMiss": is_miss,
            "isStunned": is_stunned,
            "hpA": _alive_total(team_a_units),
            "hpB": _alive_total(team_b_units),
            "mpA": sum(max(0, unit.mp) for unit in team_a_units if unit),
            "mpB": sum(max(0, unit.mp) for unit in team_b_units if unit),
            "maxHpA": sum(unit.max_hp for unit in team_a_units if unit),
            "maxHpB": sum(unit.max_hp for unit in team_b_units if unit),
            "maxMpA": sum(unit.max_mp for unit in team_a_units if unit),
            "maxMpB": sum(unit.max_mp for unit in team_b_units if unit),
            "buffsA": _flatten_buffs(team_a_units),
            "buffsB": _flatten_buffs(team_b_units),
            "mpCostApplied": mp_cost_applied,
            "log": log,
            "timestamp": int(time.time() * 1000),
        })
        board_history.append(_board_snapshot(round_num, team_a_units, team_b_units, label_a, label_b))

    def apply_skill(actor: Battler, enemy_team: List[Battler], round_num: int):
        if actor.is_stunned:
            push_event(
                round_num,
                actor.tag,
                "stunned",
                0,
                False,
                False,
                False,
                defender_tag=actor.tag,
                attacker_slot=actor.slot_index,
                attack_type=actor.character.get("state", {}).get("TYPE"),
                **_event_visual_contract(actor),
            )
            actor.consume_stun()
            return

        own_team = team_a_units if actor.tag.startswith("A") else team_b_units
        observation, action = _choose_battle_action(battle_controller, actor, own_team, enemy_team, round_num, label_a, label_b)
        chosen_skill = None
        if action.kind == "skill" and action.skill_slot:
            skills = actor.character.get("skill", {})
            if isinstance(skills, dict):
                chosen_skill = skills.get(action.skill_slot)
        if action.kind == "skill" and not isinstance(chosen_skill, dict):
            chosen_skill = _pick_skill(actor, round_num)
        if action.kind != "skill":
            chosen_skill = None

        skill_cost = _infer_skill_cost(chosen_skill) if chosen_skill else 0
        if chosen_skill and (_is_passive(chosen_skill) or actor.mp < skill_cost):
            chosen_skill = None
            skill_cost = 0

        actor.mp = max(0, actor.mp - skill_cost)

        targets = _ordered_board_targets(actor, own_team, enemy_team, chosen_skill)
        target = None
        if action.target_tag:
            for candidate in targets:
                if candidate.tag == action.target_tag:
                    target = candidate
                    break
        if target is None and targets:
            target = targets[0]

        if not target:
            push_event(
                round_num,
                actor.tag,
                "attack" if not chosen_skill else "skill",
                0,
                False,
                True,
                False,
                chosen_skill.get("name") if chosen_skill else None,
                skill_cost,
                defender_tag="-",
                attacker_slot=actor.slot_index,
            )
            return

        affected_targets = _affected_targets(target, targets, chosen_skill)
        action_id = f"cast:{len(events)}"
        for index, affected in enumerate(affected_targets):
            _resolve_skill_hit(actor, affected, chosen_skill, round_num, push_event, logs,
                               skill_cost if index == 0 else 0, action_id, index, len(affected_targets))

    _apply_opening_passives(team_a_units, team_b_units, 1, push_event, logs)

    for round_num in range(1, max_rounds + 1):
        if _alive_total(team_a_units) <= 0 or _alive_total(team_b_units) <= 0:
            break

        for unit in team_a_units + team_b_units:
            if round_num > 1 and unit and unit.hp > 0:
                unit.tick_buffs(round_num, push_event)

        if _alive_total(team_a_units) <= 0 or _alive_total(team_b_units) <= 0:
            board_history[-1] = _board_snapshot(round_num, team_a_units, team_b_units, label_a, label_b)
            break

        turn_order = [unit for unit in team_a_units + team_b_units if unit and unit.hp > 0]
        random.shuffle(turn_order)
        turn_order.sort(key=lambda unit: unit.spd, reverse=True)

        for actor in turn_order:
            if actor.hp <= 0:
                continue
            own_team = team_a_units if actor.tag.startswith("A") else team_b_units
            enemy_team = team_b_units if actor.tag.startswith("A") else team_a_units
            apply_skill(actor, enemy_team, round_num)
            if _alive_total(team_a_units) <= 0 or _alive_total(team_b_units) <= 0:
                break

        board_history[-1] = _board_snapshot(round_num, team_a_units, team_b_units, label_a, label_b)

    total_a = _alive_total(team_a_units)
    total_b = _alive_total(team_b_units)
    alive_a = _alive_count(team_a_units)
    alive_b = _alive_count(team_b_units)

    if total_a == total_b:
        winner_label = "Tie"
        winner_name = "Tie"
    elif total_a > total_b:
        winner_label = label_a
        winner_name = label_a
    else:
        winner_label = label_b
        winner_name = label_b

    logs.append(f"Battle finished. Winner: {winner_name}")

    final_board = board_history[-1] if board_history else _board_snapshot(0, team_a_units, team_b_units, label_a, label_b)

    return {
        "winner": winner_name,
        "winnerLabel": winner_label,
        "controlMode": control_mode,
        "logs": logs,
        "events": events,
        "finalHpA": total_a,
        "finalHpB": total_b,
        "maxHpA": sum(unit.max_hp for unit in team_a_units if unit),
        "maxHpB": sum(unit.max_hp for unit in team_b_units if unit),
        "maxMpA": sum(unit.max_mp for unit in team_a_units if unit),
        "maxMpB": sum(unit.max_mp for unit in team_b_units if unit),
        "board": final_board,
        "boardHistory": board_history,
        "aliveA": alive_a,
        "aliveB": alive_b,
    }


def _target_for_skill(atk: Battler, defen: Battler, skill: Dict[str, Any]) -> Battler:
    target = str(skill.get("TARGET", "Enemy")).strip().lower()
    if target in {"self", "ally"}:
        return atk
    return defen


def _infer_skill_cost(skill: Dict[str, Any]) -> int:
    try:
        return max(0, int(skill.get("MP_COST", 0)))
    except (TypeError, ValueError):
        return 0


def _pick_skill(atk: Battler, round_num: int) -> Dict[str, Any] | None:
    skills = atk.character.get("skill", {})
    if not isinstance(skills, dict):
        return None

    ordered_skills = [skill for _, skill in sorted(skills.items()) if isinstance(skill, dict) and not _is_passive(skill)]
    if not ordered_skills:
        return None

    s1 = skills.get("s1") if isinstance(skills.get("s1"), dict) and not _is_passive(skills["s1"]) else ordered_skills[0]
    s2 = skills.get("s2") if isinstance(skills.get("s2"), dict) and not _is_passive(skills["s2"]) else (ordered_skills[1] if len(ordered_skills) > 1 else None)
    planned = s1 if round_num % 4 != 0 else s2
    return planned or s1 or ordered_skills[0]


def _skill_slot_for_choice(atk: Battler, skill: Dict[str, Any] | None) -> str | None:
    if not isinstance(skill, dict):
        return None
    skills = atk.character.get("skill", {})
    if not isinstance(skills, dict):
        return None
    for slot, candidate in skills.items():
        if candidate == skill:
            return slot
    return None


def run_auto_duel(
    hero_a: Dict[str, Any],
    hero_b: Dict[str, Any],
    label_a: str = "A",
    label_b: str = "B",
    controller: BattleController | None = None,
    control_mode: str | None = None,
):
    p_a = Battler(hero_a, "A")
    p_b = Battler(hero_b, "B")
    battle_controller = controller or ProgramBattleController()
    control_mode = control_mode or _controller_mode_name(controller)

    events = []
    logs = []
    max_rounds = 30

    def push_event(
        round_num,
        attacker_tag,
        action_type,
        damage,
        is_crit,
        is_miss,
        is_stunned,
        skill_name=None,
        mp_cost_applied=0,
        heal=0,
        attack_type=None,
        buff_name=None,
        skill_role=None,
        range_mode=None,
        defender_tag=None,
        type_catalog=None,
        type_effect=None,
        buff_type_effect=None,
        vfx_presentation=None,
        action_id=None,
        target_index=0,
        target_count=1,
        attacker_slot=None,
        defender_slot=None,
    ):
        defender_tag = defender_tag or ("B" if attacker_tag == "A" else "A")

        if action_type == "dot_damage":
            log = f"[Round {round_num}] {attacker_tag} suffers {damage} damage over time"
        elif action_type == "heal":
            log = f"[Round {round_num}] {attacker_tag} heals {heal} HP"
        elif action_type == "stunned":
            log = f"[Round {round_num}] {attacker_tag} is stunned and cannot act"
        else:
            skill_label = f"[{skill_name}]" if skill_name else "[Attack]"
            crit_text = " crit" if is_crit else ""
            miss_text = " miss" if is_miss else ""
            log = f"[Round {round_num}] {attacker_tag} uses {skill_label} on {defender_tag} for {damage} damage{crit_text}{miss_text}"

        logs.append(log)
        events.append({
            "round": round_num,
            "vfxPresentation": vfx_presentation,
            "actionId": action_id,
            "targetIndex": target_index,
            "targetCount": target_count,
            "attacker": attacker_tag,
            "defender": defender_tag,
            "attackerSlot": attacker_slot,
            "defenderSlot": defender_slot,
            "actionType": action_type,
            "skillName": skill_name,
            "attackType": attack_type,
            "typeCatalog": type_catalog,
            "typeEffect": type_effect,
            "buffTypeEffect": buff_type_effect,
            "type_catalog": type_catalog,
            "type_effect": type_effect,
            "buff_type_effect": buff_type_effect,
            "buffName": buff_name,
            "skillRole": skill_role,
            "rangeMode": range_mode,
            "damage": damage,
            "heal": heal,
            "isCrit": is_crit,
            "isMiss": is_miss,
            "isStunned": is_stunned,
            "hpA": p_a.hp,
            "hpB": p_b.hp,
            "mpA": p_a.mp,
            "mpB": p_b.mp,
            "maxHpA": p_a.max_hp,
            "maxHpB": p_b.max_hp,
            "maxMpA": p_a.max_mp,
            "maxMpB": p_b.max_mp,
            "buffsA": [buff.copy() for buff in p_a.buffs],
            "buffsB": [buff.copy() for buff in p_b.buffs],
            "mpCostApplied": mp_cost_applied,
            "log": log,
            "timestamp": int(time.time() * 1000),
        })

    def perform_attack(atk: Battler, defen: Battler, round_num: int):
        if atk.is_stunned:
            push_event(round_num, atk.tag, "stunned", 0, False, False, False, **_event_visual_contract(atk))
            atk.consume_stun()
            return

        observation, action = _choose_battle_action(battle_controller, atk, [atk], [defen], round_num, label_a, label_b)
        chosen_skill = None
        if action.kind == "skill" and action.skill_slot:
            skills = atk.character.get("skill", {})
            if isinstance(skills, dict):
                chosen_skill = skills.get(action.skill_slot)
        if action.kind == "skill" and not isinstance(chosen_skill, dict):
            chosen_skill = _pick_skill(atk, round_num)
            action = BattleAction(kind="skill", target_tag=action.target_tag, skill_slot=_skill_slot_for_choice(atk, chosen_skill))
        if action.kind != "skill":
            chosen_skill = None

        skill_cost = _infer_skill_cost(chosen_skill) if chosen_skill else 0
        if chosen_skill and (_is_passive(chosen_skill) or atk.mp < skill_cost):
            chosen_skill = None
            skill_cost = 0

        atk.mp = max(0, atk.mp - skill_cost)

        target = _target_for_skill(atk, defen, chosen_skill) if chosen_skill else defen
        _resolve_skill_hit(atk, target, chosen_skill, round_num, push_event, logs, skill_cost)

    _apply_opening_passives([p_a], [p_b], 1, push_event, logs)

    for round_num in range(1, max_rounds + 1):
        if p_a.hp <= 0 or p_b.hp <= 0:
            break

        if round_num > 1:
            p_a.tick_buffs(round_num, push_event)
        if p_a.hp <= 0:
            break

        if round_num > 1:
            p_b.tick_buffs(round_num, push_event)
        if p_b.hp <= 0:
            break

        first_a = random.random() > 0.5 if p_a.spd == p_b.spd else p_a.spd > p_b.spd
        if first_a:
            perform_attack(p_a, p_b, round_num)
            if p_b.hp > 0:
                perform_attack(p_b, p_a, round_num)
        else:
            perform_attack(p_b, p_a, round_num)
            if p_a.hp > 0:
                perform_attack(p_a, p_b, round_num)

    if p_a.hp == p_b.hp:
        winner_name = "Tie"
    elif p_a.hp > p_b.hp:
        winner_name = p_a.name
    else:
        winner_name = p_b.name

    winner_label = label_a if winner_name == p_a.name else (label_b if winner_name == p_b.name else "Tie")
    logs.append(f"Battle finished. Winner: {winner_name}")

    return {
        "winner": winner_name,
        "winnerLabel": winner_label,
        "controlMode": control_mode,
        "logs": logs,
        "events": events,
        "finalHpA": p_a.hp,
        "finalHpB": p_b.hp,
        "maxHpA": p_a.max_hp,
        "maxHpB": p_b.max_hp,
        "maxMpA": p_a.max_mp,
        "maxMpB": p_b.max_mp,
    }


def run_team_duel(
    team_a: List[Dict[str, Any]],
    team_b: List[Dict[str, Any]],
    size: str,
    label_a: str,
    label_b: str,
    controller: BattleController | None = None,
    control_mode: str | None = None,
):
    if size == "1v1":
        result = run_auto_duel(team_a[0], team_b[0], label_a, label_b, controller=controller, control_mode=control_mode)
        return {
            "winnerLabel": result["winnerLabel"],
            "controlMode": result["controlMode"],
            "summary": f"{label_a} vs {label_b} ({size}) winner: {result['winnerLabel']}",
            "logs": result["logs"],
            "events": result["events"],
            "details": result,
        }

    if size == "pve_4v6" and (not team_a or not team_b or len(team_a) > 4 or len(team_b) > 6):
        raise ValueError("pve_4v6 requires 1-4 player units and 1-6 enemies")
    lanes = 6 if size in {"arena_2x3", "pve_4v6"} else 4 if size == "4v4" else 3
    result = _run_board_duel(team_a, team_b, label_a, label_b, lanes, controller=controller, control_mode=control_mode)
    return {
        "winner": result["winner"],
        "winnerLabel": result["winnerLabel"],
        "controlMode": result["controlMode"],
        "summary": f"{label_a} vs {label_b} ({size}) winner: {result['winnerLabel']}",
        "logs": result["logs"],
        "events": result["events"],
        "details": result,
        "board": result["board"],
        "boardHistory": result["boardHistory"],
        "finalHpA": result["finalHpA"],
        "finalHpB": result["finalHpB"],
        "maxHpA": result["maxHpA"],
        "maxHpB": result["maxHpB"],
        "maxMpA": result["maxMpA"],
        "maxMpB": result["maxMpB"],
    }
