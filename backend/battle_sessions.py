from __future__ import annotations

import os
import random
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import battle_logic


DEFAULT_WAIT_SECONDS = int(os.getenv("BATTLE_SESSION_WAIT_SECONDS", "30"))
SWEEP_INTERVAL_SECONDS = float(os.getenv("BATTLE_SESSION_SWEEP_INTERVAL_SECONDS", "1"))


class BattleSessionError(ValueError):
    pass


def _now_ms() -> int:
    return int(time.time() * 1000)


def _lanes_for_mode(battle_mode: str) -> int:
    if battle_mode in {"arena_2x3", "pve_4v6"}:
        return 6
    return 4 if battle_mode == "4v4" else 1


def _normalize_action(action: Dict[str, Any] | None) -> Dict[str, Any]:
    if not isinstance(action, dict):
        raise BattleSessionError("action is required")
    kind = str(action.get("kind") or "attack").strip().lower()
    if kind not in {"attack", "skill", "wait"}:
        raise BattleSessionError("unsupported action kind")
    target_tag = action.get("targetTag")
    skill_slot = action.get("skillSlot")
    actor_tag = action.get("actorTag")
    return {
        "kind": kind,
        "targetTag": str(target_tag).strip() if target_tag is not None else None,
        "skillSlot": str(skill_slot).strip() if skill_slot is not None else None,
        "actorTag": str(actor_tag).strip() if actor_tag is not None else None,
    }


def _team_units(team: List[battle_logic.Battler | None]) -> List[battle_logic.Battler]:
    return [unit for unit in team if unit and unit.hp > 0]


def _team_lookup(team: List[battle_logic.Battler | None], tag: str) -> battle_logic.Battler | None:
    for unit in team:
        if unit and unit.tag == tag:
            return unit
    return None


