from __future__ import annotations

from typing import Any, Dict, List

from db import get_connection, serialize_json


STARTER_SOURCE = "starter_deck_v1"


STARTER_IMAGE_URLS = [
    "/test/圣洁牧师.png",
    "/test/奥术法师.png",
    "/test/巫术武士.png",
    "/test/枪火游侠.png",
    "/test/自然射手.png",
    "/test/虚空术士.png",
    "/test/野蛮氏族.png",
    "/test/铁甲骑士.png",
]


def _skill(
    name: str,
    description: str,
    *,
    role: str,
    effect_type: str,
    type_catalog: str,
    type_effect: str,
    target: str,
    target_num: int = 1,
    range_mode: str = "enemy",
    dmg: int = 0,
    mp_cost: int = 0,
    buff_name: str = "",
    buff_time: int = 0,
    buff_hp: int = 0,
    buff_mp: int = 0,
    buff_dmg: int = 0,
    buff_cc: int = 0,
    buff_def: int = 0,
    buff_ev: int = 0,
    buff_ac: int = 0,
    buff_type_effect: str = "",
    is_stun: bool = False,
) -> Dict[str, Any]:
    return {
        "ROLE": role,
        "IS_PASSIVE": False,
        "name": name,
        "description": description,
        "TYPE": effect_type,
        "type_catalog": type_catalog,
        "type_effect": type_effect,
        "TARGET": target,
        "TARGET_NUM": str(target_num),
        "RANGE": range_mode,
        "IS_STUN": is_stun,
        "BUFF_TIME": str(buff_time),
        "BUFF_NAME": buff_name,
        "buff_type_effect": buff_type_effect,
        "DMG": str(dmg),
        "BUFF_HP": str(buff_hp),
        "BUFF_MP": str(buff_mp),
        "BUFF_DMG": str(buff_dmg),
        "BUFF_CC": str(buff_cc),
        "BUFF_DEF": str(buff_def),
        "BUFF_EV": str(buff_ev),
        "BUFF_AC": str(buff_ac),
        "MP_COST": str(mp_cost),
    }


def _card(
    name: str,
    template: str,
    bp: int,
    state: Dict[str, int | str],
    s1: Dict[str, Any],
    s2: Dict[str, Any],
    description: str,
) -> Dict[str, Any]:
    return {
        "name": name,
        "description": description,
        "extra": "Starter card. Balanced for early Arena, Vault, and Chronicle onboarding.",
        "BP": str(bp),
        "template": template,
        "state": {key: str(value) for key, value in state.items()},
        "skill": {"s1": s1, "s2": s2},
    }


