from copy import deepcopy


RELIC_CATALOG = [
    {
        "relic_type": "low_ember_shard",
        "display_name": "Ember Shard",
        "tier": "common",
        "family": "Fire",
        "lore_summary": "Cinder fragment from a burnt altar.",
        "effect_profile": "Fire-aligned Forge bias and aggressive archetype bias.",
        "forge_bias": "fire",
        "battle_bias": "offense",
        "icon_prompt": "soulslike item icon, ember shard, jagged red-orange crystal, charred metal prongs, floating ash, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
    {
        "relic_type": "low_frost_shard",
        "display_name": "Frost Shard",
        "tier": "common",
        "family": "Frost",
        "lore_summary": "Ice splinter sealed in old glass.",
        "effect_profile": "Frost-aligned Forge bias and defensive control bias.",
        "forge_bias": "frost",
        "battle_bias": "defense",
        "icon_prompt": "soulslike item icon, frost shard, pale blue ice crystal, cracked silver mount, thin mist, cold glow, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
    {
        "relic_type": "low_radiant_shard",
        "display_name": "Radiant Shard",
        "tier": "common",
        "family": "Light",
        "lore_summary": "Piece of a sun relic.",
        "effect_profile": "Light-aligned Forge bias and healing or protection bias.",
        "forge_bias": "light",
        "battle_bias": "support",
        "icon_prompt": "soulslike item icon, radiant shard, ivory-gold gem, halo ring, sacred metal filigree, soft divine glow, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
    {
        "relic_type": "low_void_shard",
        "display_name": "Void Shard",
        "tier": "common",
        "family": "Void",
        "lore_summary": "Fragment from an empty shrine.",
        "effect_profile": "Void-aligned Forge bias and curse or pierce bias.",
        "forge_bias": "void",
        "battle_bias": "disruption",
        "icon_prompt": "soulslike item icon, void shard, dark obsidian crystal, thin purple void haze, broken rune ring, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
    {
        "relic_type": "low_storm_shard",
        "display_name": "Storm Shard",
        "tier": "common",
        "family": "Storm",
        "lore_summary": "Condensed lightning trapped in crystal.",
        "effect_profile": "Storm-aligned Forge bias and speed or multi-hit bias.",
        "forge_bias": "storm",
        "battle_bias": "tempo",
        "icon_prompt": "soulslike item icon, storm shard, cobalt crystal with lightning vein, brass clamps, electric sparks, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
    {
        "relic_type": "low_beast_fang",
        "display_name": "Beast Fang",
        "tier": "common",
        "family": "Beast",
        "lore_summary": "Trophy from an ancient predator.",
        "effect_profile": "Beast-aligned Forge bias and physical pressure bias.",
        "forge_bias": "beast",
        "battle_bias": "pressure",
        "icon_prompt": "soulslike item icon, beast fang, bone talon pendant, leather wrap, primal scratches, warm amber rim light, black void background, centered composition, square icon, no text",
        "is_limited": False,
    },
    {
        "relic_type": "named_echo_heart",
        "display_name": "Echo Heart",
        "tier": "rare",
        "family": "Memory",
        "lore_summary": "A jeweled pendant said to hold the last voices of a fallen kingdom.",
        "effect_profile": "Raises memory, echo, and persistence-themed outcomes.",
        "forge_bias": "memory",
        "battle_bias": "persistence",
        "icon_prompt": "soulslike item icon, echo heart pendant, cracked ruby heart set in gold frame, faint ghost silhouettes trapped inside, mournful halo, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
    {
        "relic_type": "named_ashen_crown",
        "display_name": "Ashen Crown",
        "tier": "rare",
        "family": "Fire",
        "lore_summary": "A soot-black crown worn by the last ruler of a burned dynasty.",
        "effect_profile": "Pushes regal, fire, and high-aggression outcomes.",
        "forge_bias": "fire",
        "battle_bias": "authority",
        "icon_prompt": "soulslike item icon, ashen crown, burnt gold diadem, soot and ember residue, broken regal spikes, faint smoke, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
    {
        "relic_type": "named_oath_lantern",
        "display_name": "Oath Lantern",
        "tier": "rare",
        "family": "Light",
        "lore_summary": "A lantern sealed with a knightly vow that never went out.",
        "effect_profile": "Biases paladin, guardian, and support outcomes.",
        "forge_bias": "light",
        "battle_bias": "protection",
        "icon_prompt": "soulslike item icon, oath lantern, iron lantern with sacred glass, warm white flame, engraved vow sigils, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
    {
        "relic_type": "named_grave_key_of_auralis",
        "display_name": "Grave Key of Auralis",
        "tier": "epic",
        "family": "Void",
        "lore_summary": "A black key said to unlock the crypt of an erased kingdom.",
        "effect_profile": "Biases death, curse, and grave-themed outcomes.",
        "forge_bias": "void",
        "battle_bias": "control",
        "icon_prompt": "soulslike item icon, grave key, ornate black key with bone handle, violet grave mist, tiny coffin-shaped motif, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text",
        "is_limited": False,
    },
]

_RELIC_INDEX = {row["relic_type"]: row for row in RELIC_CATALOG}


def get_relic_catalog():
    return deepcopy(RELIC_CATALOG)


def get_relic_definition(relic_type: str):
    definition = _RELIC_INDEX.get(relic_type)
    return deepcopy(definition) if definition else None


def get_low_tier_relic_types():
    return [
        row["relic_type"]
        for row in RELIC_CATALOG
        if row["tier"] == "common" and not row["is_limited"]
    ]