@dataclass
class BattleSession:
    session_id: str
    battle_mode: str
    control_mode: str
    label_a: str
    label_b: str
    team_a_payload: List[Dict[str, Any]]
    team_b_payload: List[Dict[str, Any]]
    wait_seconds: int = DEFAULT_WAIT_SECONDS
    created_at_ms: int = field(default_factory=_now_ms)
    updated_at_ms: int = field(default_factory=_now_ms)
    status: str = "awaiting_action"
    round: int = 1
    waiting_until_ms: int | None = None
    expected_action_source: str = "rest"
    last_action_source: str | None = None
    last_action: Dict[str, Any] | None = None
    active_actor_tag: str | None = None
    observation: Dict[str, Any] | None = None
    result: Dict[str, Any] | None = None
    logs: List[str] = field(default_factory=list)
    events: List[Dict[str, Any]] = field(default_factory=list)
    board_history: List[Dict[str, Any]] = field(default_factory=list)
    team_a_units: List[battle_logic.Battler | None] = field(init=False)
    team_b_units: List[battle_logic.Battler | None] = field(init=False)
    turn_order: List[battle_logic.Battler] = field(default_factory=list)
    turn_index: int = 0
    require_confirmation: bool = False
    auto_ready_b: bool = False
    participant_ids: Dict[str, str] = field(default_factory=dict)
    ready_sides: Dict[str, bool] = field(default_factory=lambda: {"A": False, "B": False})
    _preparation_lock: Any = field(default_factory=threading.RLock, repr=False)

    def __post_init__(self) -> None:
        if self.battle_mode == "pve_4v6" and (not self.team_a_payload or not self.team_b_payload or len(self.team_a_payload) > 4 or len(self.team_b_payload) > 6):
            raise BattleSessionError("pve_4v6 requires 1-4 player units and 1-6 enemies")
        lanes = _lanes_for_mode(self.battle_mode)
        self.team_a_units = [battle_logic.Battler(hero, "A", index) for index, hero in enumerate(self.team_a_payload[:lanes])]
        self.team_b_units = [battle_logic.Battler(hero, "B", index) for index, hero in enumerate(self.team_b_payload[:lanes])]
        while len(self.team_a_units) < lanes:
            self.team_a_units.append(None)
        while len(self.team_b_units) < lanes:
            self.team_b_units.append(None)

        self.control_mode = str(self.control_mode or "rest").strip().lower() or "rest"
        if self.control_mode not in {"rest", "program", "manual"}:
            raise BattleSessionError("battle session controlMode must be rest, program or manual")
        if self.control_mode == "manual" and self.participant_ids.get("A") and self.participant_ids.get("B"):
            self.wait_seconds = 30

        if self.require_confirmation:
            self.status = "preparing"
            self.ready_sides["B"] = self.auto_ready_b
            self.expected_action_source = "confirmation"
            self._append_board_history()
            return
        self._append_board_history()
        self._begin_round(time.time())
        self._append_board_history()
        if self.control_mode == "program":
            self.run_program_to_completion()

    def confirm_preparation(self, side: str, positions: Dict[str, int]) -> Dict[str, Any]:
        with self._preparation_lock:
            if not self.require_confirmation or side not in {"A", "B"}:
                raise BattleSessionError("This battle does not accept formation confirmation")
            team = self.team_a_units if side == "A" else self.team_b_units
            units = {unit.tag: unit for unit in team if unit}
            if not isinstance(positions, dict) or set(positions) != set(units):
                raise BattleSessionError("Submit every card from your own side exactly once")
            slots = list(positions.values())
            if any(type(slot) is not int or not 0 <= slot < len(team) for slot in slots) or len(set(slots)) != len(slots):
                raise BattleSessionError("Formation slots must be unique valid board positions")
            current = {tag: unit.slot_index for tag, unit in units.items()}
            if self.ready_sides[side]:
                if positions != current:
                    raise BattleSessionError("Your confirmed formation is locked")
                return self.public_snapshot()
            if self.status != "preparing":
                raise BattleSessionError("The battle has already started")
            arranged = [None] * len(team)
            for tag, slot in positions.items():
                units[tag].slot_index = slot
                arranged[slot] = units[tag]
            if side == "A":
                self.team_a_units = arranged
            else:
                self.team_b_units = arranged
            self.ready_sides[side] = True
            self.updated_at_ms = _now_ms()
            self.board_history = []
            self._append_board_history()
            if all(self.ready_sides.values()):
                self._begin_round(time.time())
                if self.control_mode == "program":
                    self.run_program_to_completion()
            return self.public_snapshot()

    def _push_event(
        self,
        round_num: int,
        attacker_tag: str,
        action_type: str,
        damage: int,
        is_crit: bool,
        is_miss: bool,
        is_stunned: bool,
        skill_name: str | None = None,
        mp_cost_applied: int = 0,
        heal: int = 0,
        defender_tag: str | None = None,
        attacker_slot: int | None = None,
        defender_slot: int | None = None,
        attack_type: str | None = None,
        buff_name: str | None = None,
        skill_role: str | None = None,
        range_mode: str | None = None,
        type_catalog: str | None = None,
        type_effect: str | None = None,
        buff_type_effect: str | None = None,
        vfx_presentation: str | None = None,
        action_id: str | None = None,
        target_index: int = 0,
        target_count: int = 1,
    ) -> None:
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

        self.logs.append(log)
        self.events.append(
            {
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
                "hpA": sum(max(0, unit.hp) for unit in self.team_a_units if unit),
                "hpB": sum(max(0, unit.hp) for unit in self.team_b_units if unit),
                "mpA": sum(max(0, unit.mp) for unit in self.team_a_units if unit),
                "mpB": sum(max(0, unit.mp) for unit in self.team_b_units if unit),
                "maxHpA": sum(unit.max_hp for unit in self.team_a_units if unit),
                "maxHpB": sum(unit.max_hp for unit in self.team_b_units if unit),
                "maxMpA": sum(unit.max_mp for unit in self.team_a_units if unit),
                "maxMpB": sum(unit.max_mp for unit in self.team_b_units if unit),
                "buffsA": [buff.copy() for unit in self.team_a_units if unit for buff in unit.buffs],
                "buffsB": [buff.copy() for unit in self.team_b_units if unit for buff in unit.buffs],
                "mpCostApplied": mp_cost_applied,
                "log": log,
                "timestamp": _now_ms(),
            }
        )
        self.board_history.append(battle_logic._board_snapshot(self.round, self.team_a_units, self.team_b_units, self.label_a, self.label_b))

    def _alive_a(self) -> int:
        return sum(max(0, unit.hp) for unit in self.team_a_units if unit)

    def _alive_b(self) -> int:
        return sum(max(0, unit.hp) for unit in self.team_b_units if unit)

    def _finalize(self) -> None:
        total_a = self._alive_a()
        total_b = self._alive_b()
        if total_a == total_b:
            winner_label = "Tie"
            winner_name = "Tie"
        elif total_a > total_b:
            winner_label = self.label_a
            winner_name = self.label_a
        else:
            winner_label = self.label_b
            winner_name = self.label_b

        self._append_board_history()
        self.logs.append(f"Battle finished. Winner: {winner_name}")
        self.status = "resolved"
        self.waiting_until_ms = None
        self.expected_action_source = "program"
        self.result = {
            "winner": winner_name,
            "winnerLabel": winner_label,
            "controlMode": self.control_mode,
            "logs": self.logs,
            "events": self.events,
            "finalHpA": total_a,
            "finalHpB": total_b,
            "maxHpA": sum(unit.max_hp for unit in self.team_a_units if unit),
            "maxHpB": sum(unit.max_hp for unit in self.team_b_units if unit),
            "maxMpA": sum(unit.max_mp for unit in self.team_a_units if unit),
            "maxMpB": sum(unit.max_mp for unit in self.team_b_units if unit),
            "board": battle_logic._board_snapshot(self.round, self.team_a_units, self.team_b_units, self.label_a, self.label_b),
            "boardHistory": self.board_history,
            "aliveA": self._alive_a(),
            "aliveB": self._alive_b(),
        }
        self.observation = self.result["board"]

    def _append_board_history(self) -> None:
        snapshot = battle_logic._board_snapshot(self.round, self.team_a_units, self.team_b_units, self.label_a, self.label_b)
        if not self.board_history:
            self.board_history.append(snapshot)
        else:
            self.board_history[-1] = snapshot

    def _begin_round(self, now: float) -> None:
        if self.status == "resolved":
            return

        if self.round == 1:
            battle_logic._apply_opening_passives(self.team_a_units, self.team_b_units,
                                                self.round, self._push_event, self.logs)
        else:
            for unit in self.team_a_units + self.team_b_units:
                if unit and unit.hp > 0:
                    unit.tick_buffs(self.round, self._push_event)

        if self._alive_a() <= 0 or self._alive_b() <= 0:
            self._finalize()
            return

        turn_order = [unit for unit in self.team_a_units + self.team_b_units if unit and unit.hp > 0]
        random.shuffle(turn_order)
        turn_order.sort(key=lambda unit: unit.spd, reverse=True)
        self.turn_order = turn_order
        self.turn_index = 0
        self.status = "awaiting_action"
        self.expected_action_source = "rest"
        self.waiting_until_ms = int(now * 1000) + max(1, self.wait_seconds) * 1000
        self._refresh_observation()

    @property
    def current_actor(self) -> battle_logic.Battler | None:
        if self.status != "awaiting_action":
            return None
        while self.turn_index < len(self.turn_order):
            actor = self.turn_order[self.turn_index]
            if actor and actor.hp > 0:
                return actor
            self.turn_index += 1
        return None

    def _refresh_observation(self) -> None:
        actor = self.current_actor
        if not actor:
            self.observation = None
            self.active_actor_tag = None
            return
        own_team = self.team_a_units if actor.tag.startswith("A") else self.team_b_units
        enemy_team = self.team_b_units if actor.tag.startswith("A") else self.team_a_units
        if self.control_mode == "manual":
            automated = not self._human_actor(actor) or actor.is_stunned
            self.expected_action_source = "program" if automated else "manual"
            self.waiting_until_ms = (_now_ms() + 2200 if automated else
                                     _now_ms() + 30_000 if self.participant_ids.get("A") and self.participant_ids.get("B") else None)
        self.active_actor_tag = actor.tag
        self.observation = battle_logic.build_public_battle_observation(self.round, actor, own_team, enemy_team, self.label_a, self.label_b)

    def _resolve_turn(self, action: Dict[str, Any], action_source: str) -> None:
        if self.status == "resolved":
            return

        actor = self.current_actor
        if not actor:
            self._advance_turn_or_round()
            return

        normalized = _normalize_action(action)
        if action_source == "rest" and normalized.get("actorTag") and normalized["actorTag"] != actor.tag:
            raise BattleSessionError("action actorTag does not match the active actor")

        if actor.is_stunned:
            self._push_event(
                self.round,
                actor.tag,
                "stunned",
                0,
                False,
                False,
                False,
                defender_tag=actor.tag,
                attacker_slot=actor.slot_index,
                attack_type=actor.character.get("state", {}).get("TYPE"),
                **battle_logic._event_visual_contract(actor),
            )
            self.last_action_source = action_source
            self.last_action = normalized | {"actorTag": actor.tag}
            actor.consume_stun()
            self._advance_turn_or_round()
            return

        if normalized["kind"] == "wait":
            hp_restore = min(max(0, actor.max_hp - actor.hp), (actor.max_hp + 9) // 10)
            mp_restore = min(max(0, actor.max_mp - actor.mp), (actor.max_mp + 9) // 10)
            actor.hp += hp_restore
            actor.mp += mp_restore
            self._push_event(
                self.round,
                actor.tag,
                "heal",
                0,
                False,
                False,
                False,
                "Wait",
                0,
                hp_restore,
                defender_tag=actor.tag,
                attacker_slot=actor.slot_index,
                defender_slot=actor.slot_index,
                attack_type=actor.character.get("state", {}).get("TYPE"),
                skill_role="support",
                range_mode="self",
                type_catalog="instant",
                type_effect="heal",
            )
            self.last_action_source = action_source
            self.last_action = normalized | {"actorTag": actor.tag, "hpRestored": hp_restore, "mpRestored": mp_restore}
            self._advance_turn_or_round()
            return

        chosen_skill = None
        if normalized["kind"] == "skill":
            skill_slot = normalized.get("skillSlot")
            if not skill_slot:
                raise BattleSessionError("skillSlot is required for skill actions")
            skills = actor.character.get("skill", {})
            if not isinstance(skills, dict) or skill_slot not in skills:
                raise BattleSessionError("unknown skillSlot")
            chosen_skill = skills[skill_slot]
            if battle_logic._is_passive(chosen_skill):
                raise BattleSessionError("Passive skills trigger automatically at battle start")

        own_team = self.team_a_units if actor.tag.startswith("A") else self.team_b_units
        enemy_team = self.team_b_units if actor.tag.startswith("A") else self.team_a_units
        targets = (self._manual_targets(actor, chosen_skill) if self.control_mode == "manual"
                   else battle_logic._ordered_board_targets(actor, own_team, enemy_team, chosen_skill))

        target = None
        target_tag = normalized.get("targetTag")
        if target_tag:
            selectable = targets if self.control_mode == "manual" else targets[:battle_logic._target_num(chosen_skill)]
            for candidate in selectable:
                if candidate.tag == target_tag:
                    target = candidate
                    break
            if target is None:
                raise BattleSessionError("targetTag is not legal for the active actor")
        if target is None and targets:
            target = targets[0]

        skill_cost = battle_logic._infer_skill_cost(chosen_skill) if chosen_skill else 0
        if chosen_skill and actor.mp < skill_cost:
            raise BattleSessionError("not enough MP")

        actor.mp = max(0, actor.mp - skill_cost)

        affected_targets = battle_logic._affected_targets(target, targets, chosen_skill)
        action_id = f"{self.session_id}:{len(self.events)}"
        for index, affected in enumerate(affected_targets):
            battle_logic._resolve_skill_hit(actor, affected, chosen_skill, self.round,
                                            self._push_event, self.logs,
                                            skill_cost if index == 0 else 0, action_id, index, len(affected_targets))
        if not target:
            self._push_event(self.round, actor.tag, "skill" if chosen_skill else "attack",
                             0, False, True, False,
                             chosen_skill.get("name") if chosen_skill else None, skill_cost,
                             defender_tag="-", attacker_slot=actor.slot_index,
                             **battle_logic._event_visual_contract(actor, chosen_skill))

        self.last_action_source = action_source
        self.last_action = normalized | {"actorTag": actor.tag}
        self._advance_turn_or_round()

    def _advance_turn_or_round(self) -> None:
        self._append_board_history()

        if self._alive_a() <= 0 or self._alive_b() <= 0:
            self._finalize()
            return

        self.turn_index += 1
        while self.turn_index < len(self.turn_order):
            next_actor = self.turn_order[self.turn_index]
            if next_actor and next_actor.hp > 0:
                self.status = "awaiting_action"
                self.expected_action_source = "rest"
                self.waiting_until_ms = _now_ms() + max(1, self.wait_seconds) * 1000
                self._refresh_observation()
                return
            self.turn_index += 1

        self.round += 1
        self._begin_round(time.time())

    def auto_advance_due(self, now_ms: int | None = None) -> bool:
        with self._preparation_lock:
            return self._auto_advance_due(now_ms)

    def _auto_advance_due(self, now_ms: int | None = None) -> bool:
        if self.status != "awaiting_action" or self.control_mode not in {"rest", "program", "manual"}:
            return False
        if self.control_mode in {"rest", "manual"} and (self.waiting_until_ms is None or (now_ms or _now_ms()) < self.waiting_until_ms):
            return False

        actor = self.current_actor
        if not actor:
            self._advance_turn_or_round()
            return True

        controller = battle_logic.ProgramBattleController()
        observation = self.observation or battle_logic.build_public_battle_observation(
            self.round,
            actor,
            self.team_a_units if actor.tag.startswith("A") else self.team_b_units,
            self.team_b_units if actor.tag.startswith("A") else self.team_a_units,
            self.label_a,
            self.label_b,
        )
        action = controller.choose_action(observation)
        # Wait is reserved for a human's deliberate recovery action. A program
        # controller (including a custom one) is never allowed to spend its turn
        # on it, so fall back to a normal attack if one is returned accidentally.
        if action.kind == "wait":
            action = battle_logic.BattleAction(
                kind="attack",
                target_tag=self._manual_targets(actor, None)[0].tag if self._manual_targets(actor, None) else None,
            )
        own_team = self.team_a_units if actor.tag.startswith("A") else self.team_b_units
        enemy_team = self.team_b_units if actor.tag.startswith("A") else self.team_a_units
        chosen_skill = None
        if action.kind == "skill" and action.skill_slot:
            skills = actor.character.get("skill", {})
            if isinstance(skills, dict):
                chosen_skill = skills.get(action.skill_slot)
        legal_targets = battle_logic._ordered_board_targets(actor, own_team, enemy_team, chosen_skill)
        legal_target_tags = {unit.tag for unit in legal_targets}
        target_tag = action.target_tag if action.target_tag in legal_target_tags else None
        payload: Dict[str, Any] = {"kind": action.kind, "actorTag": actor.tag}
        if action.kind == "skill" and action.skill_slot:
            payload["skillSlot"] = action.skill_slot
        if target_tag:
            payload["targetTag"] = target_tag
        self._resolve_turn(payload, "program")
        return True

    def run_program_to_completion(self, max_steps: int = 1000) -> None:
        """Resolve a server-controlled battle immediately while preserving every replay frame."""
        steps = 0
        while self.status != "resolved" and steps < max_steps:
            if not self.auto_advance_due():
                break
            steps += 1
        if self.status != "resolved":
            raise BattleSessionError("program battle did not resolve within the step limit")

    def _manual_targets(self, actor, skill):
        own = self.team_a_units if actor.tag.startswith("A") else self.team_b_units
        enemies = self.team_b_units if actor.tag.startswith("A") else self.team_a_units
        # TARGET_NUM limits affected units, not the player's choice of primary target.
        candidate_skill = dict(skill or {}) | {"TARGET_NUM": len(own) + len(enemies)}
        return battle_logic._ordered_board_targets(actor, own, enemies, candidate_skill)

    def _human_actor(self, actor):
        return actor.tag[0] in self.participant_ids if self.participant_ids else actor.tag.startswith("A")

    def _action_options(self):
        actor = self.current_actor
        if self.control_mode != "manual" or not actor or not self._human_actor(actor) or actor.is_stunned:
            return []
        options = []
        skills = actor.character.get("skill", {})
        for slot, skill in [(None, None)] + [(k, v) for k, v in skills.items() if k in {"s1", "s2"} and isinstance(v, dict)]:
            if battle_logic._is_passive(skill):
                continue
            cost = battle_logic._infer_skill_cost(skill) if skill else 0
            targets = [unit.tag for unit in self._manual_targets(actor, skill)]
            options.append({"kind": "skill" if slot else "attack", "skillSlot": slot,
                            "name": skill.get("name", slot) if skill else "Attack", "cost": cost,
                            "targets": targets, "disabled": "Not enough MP" if cost > actor.mp else "No legal targets" if not targets else None})
        options.append({"kind": "wait", "skillSlot": None, "name": "Wait", "cost": 0,
                        "targets": [actor.tag], "disabled": None})
        return options

    def submit_action(self, action: Dict[str, Any]) -> Dict[str, Any]:
        with self._preparation_lock:
            if self.status == "preparing":
                raise BattleSessionError("Both sides must confirm before combat actions")
            if self.control_mode not in {"rest", "manual"}:
                raise BattleSessionError("program-controlled battle sessions do not accept manual actions")
            if self.status == "resolved":
                raise BattleSessionError("battle session already resolved")
            if self.control_mode == "manual":
                if self.waiting_until_ms is not None and _now_ms() >= self.waiting_until_ms:
                    self._auto_advance_due()
                    raise BattleSessionError("Time expired. The server has acted for this turn")
                actor = self.current_actor
                if not actor or not self._human_actor(actor) or actor.is_stunned:
                    raise BattleSessionError("Wait for your own unit to act")
                if not isinstance(action, dict) or action.get("actorTag") != actor.tag or action.get("expectedEventCount") != len(self.events):
                    raise BattleSessionError("The turn has changed. Refresh before acting again")
            self._resolve_turn(action, "rest")
            return self.public_snapshot()

    def public_snapshot(self) -> Dict[str, Any]:
        with self._preparation_lock:
            return self._public_snapshot()

    def _public_snapshot(self) -> Dict[str, Any]:
        observation = self.observation
        board = battle_logic._board_snapshot(self.round, self.team_a_units, self.team_b_units, self.label_a, self.label_b)
        if self.status == "resolved" and self.result:
            observation = self.result["board"]
            board = self.result["board"]
        return {
            "sessionId": self.session_id,
            "battleMode": self.battle_mode,
            "controlMode": self.control_mode,
            "labelA": self.label_a,
            "labelB": self.label_b,
            "status": self.status,
            "readiness": dict(self.ready_sides) if self.require_confirmation else None,
            "opponentAutoReady": self.auto_ready_b,
            "round": self.round,
            "waitingUntil": self.waiting_until_ms,
            "serverNow": _now_ms(),
            "waitSeconds": self.wait_seconds,
            "activeActorTag": self.active_actor_tag,
            "actionOptions": self._action_options(),
            "expectedActionSource": self.expected_action_source,
            "lastActionSource": self.last_action_source,
            "lastAction": self.last_action,
            "observation": observation,
            "board": board,
            "logs": list(self.logs),
            "events": list(self.events),
            "boardHistory": list(self.board_history),
            "result": self.result,
        }


class BattleSessionManager:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._sessions: Dict[str, BattleSession] = {}
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def _ensure_worker(self) -> None:
        if self._thread and self._thread.is_alive():
            return

        def _worker() -> None:
            while not self._stop.wait(SWEEP_INTERVAL_SECONDS):
                self.advance_due_sessions()

        self._thread = threading.Thread(target=_worker, daemon=True, name="battle-session-sweeper")
        self._thread.start()

    def create_session(
        self,
        battle_mode: str,
        control_mode: str,
        label_a: str,
        label_b: str,
        team_a: List[Dict[str, Any]],
        team_b: List[Dict[str, Any]],
        wait_seconds: int = DEFAULT_WAIT_SECONDS,
        require_confirmation: bool = False,
        auto_ready_b: bool = False,
        participant_ids: Dict[str, str] | None = None,
    ) -> BattleSession:
        session = BattleSession(
            session_id=str(uuid.uuid4()),
            battle_mode=battle_mode,
            control_mode=control_mode,
            label_a=label_a,
            label_b=label_b,
            team_a_payload=team_a,
            team_b_payload=team_b,
            wait_seconds=wait_seconds,
            require_confirmation=require_confirmation,
            auto_ready_b=auto_ready_b,
            participant_ids=participant_ids or {},
        )
        with self._lock:
            self._sessions[session.session_id] = session
        self._ensure_worker()
        return session

    def get_session(self, session_id: str) -> BattleSession | None:
        with self._lock:
            return self._sessions.get(session_id)

    def advance_due_sessions(self) -> None:
        with self._lock:
            sessions = list(self._sessions.values())
        for session in sessions:
            try:
                session.auto_advance_due()
            except Exception:
                continue

    def submit_action(self, session_id: str, action: Dict[str, Any]) -> Dict[str, Any]:
        with self._lock:
            session = self._sessions.get(session_id)
        if not session:
            raise BattleSessionError("battle session not found")
        return session.submit_action(action)


MANAGER = BattleSessionManager()


def create_battle_session(
    battle_mode: str,
    control_mode: str,
    label_a: str,
    label_b: str,
    team_a: List[Dict[str, Any]],
    team_b: List[Dict[str, Any]],
    wait_seconds: int = DEFAULT_WAIT_SECONDS,
    require_confirmation: bool = False,
    auto_ready_b: bool = False,
    participant_ids: Dict[str, str] | None = None,
) -> BattleSession:
    return MANAGER.create_session(battle_mode, control_mode, label_a, label_b, team_a, team_b, wait_seconds=wait_seconds, require_confirmation=require_confirmation, auto_ready_b=auto_ready_b, participant_ids=participant_ids)


def get_battle_session(session_id: str) -> BattleSession | None:
    return MANAGER.get_session(session_id)


def advance_due_sessions() -> None:
    MANAGER.advance_due_sessions()


def submit_battle_session_action(session_id: str, action: Dict[str, Any]) -> Dict[str, Any]:
    return MANAGER.submit_action(session_id, action)