STARTER_CARDS: List[Dict[str, Any]] = [
    _card(
        "Aurelia",
        "light priest",
        4300,
        {"HP": 2200, "MP": 760, "ATK": 178, "DEF": 44, "CC": 12, "SPEED": 82, "CA": 10, "PI": 8, "EV": 8, "AC": 8, "TYPE": "light priest", "type_catalog": "proj", "type_effect": "holy"},
        _skill("Lumen Spear", "Fires a narrow lance of consecrated light.", role="attack", effect_type="holy", type_catalog="proj", type_effect="holy", target="Enemy", range_mode="enemy", dmg=92, mp_cost=24),
        _skill("Tide of Grace", "Restores an ally with a bright water-lit blessing.", role="heal", effect_type="water", type_catalog="instant", type_effect="water", target="Ally", range_mode="ally", mp_cost=34, buff_name="heal", buff_time=2, buff_hp=180, buff_type_effect="heal"),
        "A support caster used to test holy projectiles and sustained healing effects.",
    ),
    _card(
        "Myrr",
        "arcane mage",
        4520,
        {"HP": 1880, "MP": 980, "ATK": 322, "DEF": 28, "CC": 21, "SPEED": 96, "CA": 18, "PI": 12, "EV": 8, "AC": 8, "TYPE": "arcane mage", "type_catalog": "proj", "type_effect": "magic"},
        _skill("Arcane Comet", "Launches a violet comet that blooms on contact.", role="attack", effect_type="magic", type_catalog="proj", type_effect="magic", target="Enemy", range_mode="enemy", dmg=124, mp_cost=30),
        _skill("Frost Prism", "Locks the target in a sudden burst of ice.", role="attack", effect_type="frost", type_catalog="instant", type_effect="frost", target="Enemy", range_mode="enemy", dmg=62, mp_cost=42, buff_name="frozen", buff_time=2, buff_ev=-10, buff_type_effect="frozen"),
        "A glass-cannon mage for testing magic missiles and frost control impact.",
    ),
    _card(
        "Kharos",
        "witchblade",
        5100,
        {"HP": 3020, "MP": 640, "ATK": 338, "DEF": 58, "CC": 19, "SPEED": 88, "CA": 16, "PI": 16, "EV": 8, "AC": 8, "TYPE": "witchblade", "type_catalog": "instant", "type_effect": "fire"},
        _skill("Witchflame Cut", "Carves the target with a short-lived blade of fire.", role="attack", effect_type="fire", type_catalog="instant", type_effect="fire", target="Enemy", range_mode="melee", dmg=96, mp_cost=26),
        _skill("Corrupting Sigil", "Brands the enemy and lowers their defenses.", role="attack", effect_type="dark", type_catalog="instant", type_effect="dark", target="Enemy", range_mode="enemy", dmg=44, mp_cost=36, buff_name="curse", buff_time=3, buff_def=-12, buff_type_effect="curse"),
        "A front-line spellblade built to test fire slashes and curse debuffs.",
    ),
    _card(
        "Vera",
        "gunsmoke ranger",
        3980,
        {"HP": 1960, "MP": 560, "ATK": 304, "DEF": 34, "CC": 28, "SPEED": 128, "CA": 22, "PI": 20, "EV": 8, "AC": 8, "TYPE": "gunsmoke ranger", "type_catalog": "proj", "type_effect": "bullet"},
        _skill("Deadeye Volley", "Fires a rapid line of gunshots into one target.", role="attack", effect_type="bullet", type_catalog="proj", type_effect="bullet", target="Enemy", range_mode="enemy", dmg=78, mp_cost=22),
        _skill("Point Blank Execute", "Steps in and detonates a close-range critical hit.", role="attack", effect_type="gun", type_catalog="instant", type_effect="bullet_hit", target="Enemy", range_mode="melee", dmg=148, mp_cost=40),
        "A fast ranged striker for testing bullets, muzzle trails, and critical hits.",
    ),
    _card(
        "Sylwen",
        "nature archer",
        3860,
        {"HP": 2040, "MP": 620, "ATK": 262, "DEF": 36, "CC": 20, "SPEED": 116, "CA": 14, "PI": 13, "EV": 8, "AC": 8, "TYPE": "nature archer", "type_catalog": "proj", "type_effect": "nature"},
        _skill("Briar Arrow", "Sends a thorned arrow that leaves a bleeding wound.", role="attack", effect_type="nature", type_catalog="proj", type_effect="nature", target="Enemy", range_mode="enemy", dmg=72, mp_cost=24, buff_name="wound", buff_time=2, buff_dmg=42, buff_type_effect="wound"),
        _skill("Venom Root", "Poisons and weakens the target with crawling roots.", role="attack", effect_type="poison", type_catalog="instant", type_effect="poison", target="Enemy", range_mode="enemy", dmg=38, mp_cost=32, buff_name="weakness", buff_time=2, buff_dmg=-28, buff_type_effect="weakness"),
        "A tempo archer for testing green projectiles, poison marks, and wound feedback.",
    ),
    _card(
        "Odran",
        "void warlock",
        4160,
        {"HP": 2320, "MP": 940, "ATK": 286, "DEF": 40, "CC": 17, "SPEED": 74, "CA": 15, "PI": 16, "EV": 8, "AC": 8, "TYPE": "void warlock", "type_catalog": "proj", "type_effect": "void"},
        _skill("Null Lance", "Throws a black lance that collapses into the target.", role="attack", effect_type="void", type_catalog="proj", type_effect="void", target="Enemy", range_mode="enemy", dmg=108, mp_cost=28),
        _skill("Grave Hex", "Places a long curse that erodes enemy resistance.", role="attack", effect_type="curse", type_catalog="instant", type_effect="dark", target="Enemy", range_mode="enemy", dmg=50, mp_cost=38, buff_name="curse", buff_time=3, buff_def=-14, buff_type_effect="curse"),
        "A curse specialist for testing void missiles and dark debuff persistence.",
    ),
    _card(
        "Brakka",
        "bloodtusk chieftain",
        4720,
        {"HP": 3480, "MP": 420, "ATK": 356, "DEF": 66, "CC": 22, "SPEED": 72, "CA": 20, "PI": 18, "EV": 6, "AC": 8, "TYPE": "bloodtusk chieftain", "type_catalog": "instant", "type_effect": "claw"},
        _skill("Rending Claw", "Tears through armor and leaves a visible wound.", role="attack", effect_type="flesh", type_catalog="instant", type_effect="claw", target="Enemy", range_mode="melee", dmg=88, mp_cost=24, buff_name="wound", buff_time=2, buff_dmg=54, buff_type_effect="wound"),
        _skill("Blood Banner", "Raises a brutal banner that empowers the next attacks.", role="buff", effect_type="buff", type_catalog="instant", type_effect="fire", target="Self", range_mode="self", mp_cost=30, buff_name="bless", buff_time=3, buff_dmg=48, buff_type_effect="bless"),
        "A bruiser used to test heavy flesh impacts, wounds, and party offense buffs.",
    ),
    _card(
        "Garran",
        "iron knight",
        4880,
        {"HP": 3720, "MP": 500, "ATK": 246, "DEF": 92, "CC": 14, "SPEED": 64, "CA": 12, "PI": 14, "EV": 8, "AC": 12, "TYPE": "iron knight", "type_catalog": "instant", "type_effect": "slash"},
        _skill("Shieldbreaker Slash", "Crushes the target with a blunt steel impact.", role="attack", effect_type="weapon", type_catalog="instant", type_effect="blunt", target="Enemy", range_mode="melee", dmg=84, mp_cost=22),
        _skill("Storm Oath", "Calls a short thunder impact that can stun the target.", role="attack", effect_type="thunder", type_catalog="instant", type_effect="thunder", target="Enemy", range_mode="enemy", dmg=56, mp_cost=38, buff_name="stun", buff_time=1, buff_type_effect="stun", is_stun=True),
        "A defensive knight for testing weapon impacts, thunder strikes, and stun states.",
    ),
]


def seed_starter_cards(user_id) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (user_id,))
            cur.execute("SELECT count(*) AS count FROM heroes WHERE user_id = %s", (user_id,))
            if int(cur.fetchone()["count"]) > 0:
                conn.commit()
                return 0

            for index, card in enumerate(STARTER_CARDS):
                cur.execute(
                    """
                    INSERT INTO heroes (user_id, source_payload, hero_payload)
                    VALUES (%s, %s::jsonb, %s::jsonb)
                    """,
                    (
                        user_id,
                        serialize_json(
                            {
                                "source": STARTER_SOURCE,
                                "starter_index": index,
                                "image_url": STARTER_IMAGE_URLS[index],
                            }
                        ),
                        serialize_json(card),
                    ),
                )
        conn.commit()
    return len(STARTER_CARDS)
