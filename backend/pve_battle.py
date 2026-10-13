"""Persistable PvE session using the existing hit/status/replay resolver."""
import copy
import random
import threading
import time

import battle_logic as logic
from battle_sessions import BattleSession, BattleSessionError
from pve_content import CONTENT, enemy_hero


def _tuple_tree(value):
    return tuple(_tuple_tree(item) for item in value) if isinstance(value, list) else value


class LabyrinthBattle(BattleSession):
    def __init__(self, encounter, party, resources, seed, boon=False, prepare=False):
        self.encounter = copy.deepcopy(encounter)
        self.npc_phases = {}
        self.pending_marks = {}
        self.wait_counts = {}
        self.rng = random.Random(seed)
        enemies = [enemy_hero(entry, encounter["enemy_total_bp"]) for entry in encounter["enemies"]]
        super().__init__(session_id=f"void-{seed}", battle_mode="pve_4v6", control_mode="manual",
                         label_a="Expedition", label_b="Void Labyrinth", team_a_payload=copy.deepcopy(party),
                         team_b_payload=enemies, require_confirmation=True, auto_ready_b=True)
        for side, payload in (("A", party), ("B", enemies)):
            units = self.team_a_units if side == "A" else self.team_b_units
            arranged = [None] * 6
            for unit, hero in zip(units, payload):
                unit.slot_index = hero["slot"]
                if side == "A":
                    resource = resources[hero["id"]]
                    unit.hp, unit.mp = resource["hp"], resource["mp"]
                    if boon and unit.hp > 0:
                        rarity = str(unit.character.get("rarity", "common"))
                        multiplier = {"common": 1, "rare": 1.03, "epic": 1.06, "mythic": 1.10}.get(rarity, 1)
                        amount = int(.02 * round(int(unit.character["BP"]) * multiplier) / 4)
                        if amount:
                            unit.add_buff("pray", 2, 0, self.logs, effects={"BUFF_DMG": amount})
                arranged[unit.slot_index] = unit
            if side == "A":
                self.team_a_units = arranged
            else:
                self.team_b_units = arranged
        self.board_history = []
        self._append_board_history()
        if not prepare:
            self.require_confirmation = False
            self.status = "awaiting_action"
            with logic.use_battle_random(self.rng):
                self._begin_round(time.time())

    def confirm_preparation(self, side, positions):
        with logic.use_battle_random(self.rng):
            return super().confirm_preparation(side, positions)

    def _begin_round(self, now):
        if self.round > 30:
            self.round = 30
            self._finalize()
            return
        super()._begin_round(now)

    def _finalize(self):
        super()._finalize()
        cleared = self._alive_a() > 0 and self._alive_b() <= 0
        self.result.update(winner=self.label_a if cleared else self.label_b,
                           winnerLabel=self.label_a if cleared else self.label_b,
                           cleared=cleared, reason="cleared" if cleared else "party_defeated" if self._alive_a() <= 0 else "round_limit")
        # Replace the default HP-comparison verdict in both the public result and replay log.
        self.logs[-1] = f"Battle finished. {'Cleared' if cleared else self.result['reason']}"

    def _target_candidates(self, actor, skill, own, enemies):
        mode = str((skill or {}).get("TARGET", "Enemy")).lower()
        if mode == "self":
            return [actor] if actor.hp > 0 else []
        living = [unit for unit in (own if mode == "ally" else enemies) if unit and unit.hp > 0]
        range_mode = logic._skill_range(skill)
        basic = not skill or set(skill) <= {"TARGET_NUM"}
        attack_type = str(actor.character["state"].get("TYPE", "")).lower()
        melee = range_mode == "melee" or (basic and any(token in attack_type for token in ("melee", "weapon", "warrior", "sword", "claw")))
        if mode == "enemy" and melee:
            occupied_front = {unit.slot_index for unit in living if unit.slot_index < 3}
            living = [unit for unit in living if unit.slot_index < 3 or unit.slot_index - 3 not in occupied_front]
        return sorted(living, key=lambda unit: (unit.hp / unit.max_hp, unit.slot_index))

    def _resolve_turn(self, action, action_source):
        actor = self.current_actor
        if actor and not actor.is_stunned and action.get("kind") == "wait":
            if self.wait_counts.get(actor.tag, 0) >= 2:
                raise BattleSessionError("No waits remaining in this encounter (two per hero).")
            self.wait_counts[actor.tag] = self.wait_counts.get(actor.tag, 0) + 1
        super()._resolve_turn(action, action_source)

    def _action_options(self):
        options = super()._action_options()
        actor = self.current_actor
        for option in options:
            if option["kind"] == "wait" and actor:
                left = max(0, 2 - self.wait_counts.get(actor.tag, 0))
                option["name"] = f"Wait · remaining: {left}"
                option["disabled"] = None if left else "No waits remaining this encounter."
        return options

    def _advance_turn_or_round(self):
        bosses = [unit for unit in self.team_b_units if unit and unit.hero.get("npcRole") == "boss"]
        if bosses and bosses[0].hp <= 0:
            for unit in self.team_b_units:
                if unit and unit.hp > 0 and unit.hero.get("npcRole") == "anchor":
                    unit.hp = 0
                    self._note(unit, "Anchor collapsed", "mechanism")
        super()._advance_turn_or_round()

    def _note(self, actor, text, action_type="ritual"):
        self._push_event(self.round, actor.tag, action_type, 0, False, False, False, text,
                         defender_tag=actor.tag, attacker_slot=actor.slot_index, defender_slot=actor.slot_index)

    def _ritual_profile(self, actor):
        if actor.hero["npcRole"] == "warden":
            tier = self.encounter["tier"]
            index = ["threshold", "reflection", "heart"].index(tier)
            return [1, 2, 3][index], [1.25, 1.20, 1.15][index], False
        profile = self.encounter["boss"]
        anchors = {unit.slot_index for unit in self.team_b_units if unit and unit.hp > 0 and unit.hero["npcRole"] == "anchor"}
        count, multiplier = profile["base_target_count"], profile["damage_multiplier"]
        if 3 not in anchors:
            if self.encounter["tier"] == "threshold":
                multiplier = 1.0
            else:
                count = 1 if self.encounter["tier"] == "reflection" else 2
        return count, multiplier, 5 in anchors

    def _ritual_targets(self, actor):
        count, _, _ = self._ritual_profile(actor)
        tags = self.pending_marks.get(actor.tag, [])[:count]
        lookup = {unit.tag: unit for unit in self.team_a_units if unit and unit.hp > 0}
        return [lookup[tag] for tag in tags if tag in lookup]

    def _ritual_skill(self, actor):
        skill = copy.deepcopy(actor.character["skill"]["s1"])
        count, multiplier, curse = self._ritual_profile(actor)
        skill["TARGET_NUM"] = count
        skill["DMG"] = round(actor.atk * (multiplier - 1))
        if curse:
            # Attribute statuses expire at round start. Two engine ticks cover
            # the remaining cast round plus the promised next complete round.
            skill.update(BUFF_NAME="curse", BUFF_TIME=2, BUFF_DMG=max(1, round(actor.atk * .10)))
        else:
            for field in ("BUFF_NAME", "BUFF_TIME", "BUFF_DMG"):
                skill.pop(field, None)
        return skill

    def _release(self, actor):
        skill = self._ritual_skill(actor)
        targets = self._ritual_targets(actor)
        cost = logic._infer_skill_cost(skill)
        if actor.mp < cost or not targets:
            self._note(actor, "Ritual cancelled: insufficient MP or no surviving marked targets.")
        else:
            actor.mp -= cost
            action_id = f"{self.session_id}:{len(self.events)}"
            for index, target in enumerate(targets):
                logic._resolve_skill_hit(actor, target, skill, self.round, self._push_event, self.logs,
                                         cost if index == 0 else 0, action_id, index, len(targets))
        self.pending_marks.pop(actor.tag, None)
        self.npc_phases[actor.tag] = 3
        self._advance_turn_or_round()

    def _npc_turn(self, actor):
        role = actor.hero["npcRole"]
        phase = self.npc_phases.get(actor.tag, 0)
        if actor.is_stunned:
            if actor.tag in self.pending_marks:
                self.pending_marks.pop(actor.tag)
                self.npc_phases[actor.tag] = 3
                self._note(actor, "Ritual interrupted")
            self._resolve_turn({"kind": "attack"}, "program")
            return
        if role == "anchor":
            self._note(actor, "Anchor maintains the ritual; no active turn.", "mechanism")
            self._advance_turn_or_round()
            return
        if role in {"boss", "warden"}:
            if phase == 1:
                count, _, _ = self._ritual_profile(actor)
                targets = sorted([unit for unit in self.team_a_units if unit and unit.hp > 0], key=lambda unit: (-unit.atk, unit.slot_index))
                self.pending_marks[actor.tag] = [unit.tag for unit in targets[:count]]
                self.npc_phases[actor.tag] = 2
                self._note(actor, "Unweaving: release on the next action.")
                self._advance_turn_or_round()
                return
            if phase == 2:
                self._release(actor)
                return
            if phase == 3:
                self.npc_phases[actor.tag] = 0
                self._note(actor, "Ritual recovery: no attack this turn.")
                self._advance_turn_or_round()
                return
            self.npc_phases[actor.tag] = 1
            self._resolve_turn({"kind": "attack"}, "program")
            return
        cycle = 2 if role == "harrier" else 3
        cast_phase = 1 if role in {"sentinel", "leech", "weaver", "harrier"} else 2
        self.npc_phases[actor.tag] = (phase + 1) % cycle
        skill = actor.character["skill"]["s1"]
        if phase != cast_phase or actor.mp < logic._infer_skill_cost(skill):
            self._resolve_turn({"kind": "attack"}, "program")
            return
        own, enemies = self.team_b_units, self.team_a_units
        targets = self._target_candidates(actor, skill, own, enemies)
        if role == "archer":
            targets.sort(key=lambda unit: (-unit.atk, unit.slot_index))
        if role in {"archer", "harrier"}:
            skill["DMG"] = round(actor.atk * .2)
        self._resolve_turn({"kind": "skill", "skillSlot": "s1", "targetTag": targets[0].tag if targets else None}, "program")

    def step_enemy(self):
        actor = self.current_actor
        if not actor or not actor.tag.startswith("B") and not actor.is_stunned:
            raise BattleSessionError("It is the player turn.")
        with logic.use_battle_random(self.rng):
            if actor.tag.startswith("B"):
                self._npc_turn(actor)
            else:
                self._resolve_turn({"kind": "attack"}, "program")
        return self.public_snapshot()

    def submit_action(self, action):
        with logic.use_battle_random(self.rng):
            return super().submit_action(action)

    def _public_snapshot(self):
        snapshot = super()._public_snapshot()
        for unit in snapshot["board"]["top"]:
            if unit:
                actor = next(actor for actor in self.team_b_units if actor and actor.tag == unit["tag"])
                if actor.hero["npcRole"] in {"boss", "warden"}:
                    unit["skills"]["s1"] = self._ritual_skill(actor)
        snapshot["viewerSide"] = "A"
        snapshot["waitingUntil"] = None
        snapshot["intents"] = self.intents()
        snapshot["npcRoles"] = {unit.tag: unit.hero["npcRole"] for unit in self.team_b_units if unit}
        return snapshot

    def intents(self):
        result = []
        for actor in self.team_b_units:
            if not actor or actor.hp <= 0:
                continue
            role = actor.hero["npcRole"]
            phase = self.npc_phases.get(actor.tag, 0)
            if role in {"boss", "warden"}:
                count, multiplier, curse = self._ritual_profile(actor)
                labels = ["Basic attack", "Charge ritual", "Release ritual", "Recovery"]
                result.append({"actorTag": actor.tag, "name": actor.name, "action": labels[phase],
                               "targetTags": [unit.tag for unit in self._ritual_targets(actor)] if phase == 2 else [],
                               "targetCount": count, "damageMultiplier": multiplier, "curse": curse,
                               "interruptible": phase == 2, "mpCost": logic._infer_skill_cost(actor.character["skill"]["s1"])})
            else:
                cast_phase = 1 if role in {"sentinel", "leech", "weaver", "harrier"} else 2
                skill = actor.character.get("skill", {}).get("s1")
                casting = skill and phase == cast_phase and actor.mp >= logic._infer_skill_cost(skill)
                targets = self._target_candidates(actor, skill if casting else None, self.team_b_units, self.team_a_units)
                if casting and role == "archer":
                    targets.sort(key=lambda unit: (-unit.atk, unit.slot_index))
                result.append({"actorTag": actor.tag, "name": actor.name, "action": "Maintain ritual" if role == "anchor" else skill["name"] if casting else "Basic attack",
                               "targetTags": [] if role == "anchor" else [unit.tag for unit in targets[:1]], "interruptible": False})
        return result

    def export_state(self):
        state = {key: copy.deepcopy(value) for key, value in vars(self).items()
                 if key not in {"team_a_units", "team_b_units", "turn_order", "_preparation_lock", "rng"}}
        state["units_a"] = [copy.deepcopy(vars(unit)) if unit else None for unit in self.team_a_units]
        state["units_b"] = [copy.deepcopy(vars(unit)) if unit else None for unit in self.team_b_units]
        state["order_tags"] = [unit.tag for unit in self.turn_order]
        state["rng_state"] = self.rng.getstate()
        return state

    @classmethod
    def restore(cls, state):
        room = cls.__new__(cls)
        copied = copy.deepcopy(state)
        room.rng = random.Random()
        room.rng.setstate(_tuple_tree(copied.pop("rng_state")))
        def restore_units(items):
            units = []
            for item in items:
                if item is None:
                    units.append(None)
                else:
                    unit = logic.Battler.__new__(logic.Battler)
                    unit.__dict__.update(item)
                    units.append(unit)
            return units
        room.team_a_units = restore_units(copied.pop("units_a"))
        room.team_b_units = restore_units(copied.pop("units_b"))
        lookup = {unit.tag: unit for unit in room.team_a_units + room.team_b_units if unit}
        room.turn_order = [lookup[tag] for tag in copied.pop("order_tags")]
        room.__dict__.update(copied)
        # Presentation metadata can evolve without changing a saved fight's stats or RNG.
        room.label_a, room.label_b = "Expedition", "Void Labyrinth"
        entries = {entry["tag"]: entry for entry in room.encounter["enemies"]}
        for unit in room.team_b_units:
            if not unit:
                continue
            role = unit.hero["npcRole"]
            unit.name = CONTENT["archetypes"][role]["name"]
            unit.character["name"] = unit.name
            unit.character["description"] = CONTENT["archetypes"][role]["lore"]
            fresh = enemy_hero(entries[unit.hero["id"]], room.encounter["enemy_total_bp"])["character"]["skill"]
            for key, skill in unit.character.get("skill", {}).items():
                if key in fresh:
                    skill["name"], skill["description"] = fresh[key]["name"], fresh[key]["description"]
        room._preparation_lock = threading.RLock()
        return room
