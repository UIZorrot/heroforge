"""Versioned, deterministic Void Labyrinth content. No forging/LLM calls."""
import copy
import json
import math
from pathlib import Path


CONTENT = json.loads((Path(__file__).parent / "data/void-labyrinth-v1.json").read_text(encoding="utf-8"))
THEME = "void_labyrinth"
FIXED_CLIMB_VERSION = CONTENT["content_version"]
VERSION = "void-labyrinth-v3-adaptive-1"
CLIMB_VERSIONS = {FIXED_CLIMB_VERSION, VERSION}
MIN_TEAM_BP = 1000
ADAPTIVE_TIER = {"id": "adaptive", "name": "The Void Labyrinth", "minimum_team_bp": MIN_TEAM_BP,
                 "recommended_team_bp": MIN_TEAM_BP, "honor_bp_band": [MIN_TEAM_BP], "scaling": "entry_stat_budget"}
ADAPTIVE_RATIOS = {'N1': 80, 'N2': 85, 'N3': 85, 'N5': 90, 'N6': 95, 'N7': 100, 'N8': 105, 'N10': 115}
TIERS = {t["id"]: t for t in CONTENT["tiers"]}
NODES = {n["id"]: n for n in CONTENT["nodes"]}
FIRST_CLEAR_DUST = {'adaptive': 150, 'threshold': 75, 'reflection': 150, 'heart': 250}
RELICS = {
    'edge': {'id': 'edge', 'name': 'Ember Edge', 'description': '+5% base ATK for the rest of this climb.'},
    'ward': {'id': 'ward', 'name': 'Stone Memory', 'description': '+8% base maximum HP for the rest of this climb.'},
    'renewal': {'id': 'renewal', 'name': 'Lantern Draught', 'description': 'Recover 25% maximum HP and MP for living companions.'},
}


def bp_band(tier):
    target = TIERS[tier]['recommended_team_bp']
    return (target * 95 // 100, target * 105 // 100)


def encounter_for(tier, node, variant="default", *, power_bp=None, party_size=None):
    if tier == 'adaptive':
        if type(power_bp) is not int or power_bp < MIN_TEAM_BP or type(party_size) is not int or not 1 <= party_size <= 4:
            raise ValueError('The expedition needs a valid locked entry strength and one to four companions.')
        profile = 'threshold' if party_size == 1 else 'reflection' if party_size == 2 else 'heart'
        encounter = encounter_for(profile, node, variant)
        total = (power_bp * ADAPTIVE_RATIOS[node] + 50) // 100
        original_total = encounter['enemy_total_bp']
        shares = [divmod(unit['bp'] * total, original_total) for unit in encounter['enemies']]
        allocations = [share[0] for share in shares]
        for index in sorted(range(len(shares)), key=lambda i: (-shares[i][1], i))[:total - sum(allocations)]:
            allocations[index] += 1
        for unit, budget in zip(encounter['enemies'], allocations):
            unit['bp'] = budget
        encounter.update(id=f'adaptive-{node}-{variant}', tier=profile, scaling='adaptive', enemy_total_bp=total)
        return encounter
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


def encounter_preview(encounter):
    return {'tier': 'adaptive' if encounter.get('scaling') == 'adaptive' else encounter['tier'],
            'node': encounter['node'], 'variant': encounter['variant'], 'enemyTotalBp': encounter['enemy_total_bp'],
            'enemies': [{'name': CONTENT['archetypes'][unit['role']]['name'], 'slot': unit['slot'], 'role': unit['role']} for unit in encounter['enemies']]}


def catalog():
    return {"theme": THEME, "name": "Void Labyrinth", "contentVersion": VERSION, "prototype": True,
            "tiers": [ADAPTIVE_TIER], "legacyTiers": list(TIERS.values()), "minimumTeamBp": MIN_TEAM_BP,
            "nodes": list(NODES.values()), "entryCost": 0,
            "bestiary": [{"id": role, **{key: creature[key] for key in ("name", "role", "lore", "tactic")}} for role, creature in CONTENT["archetypes"].items()],
            "rewardPolicy": "Enemy strength is locked to your entry stat budget. Choose climb rewards; the first adaptive clear awards 150 Dust once.",
            "rewards": list(RELICS.values()), "firstClearDust": FIRST_CLEAR_DUST,
            "encounters": [encounter_preview(e) for e in CONTENT["encounters"]]}
