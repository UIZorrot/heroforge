import random
import time
from typing import Any, Dict, List


BUFF_ALIASES = {
    "weakness": "weakness",
    "wound": "wound",
    "curse": "curse",
    "stun": "stun",
    "bless": "bless",
    "heal": "heal",
    "frozen": "frozen",
    "poison": "wound",
    "corrupt": "curse",
    "haste": "haste",
    "pray": "pray",
    "vulnerable": "weakness",
}


def _character_from_hero(hero: Dict[str, Any]) -> Dict[str, Any]:
    return hero.get("character", hero)


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
        return sum(b["value"] for b in self.buffs if b["name"] == name)

    @property
    def atk(self):
        return max(1, self.base_atk - self.sum_buff("weakness") + self.sum_buff("bless") + self.sum_buff("pray"))

    @property
    def def_val(self):
        return max(0, self.base_def - self.sum_buff("curse") - self.sum_buff("corrupt") + self.sum_buff("pray"))

    @property
    def spd(self):
        return max(1, self.base_spd + self.sum_buff("haste") + self.sum_buff("pray") - self.sum_buff("frozen") * 5)

    @property
    def cc(self):
        return min(100, max(0, self.base_cc + self.sum_buff("haste") * 0.5))

    @property
    def ca(self):
        return self.base_ca

    @property
    def ac(self):
        return max(0, self.base_ac + self.sum_buff("haste") - self.sum_buff("frozen"))

    @property
    def ev(self):
        return max(0, self.base_ev - (self.base_ev if self.sum_buff("frozen") > 0 else 0))

    @property
    def pi(self):
        return self.base_pi

    @property
    def is_stunned(self):
        return any(b["name"] == "stun" for b in self.buffs)

    def add_buff(self, name: str, duration: int, value: float, logs: List[str]):
        if not name or duration <= 0:
            return

        normalized = BUFF_ALIASES.get(str(name).strip().lower(), str(name).strip().lower())
        self.buffs.append({"name": normalized, "duration": duration, "value": value})

        label = normalized
        if normalized == "stun":
            label = "stun"
        elif normalized == "wound":
            label = f"wound(-{value})"
        elif normalized == "curse":
            label = f"curse(-{value})"
        elif normalized == "weakness":
            label = f"weakness(-{value})"
        elif normalized == "frozen":
            label = "frozen"
        elif normalized == "bless":
            label = f"bless(+{value})"
        elif normalized == "heal":
            label = f"heal(+{value})"
        elif normalized == "haste":
            label = "haste"
        elif normalized == "pray":
            label = "pray"

        logs.append(f"{self.tag} gains [{label}] for {duration} turn(s)")

    def tick_buffs(self, round_num: int, push_event_fn):
        dot_damage = self.sum_buff("wound") + self.sum_buff("poison")
        regen_value = self.sum_buff("heal")

        if dot_damage > 0:
            dmg = int(dot_damage)
            self.hp = max(0, self.hp - dmg)
            push_event_fn(round_num, self.tag, "dot_damage", dmg, False, False, False, "wound", 0)

        if regen_value > 0 and self.hp > 0:
            heal_amt = int(regen_value)
            self.hp = min(self.max_hp, self.hp + heal_amt)
            push_event_fn(round_num, self.tag, "heal", 0, False, False, False, "heal", 0, heal_amt)

        for buff in self.buffs:
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


def _unit_snapshot(unit: Battler, side: str, slot_index: int) -> Dict[str, Any]:
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
        "state": {
            "HP": unit.hp,
            "MP": unit.mp,
            "ATK": unit.base_atk,
            "DEF": unit.base_def,
            "CC": unit.base_cc,
            "SPEED": unit.base_spd,
            "CA": unit.base_ca,
            "PI": unit.base_pi,
            "EV": unit.base_ev,
            "AC": unit.base_ac,
        },
    }


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
    living = [unit for unit in pool if unit and unit.hp > 0 and unit is not attacker]
    if not living:
        return []

    range_mode = _skill_range(skill)
    same_lane = [unit for unit in living if unit.slot_index == attacker.slot_index]

    def lane_distance(unit: Battler) -> int:
        return abs(unit.slot_index - attacker.slot_index)

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

    limit = _target_num(skill)
    return ordered[:limit]


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


