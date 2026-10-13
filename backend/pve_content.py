"""Versioned, deterministic Void Labyrinth content. No forging/LLM calls."""
import copy
import json
import math
from pathlib import Path


CONTENT = json.loads((Path(__file__).parent / "data/void-labyrinth-v1.json").read_text(encoding="utf-8"))
THEME = "void_labyrinth"
VERSION = CONTENT["content_version"]
TIERS = {t["id"]: t for t in CONTENT["tiers"]}
NODES = {n["id"]: n for n in CONTENT["nodes"]}


def encounter_for(tier, node, variant="default"):
    for encounter in CONTENT["encounters"]:
        if (encounter["tier"], encounter["node"], encounter["variant"]) == (tier, node, variant):
            return copy.deepcopy(encounter)
    raise ValueError("Unknown tier, node or branch")


def enemy_hero(entry, total_bp):
    role = entry["role"]
    archetype = CONTENT["archetypes"][role]
    state = {key: entry["bp"] * share // (100 * CONTENT["stat_costs"][key])
             for key, share in archetype["budget_shares"].items()}
    state["DEF"] = min(state["DEF"], archetype["def_cap"])
    state["HP"] += entry["bp"] - sum(state[k] * CONTENT["stat_costs"][k] for k in state)
    state.update(CONTENT["other_base_stats"])
    effect = {"leech": "poison", "scribe": "light", "harrier": "pierce", "archer": "pierce"}.get(role, "dark")
    # Enemy is the unrestricted spell range; Melee uses the PvE column gate.
    state.update(TYPE=archetype["type"], type_catalog="instant", type_effect=effect)
    skill = {"name": "Rift Strike", "description": "The next action is shown in the intent display.", "TYPE": archetype["type"],
             "TARGET": "Enemy", "RANGE": "melee" if archetype["type"] == "Melee" else "enemy",
             "ROLE": "attack", "TARGET_NUM": 1, "DMG": 0, "MP_COST": max(1, math.ceil(state["MP"] * .12)),
             "type_catalog": "instant", "type_effect": effect}
    if role == "sentinel":
        skill.update(name="Stone Carapace", TARGET="Self", RANGE="self", ROLE="buff", BUFF_NAME="pray", BUFF_DEF=3, BUFF_TIME=2)
    elif role == "leech":
        skill.update(name="Mnemonic Bite", BUFF_NAME="poison", BUFF_HP=max(1, round(state["ATK"] * .12)), BUFF_TIME=2)
    elif role == "weaver":
        skill.update(name="Unname", BUFF_NAME="curse", BUFF_DMG=max(1, round(state["ATK"] * .10)), BUFF_TIME=2)
    elif role == "scribe":
        skill.update(name="Rewrite", TARGET="Ally", RANGE="ally", ROLE="heal", BUFF_HP=round(state["HP"] * .25 + total_bp * .015),
                     MP_COST=max(1, math.ceil(state["MP"] * .15)))
    elif role in {"archer", "harrier"}:
        skill.update(name="Shardstring" if role == "archer" else "Rift Lunge", DMG=round(state["ATK"] * .2))
    elif role in {"boss", "warden"}:
        skill.update(name="Unweaving" if role == "boss" else "Oathbreak", RANGE="enemy", MP_COST=max(1, math.ceil(state["MP"] * .10)))
    descriptions = {
        "sentinel": "Gain 3 DEF for two rounds. This does not grant a separate shield.",
        "leech": f"Deal ordinary damage and apply poison for two rounds, dealing {skill.get('BUFF_HP', 0)} damage each round.",
        "weaver": f"Deal ordinary damage and reduce the target ATK by {skill.get('BUFF_DMG', 0)} for two rounds.",
        "scribe": f"Heal the living ally with the lowest HP ratio for {skill.get('BUFF_HP', 0)} HP. Cannot resurrect.",
        "archer": "Deal 1.2x current ATK to one target; prioritize the highest-ATK legal target.",
        "harrier": "Deal 1.2x current ATK to one target; prioritize the legal target with the lowest HP ratio.",
        "boss": "Attack, charge, release, recover. Anchors change the displayed range and effects. Stun interrupts the charge; release spends MP once.",
        "warden": "Attack, charge, release, recover. The intent display shows tier-specific targets and damage. Stun interrupts the charge.",
    }
    skill["description"] = descriptions.get(role, "Maintains the ritual. Does not attack or regenerate by waiting.")
    return {"id": entry["tag"], "slot": entry["slot"], "npcRole": role,
            "character": {"name": archetype["name"], "description": archetype["lore"], "BP": entry["bp"],
                          "rarity": "common", "state": state, "skill": {} if role == "anchor" else {"s1": skill}}}


def catalog():
    return {"theme": THEME, "name": "Void Labyrinth", "contentVersion": VERSION, "prototype": True,
            "tiers": list(TIERS.values()), "nodes": list(NODES.values()), "entryCost": 0,
            "bestiary": [{"id": role, **{key: creature[key] for key in ("name", "role", "lore", "tactic")}} for role, creature in CONTENT["archetypes"].items()],
            "rewardPolicy": "First clears are recorded. Dust and cosmetic rewards are not available in this version.",
            "encounters": [{"tier": e["tier"], "node": e["node"], "variant": e["variant"],
                            "enemyTotalBp": e["enemy_total_bp"],
                            "enemies": [{"name": CONTENT["archetypes"][unit["role"]]["name"], "slot": unit["slot"], "role": unit["role"]} for unit in e["enemies"]]}
                           for e in CONTENT["encounters"]]}
