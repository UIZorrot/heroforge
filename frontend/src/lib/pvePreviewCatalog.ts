import type { PveCatalog } from './pveTypes';

export const pvePreviewCatalog: PveCatalog = {
  "theme": "void_labyrinth",
  "name": "Void Labyrinth",
  "contentVersion": "void-labyrinth-v1-prototype-1",
  "prototype": true,
  "tiers": [
    {
      "id": "threshold",
      "name": "The Fading Lantern",
      "recommended_team_bp": 1000,
      "honor_bp_band": [
        900,
        1100
      ],
      "ratios": [
        72,
        78,
        82,
        84,
        88,
        92,
        100,
        105
      ]
    },
    {
      "id": "reflection",
      "name": "Hall of Reflections",
      "recommended_team_bp": 5000,
      "honor_bp_band": [
        4500,
        5500
      ],
      "ratios": [
        82,
        90,
        94,
        96,
        100,
        104,
        112,
        120
      ]
    },
    {
      "id": "heart",
      "name": "The Lightless Heart",
      "recommended_team_bp": 10000,
      "honor_bp_band": [
        9000,
        11000
      ],
      "ratios": [
        92,
        100,
        104,
        108,
        112,
        116,
        122,
        130
      ]
    }
  ],
  "nodes": [
    {
      "id": "N1",
      "name": "Gate of Lost Names",
      "kind": "battle",
      "next": [
        "N2"
      ]
    },
    {
      "id": "N2",
      "name": "Mirror Fork",
      "kind": "battle",
      "variants": [
        "A",
        "B"
      ],
      "next": [
        "N3"
      ]
    },
    {
      "id": "N3",
      "name": "Forgotten Tablets",
      "kind": "battle",
      "next": [
        "N4"
      ]
    },
    {
      "id": "N4",
      "name": "Lantern Rest",
      "kind": "camp",
      "next": [
        "N5"
      ]
    },
    {
      "id": "N5",
      "name": "Twin Archive",
      "kind": "battle",
      "next": [
        "N6"
      ]
    },
    {
      "id": "N6",
      "name": "Broken Causeway",
      "kind": "battle",
      "variants": [
        "A",
        "B"
      ],
      "next": [
        "N7"
      ]
    },
    {
      "id": "N7",
      "name": "Lost Chamber",
      "kind": "battle",
      "next": [
        "N8"
      ]
    },
    {
      "id": "N8",
      "name": "Oathbound Gate",
      "kind": "elite",
      "next": [
        "N9"
      ]
    },
    {
      "id": "N9",
      "name": "Silent Refuge",
      "kind": "camp",
      "next": [
        "N10"
      ]
    },
    {
      "id": "N10",
      "name": "Rift Core",
      "kind": "boss",
      "next": []
    }
  ],
  "entryCost": 0,
  "bestiary": [
    {
      "id": "sentinel",
      "name": "Basalt Maw",
      "role": "Frontline guardian",
      "lore": "A forgotten gate learned to hunger. Gold seals bind the stone around its enormous mouth.",
      "tactic": "Its carapace raises DEF by 3 for two rounds. Remove it to expose the creature behind it."
    },
    {
      "id": "leech",
      "name": "Mnemonic Leech",
      "role": "Poison parasite",
      "lore": "Names drift inside its translucent body. Every new segment contains a memory stolen from a traveller.",
      "tactic": "Its bite applies poison for two rounds. Manage damage over time before the next encounter."
    },
    {
      "id": "archer",
      "name": "Mirror Stalker",
      "role": "Ranged hunter",
      "lore": "A six-limbed predator of smoked glass. Its own ribs bend into a bow, strung with stolen light.",
      "tactic": "Its charged shot deals 1.2\u00d7 ATK and prioritizes the highest-ATK legal target."
    },
    {
      "id": "scribe",
      "name": "Palimpsest Oracle",
      "role": "Healer",
      "lore": "A moth of vellum and bone folds the names of the dead into an endless, broken book.",
      "tactic": "Heals its living ally with the lowest HP ratio. It cannot resurrect; eliminate it before attrition wins."
    },
    {
      "id": "weaver",
      "name": "Whisper Brood",
      "role": "Curse caster",
      "lore": "Blank stone faces hang from its silk. Behind them, a ring of eyes watches names unravel.",
      "tactic": "Its curse reduces a target's ATK for two rounds. Watch the intent display and focus it down."
    },
    {
      "id": "harrier",
      "name": "Rift Hound",
      "role": "Executioner",
      "lore": "A lean, eyeless hound prowls between broken corridors. Its split jaw opens directly into the void.",
      "tactic": "Its lunge deals 1.2\u00d7 ATK and prioritizes the legal target with the lowest HP ratio."
    },
    {
      "id": "warden",
      "name": "Oathbound Colossus",
      "role": "Elite gatekeeper",
      "lore": "The last oath of the temple survives inside a stone beast. A chained cathedral door seals its chest.",
      "tactic": "Charges, releases, then recovers. Stun during the charge; its tier-specific targets and damage are visible."
    },
    {
      "id": "boss",
      "name": "Nameless Weaver",
      "role": "Labyrinth sovereign",
      "lore": "An immense crown floats around a hollow face. Beneath it, tendrils slowly unpick the names that hold the world together.",
      "tactic": "Stun its wind-up or destroy its anchors. Marked targets stay locked; the ritual spends MP once, then enters recovery."
    },
    {
      "id": "anchor",
      "name": "Void Anchor",
      "role": "Ritual mechanism",
      "lore": "Black stone ribs surround an absence. Broken gold rings keep the missing piece of the world in place.",
      "tactic": "Never attacks or regenerates by waiting. Destroy anchors to change the Boss ritual's displayed range and effects."
    }
  ],
  "rewardPolicy": "First clears are recorded. Dust and cosmetic rewards are not available in this version.",
  "encounters": [
    {
      "tier": "threshold",
      "node": "N1",
      "variant": "default",
      "enemyTotalBp": 720,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Rift Hound",
          "slot": 2,
          "role": "harrier"
        }
      ]
    },
    {
      "tier": "threshold",
      "node": "N2",
      "variant": "A",
      "enemyTotalBp": 780,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Mirror Stalker",
          "slot": 3,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "threshold",
      "node": "N2",
      "variant": "B",
      "enemyTotalBp": 780,
      "enemies": [
        {
          "name": "Rift Hound",
          "slot": 0,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 2,
          "role": "harrier"
        }
      ]
    },
    {
      "tier": "threshold",
      "node": "N3",
      "variant": "default",
      "enemyTotalBp": 820,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 1,
          "role": "sentinel"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 3,
          "role": "leech"
        },
        {
          "name": "Whisper Brood",
          "slot": 5,
          "role": "weaver"
        }
      ]
    },
    {
      "tier": "threshold",
      "node": "N5",
      "variant": "default",
      "enemyTotalBp": 840,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 3,
          "role": "scribe"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "threshold",
      "node": "N6",
      "variant": "A",
      "enemyTotalBp": 880,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 1,
          "role": "sentinel"
        },
        {
          "name": "Whisper Brood",
          "slot": 3,
          "role": "weaver"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 5,
          "role": "leech"
        }
      ]
    },
    {
      "tier": "threshold",
      "node": "N6",
      "variant": "B",
      "enemyTotalBp": 880,
      "enemies": [
        {
          "name": "Rift Hound",
          "slot": 0,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 2,
          "role": "harrier"
        }
      ]
    },
    {
      "tier": "threshold",
      "node": "N7",
      "variant": "default",
      "enemyTotalBp": 920,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 1,
          "role": "sentinel"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 3,
          "role": "leech"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "threshold",
      "node": "N8",
      "variant": "default",
      "enemyTotalBp": 1000,
      "enemies": [
        {
          "name": "Oathbound Colossus",
          "slot": 1,
          "role": "warden"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 4,
          "role": "scribe"
        }
      ]
    },
    {
      "tier": "threshold",
      "node": "N10",
      "variant": "default",
      "enemyTotalBp": 1050,
      "enemies": [
        {
          "name": "Nameless Weaver",
          "slot": 1,
          "role": "boss"
        },
        {
          "name": "Void Anchor",
          "slot": 3,
          "role": "anchor"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N1",
      "variant": "default",
      "enemyTotalBp": 4100,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Mirror Stalker",
          "slot": 3,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N2",
      "variant": "A",
      "enemyTotalBp": 4500,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Mirror Stalker",
          "slot": 3,
          "role": "archer"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N2",
      "variant": "B",
      "enemyTotalBp": 4500,
      "enemies": [
        {
          "name": "Rift Hound",
          "slot": 0,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 2,
          "role": "harrier"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 3,
          "role": "leech"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N3",
      "variant": "default",
      "enemyTotalBp": 4700,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 1,
          "role": "sentinel"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 3,
          "role": "leech"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 4,
          "role": "leech"
        },
        {
          "name": "Whisper Brood",
          "slot": 5,
          "role": "weaver"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N5",
      "variant": "default",
      "enemyTotalBp": 4800,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 3,
          "role": "scribe"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N6",
      "variant": "A",
      "enemyTotalBp": 5000,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 1,
          "role": "sentinel"
        },
        {
          "name": "Whisper Brood",
          "slot": 3,
          "role": "weaver"
        },
        {
          "name": "Whisper Brood",
          "slot": 5,
          "role": "weaver"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 4,
          "role": "leech"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N6",
      "variant": "B",
      "enemyTotalBp": 5000,
      "enemies": [
        {
          "name": "Rift Hound",
          "slot": 0,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 2,
          "role": "harrier"
        },
        {
          "name": "Mirror Stalker",
          "slot": 3,
          "role": "archer"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 5,
          "role": "leech"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N7",
      "variant": "default",
      "enemyTotalBp": 5200,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 1,
          "role": "sentinel"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 3,
          "role": "leech"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 4,
          "role": "scribe"
        },
        {
          "name": "Whisper Brood",
          "slot": 5,
          "role": "weaver"
        },
        {
          "name": "Mirror Stalker",
          "slot": 0,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N8",
      "variant": "default",
      "enemyTotalBp": 5600,
      "enemies": [
        {
          "name": "Oathbound Colossus",
          "slot": 1,
          "role": "warden"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 3,
          "role": "scribe"
        },
        {
          "name": "Whisper Brood",
          "slot": 5,
          "role": "weaver"
        }
      ]
    },
    {
      "tier": "reflection",
      "node": "N10",
      "variant": "default",
      "enemyTotalBp": 6000,
      "enemies": [
        {
          "name": "Nameless Weaver",
          "slot": 1,
          "role": "boss"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Void Anchor",
          "slot": 3,
          "role": "anchor"
        },
        {
          "name": "Void Anchor",
          "slot": 5,
          "role": "anchor"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N1",
      "variant": "default",
      "enemyTotalBp": 9200,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Mirror Stalker",
          "slot": 3,
          "role": "archer"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N2",
      "variant": "A",
      "enemyTotalBp": 10000,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 1,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Mirror Stalker",
          "slot": 3,
          "role": "archer"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        },
        {
          "name": "Whisper Brood",
          "slot": 4,
          "role": "weaver"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N2",
      "variant": "B",
      "enemyTotalBp": 10000,
      "enemies": [
        {
          "name": "Rift Hound",
          "slot": 0,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 2,
          "role": "harrier"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 3,
          "role": "leech"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 4,
          "role": "leech"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N3",
      "variant": "default",
      "enemyTotalBp": 10400,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 3,
          "role": "leech"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 5,
          "role": "leech"
        },
        {
          "name": "Whisper Brood",
          "slot": 4,
          "role": "weaver"
        },
        {
          "name": "Mirror Stalker",
          "slot": 1,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N5",
      "variant": "default",
      "enemyTotalBp": 10800,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 3,
          "role": "scribe"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 5,
          "role": "scribe"
        },
        {
          "name": "Mirror Stalker",
          "slot": 4,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N6",
      "variant": "A",
      "enemyTotalBp": 11200,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Whisper Brood",
          "slot": 3,
          "role": "weaver"
        },
        {
          "name": "Whisper Brood",
          "slot": 5,
          "role": "weaver"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 4,
          "role": "leech"
        },
        {
          "name": "Mirror Stalker",
          "slot": 1,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N6",
      "variant": "B",
      "enemyTotalBp": 11200,
      "enemies": [
        {
          "name": "Rift Hound",
          "slot": 0,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 1,
          "role": "harrier"
        },
        {
          "name": "Rift Hound",
          "slot": 2,
          "role": "harrier"
        },
        {
          "name": "Mirror Stalker",
          "slot": 3,
          "role": "archer"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 4,
          "role": "leech"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N7",
      "variant": "default",
      "enemyTotalBp": 11600,
      "enemies": [
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Mnemonic Leech",
          "slot": 3,
          "role": "leech"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 4,
          "role": "scribe"
        },
        {
          "name": "Whisper Brood",
          "slot": 5,
          "role": "weaver"
        },
        {
          "name": "Mirror Stalker",
          "slot": 1,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N8",
      "variant": "default",
      "enemyTotalBp": 12200,
      "enemies": [
        {
          "name": "Oathbound Colossus",
          "slot": 1,
          "role": "warden"
        },
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 3,
          "role": "scribe"
        },
        {
          "name": "Whisper Brood",
          "slot": 4,
          "role": "weaver"
        },
        {
          "name": "Mirror Stalker",
          "slot": 5,
          "role": "archer"
        }
      ]
    },
    {
      "tier": "heart",
      "node": "N10",
      "variant": "default",
      "enemyTotalBp": 13000,
      "enemies": [
        {
          "name": "Nameless Weaver",
          "slot": 1,
          "role": "boss"
        },
        {
          "name": "Basalt Maw",
          "slot": 0,
          "role": "sentinel"
        },
        {
          "name": "Basalt Maw",
          "slot": 2,
          "role": "sentinel"
        },
        {
          "name": "Void Anchor",
          "slot": 3,
          "role": "anchor"
        },
        {
          "name": "Void Anchor",
          "slot": 5,
          "role": "anchor"
        },
        {
          "name": "Palimpsest Oracle",
          "slot": 4,
          "role": "scribe"
        }
      ]
    }
  ]
};