def _run_board_duel(team_a: List[Dict[str, Any]], team_b: List[Dict[str, Any]], label_a: str, label_b: str, lanes: int):
    team_a_units = [Battler(hero, "A", index) for index, hero in enumerate(team_a[:lanes])]
    team_b_units = [Battler(hero, "B", index) for index, hero in enumerate(team_b[:lanes])]

    while len(team_a_units) < lanes:
        team_a_units.append(None)
    while len(team_b_units) < lanes:
        team_b_units.append(None)

    events: List[Dict[str, Any]] = []
    logs: List[str] = []
    max_rounds = 30
    board_history: List[Dict[str, Any]] = []

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
            "attacker": attacker_tag,
            "defender": defender_tag,
            "attackerSlot": attacker_slot,
            "defenderSlot": defender_slot,
            "actionType": action_type,
            "skillName": skill_name,
            "attackType": attack_type,
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
            )
            return

        chosen_skill = _pick_skill(actor, round_num)
        skill_cost = _infer_skill_cost(chosen_skill) if chosen_skill else 0
        if chosen_skill and actor.mp < skill_cost:
            chosen_skill = None
            skill_cost = 0

        actor.mp = max(0, actor.mp - skill_cost)

        own_team = team_a_units if actor.tag.startswith("A") else team_b_units
        targets = _ordered_board_targets(actor, own_team, enemy_team, chosen_skill)
        if not targets:
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

        skill_damage = _safe_int(chosen_skill.get("DMG", 0), 0) if chosen_skill else 0
        attack_type = str((chosen_skill or {}).get("TYPE") or actor.character.get("state", {}).get("TYPE") or "").strip()
        buff_name = str((chosen_skill or {}).get("BUFF_NAME") or "").strip().lower()
        skill_role = str((chosen_skill or {}).get("ROLE") or "").strip().lower()
        range_mode = _skill_range(chosen_skill) if chosen_skill else None
        target = targets[0]
        hit_chance = max(0.2, min(1.5, 1 + (actor.ac - target.ev) / 100.0))

        if random.random() > hit_chance:
            push_event(
                round_num,
                actor.tag,
                "skill" if chosen_skill else "attack",
                0,
                False,
                True,
                False,
                chosen_skill.get("name") if chosen_skill else None,
                skill_cost,
                defender_tag=target.tag,
                attacker_slot=actor.slot_index,
                defender_slot=target.slot_index,
                attack_type=attack_type,
                buff_name=buff_name or None,
                skill_role=skill_role or None,
                range_mode=range_mode,
            )
            return

        is_crit = random.random() < actor.cc / 100.0
        crit_multiplier = 1 + actor.ca / 100.0 if is_crit else 1.0
        mitigation = max(0.0, (target.def_val - actor.pi * 0.5) / 100.0)

        raw_damage = (actor.atk + skill_damage) * crit_multiplier
        final_damage = max(1, int(raw_damage * (1.0 - mitigation)))
        target.hp = max(0, target.hp - final_damage)

        applied_stun = False
        if chosen_skill:
            buff_name = str(chosen_skill.get("BUFF_NAME", "")).strip().lower()
            duration = max(0, _safe_int(chosen_skill.get("BUFF_TIME", 0), 0))

            if buff_name == "stun" or str(chosen_skill.get("IS_STUN", "")).lower() == "true":
                target.add_buff("stun", max(1, duration or 1), 0, logs)
                applied_stun = True

            buff_value = 0
            for field in ["BUFF_HP", "BUFF_MP", "BUFF_DMG", "BUFF_CC", "BUFF_DEF", "BUFF_EV", "BUFF_AC"]:
                value = _safe_int(chosen_skill.get(field, 0), 0)
                if value != 0:
                    buff_value = value
                    break

            if buff_name and duration > 0 and buff_value != 0:
                target.add_buff(buff_name, duration, buff_value, logs)

        push_event(
            round_num,
            actor.tag,
            "skill" if chosen_skill else "attack",
            final_damage,
            is_crit,
            False,
            applied_stun,
            chosen_skill.get("name") if chosen_skill else None,
            skill_cost,
            defender_tag=target.tag,
            attacker_slot=actor.slot_index,
            defender_slot=target.slot_index,
            attack_type=attack_type,
            buff_name=buff_name or None,
            skill_role=skill_role or None,
            range_mode=range_mode,
        )

    for round_num in range(1, max_rounds + 1):
        if _alive_total(team_a_units) <= 0 or _alive_total(team_b_units) <= 0:
            break

        for unit in team_a_units + team_b_units:
            if unit and unit.hp > 0:
                unit.tick_buffs(round_num, push_event)

        if _alive_total(team_a_units) <= 0 or _alive_total(team_b_units) <= 0:
            board_history.append(_board_snapshot(round_num, team_a_units, team_b_units, label_a, label_b))
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

        board_history.append(_board_snapshot(round_num, team_a_units, team_b_units, label_a, label_b))

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

    s1 = skills.get("s1")
    s2 = skills.get("s2")
    planned = s1 if round_num % 4 != 0 else s2
    return planned or s1 or s2


def run_auto_duel(hero_a: Dict[str, Any], hero_b: Dict[str, Any], label_a: str = "A", label_b: str = "B"):
    p_a = Battler(hero_a, "A")
    p_b = Battler(hero_b, "B")

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
    ):
        defender_tag = "B" if attacker_tag == "A" else "A"

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
            "attacker": attacker_tag,
            "defender": defender_tag,
            "actionType": action_type,
            "skillName": skill_name,
            "attackType": attack_type,
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
            push_event(round_num, atk.tag, "stunned", 0, False, False, False)
            return

        chosen_skill = _pick_skill(atk, round_num)
        skill_cost = _infer_skill_cost(chosen_skill) if chosen_skill else 0
        if chosen_skill and atk.mp < skill_cost:
            chosen_skill = None
            skill_cost = 0

        atk.mp = max(0, atk.mp - skill_cost)

        skill_damage = int(chosen_skill.get("DMG", 0)) if chosen_skill else 0
        attack_type = str((chosen_skill or {}).get("TYPE") or atk.character.get("state", {}).get("TYPE") or "").strip()
        buff_name = str((chosen_skill or {}).get("BUFF_NAME") or "").strip().lower()
        skill_role = str((chosen_skill or {}).get("ROLE") or "").strip().lower()
        range_mode = _skill_range(chosen_skill) if chosen_skill else None
        hit_chance = max(0.2, min(1.5, 1 + (atk.ac - defen.ev) / 100.0))

        if random.random() > hit_chance:
            push_event(
                round_num,
                atk.tag,
                "skill" if chosen_skill else "attack",
                0,
                False,
                True,
                False,
                chosen_skill.get("name") if chosen_skill else None,
                skill_cost,
            )
            return

        is_crit = random.random() < atk.cc / 100.0
        crit_multiplier = 1 + atk.ca / 100.0 if is_crit else 1.0
        mitigation = max(0.0, (defen.def_val - atk.pi * 0.5) / 100.0)

        raw_damage = (atk.atk + skill_damage) * crit_multiplier
        final_damage = max(1, int(raw_damage * (1.0 - mitigation)))
        defen.hp = max(0, defen.hp - final_damage)

        applied_stun = False
        if chosen_skill:
            target = _target_for_skill(atk, defen, chosen_skill)
            buff_name = str(chosen_skill.get("BUFF_NAME", "")).strip().lower()
            duration = max(0, int(chosen_skill.get("BUFF_TIME", 0)))

            if buff_name == "stun" or str(chosen_skill.get("IS_STUN", "")).lower() == "true":
                target.add_buff("stun", max(1, duration or 1), 0, logs)
                applied_stun = True

            buff_value = 0
            for field in ["BUFF_HP", "BUFF_MP", "BUFF_DMG", "BUFF_CC", "BUFF_DEF", "BUFF_EV", "BUFF_AC"]:
                try:
                    value = int(chosen_skill.get(field, 0))
                except (TypeError, ValueError):
                    value = 0
                if value != 0:
                    buff_value = value
                    break

            if buff_name and duration > 0 and buff_value != 0:
                target.add_buff(buff_name, duration, buff_value, logs)

        push_event(
            round_num,
            atk.tag,
            "skill" if chosen_skill else "attack",
            final_damage,
            is_crit,
            False,
            applied_stun,
            chosen_skill.get("name") if chosen_skill else None,
            skill_cost,
            attack_type=attack_type,
            buff_name=buff_name or None,
            skill_role=skill_role or None,
            range_mode=range_mode,
        )

    for round_num in range(1, max_rounds + 1):
        if p_a.hp <= 0 or p_b.hp <= 0:
            break

        p_a.tick_buffs(round_num, push_event)
        if p_a.hp <= 0:
            break

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
        "logs": logs,
        "events": events,
        "finalHpA": p_a.hp,
        "finalHpB": p_b.hp,
        "maxHpA": p_a.max_hp,
        "maxHpB": p_b.max_hp,
        "maxMpA": p_a.max_mp,
        "maxMpB": p_b.max_mp,
    }


def run_team_duel(team_a: List[Dict[str, Any]], team_b: List[Dict[str, Any]], size: str, label_a: str, label_b: str):
    if size == "1v1":
        result = run_auto_duel(team_a[0], team_b[0], label_a, label_b)
        return {
            "winnerLabel": result["winnerLabel"],
            "summary": f"{label_a} vs {label_b} ({size}) winner: {result['winnerLabel']}",
            "logs": result["logs"],
            "events": result["events"],
            "details": result,
        }

    lanes = 4 if size == "4v4" else 3
    result = _run_board_duel(team_a, team_b, label_a, label_b, lanes)
    return {
        "winner": result["winner"],
        "winnerLabel": result["winnerLabel"],
        "summary": f"{label_a} vs {label_b} ({size}) winner: {result['winnerLabel']}",
        "logs": result["logs"],
        "events": result["events"],
        "details": result,
        "board": result["board"],
        "finalHpA": result["finalHpA"],
        "finalHpB": result["finalHpB"],
        "maxHpA": result["maxHpA"],
        "maxHpB": result["maxHpB"],
        "maxMpA": result["maxMpA"],
        "maxMpB": result["maxMpB"],
    }
