import base64
import hashlib
import json
import logging
import os
import secrets
import threading
from functools import wraps
from datetime import date, datetime, timezone
from uuid import UUID
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
from openai import OpenAI

from auth import (
    create_agent_api_key,
    create_login_code,
    get_principal_from_token,
    list_agent_api_keys,
    revoke_agent_api_key,
    revoke_session,
    verify_login_code,
)
from config import get_settings
from db import (
    adjust_dust_balance,
    adjust_relic_balance,
    execute,
    fetch_all,
    fetch_one,
    get_connection,
    get_recent_resource_transactions,
    get_user_relics,
    get_user_wallet,
    ensure_user_wallet,
    initialize_schema,
    serialize_json,
)
from relic_catalog import get_low_tier_relic_types, get_relic_catalog, get_relic_definition
from market_logic import build_market_board_snapshot, is_market_purchasable, relic_market_quote
from utils import extract_json
from game_logic import adjust_based_on_bp
from battle_logic import run_auto_duel, run_team_duel
import battle_sessions

settings = get_settings()
PVP_SESSION_SETTLEMENT_LOCK = threading.RLock()
PVP_BATTLE_SESSION_IDS: set[str] = set()
FRIEND_BATTLE_SESSION_IDS: dict[str, str] = {}
PREPARED_BATTLE_HISTORY_IDS: set[str] = set()
BATTLE_HISTORY_LIMIT = 25

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

_database_init_error = None
try:
    initialize_schema()
except Exception as exc:
    _database_init_error = exc
    logging.exception("Database schema initialization skipped or failed")

class _LlmTextResponse:
    def __init__(self, text: str):
        self.text = text


class OpenAICompatibleModel:
    """OpenAI-compatible chat client used for forge vision + text steps."""

    def __init__(self, client: OpenAI, model_name: str, provider: str):
        self._client = client
        self._model_name = model_name
        self.provider = provider

    def generate_content(self, contents, **kwargs):
        del kwargs  # Gemini-era kwargs are ignored for OpenAI-compatible calls.
        messages = self._to_messages(contents)
        response = self._client.chat.completions.create(
            model=self._model_name,
            messages=messages,
            # Both forge prompts ask for JSON; enforce it at the API level so a
            # chatty reply cannot slip past extract_json.
            response_format={"type": "json_object"},
        )
        choice = response.choices[0].message if response.choices else None
        text = (choice.content or "") if choice else ""
        return _LlmTextResponse(text)

    def _to_messages(self, contents):
        if isinstance(contents, str):
            return [{"role": "user", "content": contents}]

        if not isinstance(contents, (list, tuple)):
            raise TypeError(f"Unsupported LLM contents type: {type(contents)!r}")

        parts = []
        for item in contents:
            if isinstance(item, str):
                parts.append({"type": "text", "text": item})
            elif isinstance(item, dict) and item.get("type") == "image_png_base64":
                data_url = f"data:image/png;base64,{item['data']}"
                parts.append({"type": "image_url", "image_url": {"url": data_url}})
            else:
                raise TypeError(f"Unsupported LLM content part: {type(item)!r}")
        return [{"role": "user", "content": parts}]


def _build_forge_llm() -> OpenAICompatibleModel | None:
    if settings.openai_api_key:
        client = OpenAI(api_key=settings.openai_api_key, base_url=settings.openai_base_url)
        logging.info(
            "Forge LLM provider=openai model=%s base_url=%s",
            settings.openai_model,
            settings.openai_base_url,
        )
        return OpenAICompatibleModel(client, settings.openai_model, "openai")

    if settings.kimi_api_key:
        client = OpenAI(api_key=settings.kimi_api_key, base_url=settings.kimi_base_url)
        logging.info(
            "Forge LLM provider=kimi model=%s base_url=%s",
            settings.kimi_model,
            settings.kimi_base_url,
        )
        return OpenAICompatibleModel(client, settings.kimi_model, "kimi")

    return None


forge_llm = _build_forge_llm()
model_vision = forge_llm
model_text = forge_llm
LLM_MODEL_NAME = forge_llm._model_name if forge_llm else ""
if forge_llm is None:
    logging.warning("OPENAI_API_KEY/KIMI_API_KEY is not configured; /api/forge will be unavailable")

P1_PROMPT = """
You are a battle power judgment robot, and your task is to evaluate the battle power of a given character.
Below is a reference battle power level standard:

Human: 100
Beast (Tiger, Lion): 200
Monsters (Minotaur, Scorpion-tail Lion, Centaur, etc.): 500
Elite Humans (Robin Hood, Zorro): 500
Heroic (Space Marines, Master Chief, Father Anderson, Alien from Sci-Fi works, Predator): 1000
Demons (Diablo Mephisto, Hydra from Greek Mythology): 2000
Legends (Tassadar, Hulk): 3000
Demigods (Dracula, Superman, Alucard, Four Horsemen of the Apocalypse, Lich King): 5000
Near Gods (Warhammer 40k Primarchs, Loki, Thor, Artemis, Kratos): 10000
Gods (Satan, Warhammer 40k Emperor, The Hand of God from Berserk, Tyrant, Odin, Zeus): 20000

Next, I will upload an image. Please

- analyze the character's origins and background
- determine the character's battle power BP level, very carefully and as detailed as possible.
- based to the description of BP level standard, modified the final battle power BP for about [80% - 120%].

finally, output the results in JSON format:

{
    "name": "<Character Name>",
    "description": "<Character Description>",
    "extra": "<Character Extra Background>",
    "BP": "<Battle Power>"
}
"""

P2_PROMPT = """
you are a game design expert in a turn-based card game.
You need to evaluate the character's core attributes and design [skill] based on their [name], [descriptions], and battle power [BP].

Rules:

[State Weights]
You must NOT output absolute attribute values. Instead, you must allocate a rating weight from 1 to 10 for each attribute based on the character's origins and traits.
1 means extremely weak/low priority, 10 means extremely strong/highest priority.
"HP": <1-10>,
"MP": <1-10>,
"ATK": <1-10>, (Physical or Magical attack aptitude)
"DEF": <1-10>, (Armor, toughness)
"CC": <1-10>, (Crit Rate tendency)
"SPEED": <1-10>, (determines who acts first)
"CA": <1-10>, (Crit Damage multiplier)
"PI": <1-10>, (Armor Penetration)
"EV": <1-10>, (Evasion & Agility)
"AC": <1-10>, (Accuracy)
"TYPE": "<Attack Effect Type>" (choose ONE: flesh, magic, thunder, weapon, gun, fire, poison, frost, dark, light, nature, water)

[SKILL]
choose 2 from 3 options for the character:
- Attack Skill
- Buff Skill
- Defense Skill

"DMG_RATE": <0.5 to 3.0> (Damage multiplier. 0.5 is low damage, 3.0 is a nuke)
"MP_COST_RATE": <1, 2, or 3> (1: Low MP cost ~10%, 2: Medium ~20%, 3: High/Ultimate ~30%)

[Buff]:
Debuffs (negative effects):
(stun): Stuns the enemy for one turn
(frozen): Decreases enemy speed, accuracy and evasion
(poison): Deals X damage to the enemy at the start of each turn
(wound): Deals X bleeding damage to the enemy at the start of each turn
(burn): Deals X fire damage to the enemy at the start of each turn
(curse): Reduces enemy attack and defense by X

Buffs (positive effects):
(heal): Restores X HP at the start of each turn
(pray): Increases attack, defense and speed by X

All statuses must specify how many turns they last, except for stun (which lasts 1 turn).
Choose 2 out of 3 skills based on the character’s traits and design them.

output the data in JSON format exactly like this:

{
"name": "<Character Name>",
"description": "<Character Description>",
"BP": "<Original Battle Power>",
"state_weights": {
    "HP": <1-10>,
    "MP": <1-10>,
    "ATK": <1-10>,
    "DEF": <1-10>,
    "CC": <1-10>,
    "SPEED": <1-10>,
    "CA": <1-10>,
    "PI": <1-10>,
    "EV": <1-10>,
    "AC": <1-10>,
    "TYPE": "<Attack Type>"
},
"skill": {
    "s1": {
        "name": "<Skill Name>",
        "description": "<Skill Description>",
        "TYPE": "<Effect Type>",
        "DMG_RATE": <Rate>,
        "TARGET": "<Self/ally/Enemy>",
        "TARGET_NUM": "<How many unit will be targeted>",
        "BUFF_HP": "<Continuous HP Damage or Heal>",
        "BUFF_DMG": "<Continuous Attack Buff>",
        "BUFF_CC": "<Continuous Crit Rate Buff>",
        "BUFF_MP": "<Continuous MP Buff>",
        "BUFF_DEF": "<Continuous Defense Buff>",
        "BUFF_EV": "<Continuous Evasion Buff>",
        "BUFF_AC": "<Continuous Accuracy Buff>",
        "IS_STUN": "<True or False>",
        "MP_COST_RATE": <1, 2, or 3>,
        "BUFF_TIME": "<Duration of Buff/Debuff>",
        "BUFF_NAME": "<stun, frozen, poison, wound, burn, curse, heal, pray>"
    },
    "s2": { ...same structure as s1... }
}
}
"""

P2_PROMPT_V2 = """
You are the backend LLM stage for a turn-based card game.
Your job is to decide structure and priorities only. Do not finalize numeric values.

This backend is split into two stages:
1. LLM stage: choose the character name, description, BP, a stat template, stat weights, and the skill structure.
2. Numeric generator stage: a pure rule-based generator with no AI. It will convert the weights and 0/1 markers into final numbers.

Stat templates:
knight, paladin, warrior, berserker, assassin, rogue, mage, sorcerer, cleric, ranger, sniper, tank, guardian, summoner

Rules:

[Attack Type Visual Guide]
TYPE drives the battle VFX, so choose it from the character's visual identity and lore, not from the stat profile.
"weapon" and "flesh" are melee types (instant close-range hit effects on the target); every other type fires a visible projectile across the board.

- flesh: unarmed bestial melee — claws, fangs, bites, tail swipes. Visual: crimson claw-mark slashes. Typical: beasts, monsters, werewolves, brawlers, feral mutants.
- weapon: armed melee — swords, axes, hammers, spears, daggers. Visual: steel-white strike slash with metal sparks. Typical: knights, warriors, assassins, duelists, gladiators.
- fire: burning projectile — fireballs, flame waves, magma. Visual: red-orange fire trail ending in an ember burst. Typical: pyromancers, fire dragons, flame demons, phoenixes.
- frost: freezing projectile — ice lances, frost bolts, hail. Visual: pale-blue crystalline bolt ending in a freezing burst. Typical: ice mages, winter spirits, frost giants, yetis.
- thunder: lightning projectile — thunderbolts, storm lances. Visual: violet-blue electric bolt with a storm flash. Typical: storm callers, lightning elementals, thunder gods, tesla-engineered machines.
- magic: pure arcane projectile — mana bolts, arcane comets, runes. Visual: violet arcane comet with a runic glyph burst. Typical: wizards, sorcerers, warlocks, and any spellcaster without a specific elemental affinity.
- poison: venomous projectile — poison spit, toxic darts, acid spray. Visual: toxic green bolt ending in a spore burst. Typical: snakes, spiders, scorpions, plague doctors, venom rogues, alchemists.
- dark: shadow projectile — void orbs, curses, soul siphons. Visual: purple-black void orb with soul wisps. Typical: necromancers, demons, shadow assassins, cultists, liches, void entities.
- light: holy projectile — radiant spears, sacred beams, consecrated light. Visual: golden-white lance with a halo burst. Typical: paladins, priests, angels, sun deities, holy crusaders.
- nature: living projectile — thorn volleys, vines, spores, briars. Visual: verdant green bolt with leaves and thorns. Typical: druids, treants, dryads, fae, rangers channeling living magic.
- water: water projectile — water jets, tidal bolts, crushing waves. Visual: azure water bolt with a bubble burst. Typical: sea creatures, sirens, water mages, krakens, tide spirits.
- gun: firearm projectile — bullets, shells, cannon shot. Visual: tracer round with muzzle flash and a bullet-impact hit. Typical: gunners, snipers, musketeers, cowboys, artillery mechs.

Pick exactly ONE type for the character's basic attack (state_weights.TYPE). Each skill has its own TYPE from the same list; a skill may differ from the basic attack when its fiction says so (a fire mage can have a frost prison skill). Never invent new types.

[State Weights]
Output weights from 1 to 10 for each stat.
1 means very low priority, 10 means the highest priority.
"HP": <1-10>,
"MP": <1-10>,
"ATK": <1-10>,
"DEF": <1-10>,
"CC": <1-10>,
"SPEED": <1-10>,
"CA": <1-10>,
"PI": <1-10>,
"EV": <1-10>,
"AC": <1-10>,
"TYPE": "<Attack Type>" (choose ONE canonical type from the Attack Type Visual Guide: flesh, magic, thunder, weapon, gun, fire, poison, frost, dark, light, nature, water)

[SKILL]
Choose 2 out of 3 skill roles for the character:
- Attack Skill
- Buff Skill
- Defense Skill

For every numeric effect field below, output only 0 or 1:
0 = the effect does not exist.
1 = the backend numeric generator should create the final value.

The skill object must include:
"ROLE": "<attack|buff|defense>",
"IS_PASSIVE": <true or false>,
"name": "<Skill Name>",
"description": "<Skill Description>",
"TYPE": "<Effect Type>" (ONE canonical type from the Attack Type Visual Guide; it decides this skill's VFX and may differ from the basic attack type),
"TARGET": "<Self|Ally|Enemy>" (who the skill affects: Self = the caster, Ally = your own team, Enemy = the opposing team),
"TARGET_NUM": <integer 1-6> (how many units are hit; 1 for single-target strikes, 2-3 for cleaves and volleys, more only for true area attacks),
"RANGE": "<melee|ranged|self|ally|enemy>" (melee = close-quarters hit, ranged/enemy = projectile across the board, self/ally = cast on your own side; keep it consistent with TARGET),
"IS_STUN": <true or false>,
"BUFF_TIME": <turn count, 0 if the effect does not exist>,
"BUFF_NAME": "<stun, frozen, poison, wound, burn, curse, heal, pray>",
"DMG": <0 or 1>,
"BUFF_HP": <0 or 1>,
"BUFF_MP": <0 or 1>,
"BUFF_DMG": <0 or 1>,
"BUFF_CC": <0 or 1>,
"BUFF_DEF": <0 or 1>,
"BUFF_EV": <0 or 1>,
"BUFF_AC": <0 or 1>

Do not output final numeric magnitudes, MP cost, damage multipliers, or cooldowns.
The backend generator will decide all of those values.

Combat contract:
- TARGET_NUM counts affected living units, including the selected primary target.
- Ally includes the caster. Self always affects only the caster.
- IS_PASSIVE means an opening passive: it triggers once after battle preparation,
  costs no MP or action, and cannot be manually cast. Generate support passives
  with TARGET Self or Ally, DMG 0, IS_STUN false, and a named timed status.
- Named healing and damage-over-time statuses first tick at the next round start.
- Prayer and curse modify exactly the marked stat fields; do not describe an
  unmarked stat as changing. Frozen uses BUFF_EV for slow/evasion and BUFF_AC for accuracy.
- Stun duration counts skipped actions. Do not invent resurrection, summoning,
  cleansing, shields, or cooldowns: those mechanics are not implemented yet.

Output JSON exactly in this format:
{
  "name": "<Character Name>",
  "description": "<Character Description>",
  "BP": "<Original Battle Power>",
"template": "<knight|paladin|warrior|berserker|assassin|rogue|mage|sorcerer|cleric|ranger|sniper|tank|guardian|summoner>",
  "state_weights": {
    "HP": <1-10>,
    "MP": <1-10>,
    "ATK": <1-10>,
    "DEF": <1-10>,
    "CC": <1-10>,
    "SPEED": <1-10>,
    "CA": <1-10>,
    "PI": <1-10>,
    "EV": <1-10>,
    "AC": <1-10>,
    "TYPE": "<Attack Type>"
  },
  "skill": {
    "s1": {
      "ROLE": "<attack|buff|defense>",
      "IS_PASSIVE": <true or false>,
      "name": "<Skill Name>",
      "description": "<Skill Description>",
      "TYPE": "<Effect Type>",
      "TARGET": "<Self/ally/Enemy>",
      "TARGET_NUM": "<How many units will be targeted>",
      "RANGE": "<melee|ranged|self|ally|enemy>",
      "IS_STUN": <true or false>,
      "BUFF_TIME": <0 or a turn count>,
      "BUFF_NAME": "<stun, frozen, poison, wound, burn, curse, heal, pray>",
      "DMG": <0 or 1>,
      "BUFF_HP": <0 or 1>,
      "BUFF_MP": <0 or 1>,
      "BUFF_DMG": <0 or 1>,
      "BUFF_CC": <0 or 1>,
      "BUFF_DEF": <0 or 1>,
      "BUFF_EV": <0 or 1>,
      "BUFF_AC": <0 or 1>
    },
    "s2": { ...same structure as s1... }
  }
}
"""

def _image_part_from_base64(image_base64: str):
    image_bytes = base64.b64decode(image_base64)
    image = Image.open(io.BytesIO(image_bytes))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    return {"type": "image_png_base64", "data": encoded}


def get_bearer_token():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return request.headers.get("X-Session-Token", "").strip() or None


def current_user():
    cached = getattr(request, "current_user", None)
    if cached:
        return cached
    return get_principal_from_token(get_bearer_token())


def _agent_scope_for_request():
    path = request.path
    method = request.method.upper()
    if method == "GET" and path == "/api/me/heroes":
        return "collection:read"
    if method == "GET" and path == "/api/me/economy":
        return "economy:read"
    if path in {"/api/pvp/join", "/api/pvp/cancel", "/api/economy/pvp-entry"} and method == "POST":
        return "arena:queue"
    if path.startswith("/api/pvp/entries/") and method in {"GET", "DELETE", "POST"}:
        return "arena:queue"
    if path in {"/api/battle", "/api/battle/team"} and method == "POST":
        return "battle:create"
    if path == "/api/battle/sessions" and method == "POST":
        return "battle:create"
    if path.startswith("/api/battle/sessions/") and method == "GET":
        return "battle:read"
    if path.startswith("/api/battle/sessions/") and path.endswith(("/actions", "/confirm")) and method == "POST":
        return "battle:act"
    if method == "GET" and path == "/api/me/battles":
        return "battle:read"
    return None


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        if user.get("auth_type") == "agent_key":
            required_scope = _agent_scope_for_request()
            if not required_scope or required_scope not in user.get("scopes", []):
                return jsonify({"error": "This Agent key is not allowed to access this endpoint"}), 403
        request.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def session_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        if user.get("auth_type") != "session":
            return jsonify({"error": "A browser session is required for this account feature"}), 403
        request.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def save_hero_history(user, source_payload, hero_payload):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO heroes (user_id, source_payload, hero_payload)
                VALUES (%s, %s::jsonb, %s::jsonb)
                RETURNING id
                """,
                (user["id"] if user else None, serialize_json(source_payload), serialize_json(hero_payload)),
            )
            row = cur.fetchone()
        conn.commit()
        return row


def save_hero_generation_history(
    user,
    source_payload,
    llm_payload,
    generator_payload,
    template=None,
    bp_requested=None,
    bp_final=None,
    model_name=None,
    prompt_version=None,
    source_image_hash=None,
    source_image_url=None,
    status="completed",
    error=None,
):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO hero_generations (
                    user_id, source_payload, llm_payload, generator_payload,
                    template, bp_requested, bp_final, model_name, prompt_version,
                    source_image_hash, source_image_url, status, error
                )
                VALUES (%s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id, created_at
                """,
                (
                    user["id"] if user else None,
                    serialize_json(source_payload),
                    serialize_json(llm_payload),
                    serialize_json(generator_payload),
                    template,
                    bp_requested,
                    bp_final,
                    model_name,
                    prompt_version,
                    source_image_hash,
                    source_image_url,
                    status,
                    error,
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return row


def save_battle_history(user, battle_type, payload, result):
    def _coerce_uuid(value):
        if not isinstance(value, str):
            return None
        try:
            return str(UUID(value))
        except Exception:
            return None

    participants = []
    hero_a = payload.get("heroA")
    hero_b = payload.get("heroB")
    team_a = payload.get("teamA")
    team_b = payload.get("teamB")

    if isinstance(hero_a, dict):
        participants.append(("A", 0, hero_a))
    if isinstance(hero_b, dict):
        participants.append(("B", 0, hero_b))

    if isinstance(team_a, list):
        for index, hero in enumerate(team_a):
            if isinstance(hero, dict):
                participants.append(("A", index, hero))
    if isinstance(team_b, list):
        for index, hero in enumerate(team_b):
            if isinstance(hero, dict):
                participants.append(("B", index, hero))

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO battles (user_id, battle_type, payload, result)
                VALUES (%s, %s, %s::jsonb, %s::jsonb)
                RETURNING id, created_at
                """,
                (
                    user["id"] if user else None,
                    battle_type,
                    serialize_json(payload),
                    serialize_json(result),
                ),
            )
            battle_row = cur.fetchone()
            battle_id = battle_row["id"] if battle_row else None

            for side, slot_index, snapshot in participants:
                cur.execute(
                    """
                    INSERT INTO battle_participants (battle_id, side, slot_index, hero_id, hero_snapshot)
                    VALUES (%s, %s, %s, %s, %s::jsonb)
                    ON CONFLICT (battle_id, side, slot_index) DO UPDATE
                    SET hero_id = EXCLUDED.hero_id,
                        hero_snapshot = EXCLUDED.hero_snapshot
                    """,
                    (
                        battle_id,
                        side,
                        slot_index,
                        _coerce_uuid(snapshot.get("id")),
                        serialize_json(snapshot),
                    ),
                )

            if user:
                cur.execute(
                    """
                    WITH stale_battles AS (
                        SELECT id
                        FROM battles
                        WHERE user_id = %s
                        ORDER BY created_at DESC, id DESC
                        OFFSET %s
                    )
                    DELETE FROM battles
                    WHERE id IN (SELECT id FROM stale_battles)
                    """,
                    (user["id"], BATTLE_HISTORY_LIMIT),
                )
        conn.commit()
    return battle_row


def save_pve_run(user, theme_key, entry_cost_dust, seed, run_payload, result_payload=None, status="active"):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pve_runs (
                    user_id, theme_key, entry_cost_dust, seed, status,
                    current_floor, max_floor_reached, run_payload, result_payload,
                    started_at, created_at
                )
                VALUES (%s, %s, %s, %s, %s, 1, 1, %s::jsonb, %s::jsonb, now(), now())
                RETURNING id, user_id, theme_key, entry_cost_dust, seed, status, current_floor, max_floor_reached, run_payload, result_payload, started_at, ended_at, created_at
                """,
                (
                    user["id"] if user else None,
                    theme_key,
                    int(entry_cost_dust),
                    int(seed),
                    status,
                    serialize_json(run_payload or {}),
                    serialize_json(result_payload or {}),
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return row


def save_pve_party(run_id, party_members):
    if not run_id:
        return []
    saved = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            for index, member in enumerate(party_members):
                hero_id = member.get("id")
                try:
                    hero_uuid = str(UUID(hero_id)) if isinstance(hero_id, str) else None
                except Exception:
                    hero_uuid = None
                cur.execute(
                    """
                    INSERT INTO pve_run_party (run_id, slot_index, hero_id, hero_snapshot)
                    VALUES (%s, %s, %s, %s::jsonb)
                    ON CONFLICT (run_id, slot_index) DO UPDATE
                    SET hero_id = EXCLUDED.hero_id,
                        hero_snapshot = EXCLUDED.hero_snapshot
                    RETURNING id, run_id, slot_index, hero_id, hero_snapshot, created_at
                    """,
                    (
                        run_id,
                        index,
                        hero_uuid,
                        serialize_json(member),
                    ),
                )
                saved.append(cur.fetchone())
        conn.commit()
    return saved


def save_pve_stage(run_id, floor_index, enemy_payload=None, battle_result=None, reward_payload=None, cleared=False):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO pve_run_stages (run_id, floor_index, enemy_payload, battle_result, reward_payload, cleared)
                VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s)
                ON CONFLICT (run_id, floor_index) DO UPDATE
                SET enemy_payload = EXCLUDED.enemy_payload,
                    battle_result = EXCLUDED.battle_result,
                    reward_payload = EXCLUDED.reward_payload,
                    cleared = EXCLUDED.cleared
                RETURNING id, run_id, floor_index, enemy_payload, battle_result, reward_payload, cleared, created_at
                """,
                (
                    run_id,
                    int(floor_index),
                    serialize_json(enemy_payload or {}),
                    serialize_json(battle_result or {}),
                    serialize_json(reward_payload or {}),
                    bool(cleared),
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return row


def save_audit_log(user, action, entity_type=None, entity_id=None, payload=None):
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO audit_logs (user_id, action, entity_type, entity_id, payload)
                VALUES (%s, %s, %s, %s, %s::jsonb)
                RETURNING id, created_at
                """,
                (
                    user["id"] if user else None,
                    action,
                    entity_type,
                    entity_id,
                    serialize_json(payload or {}),
                ),
            )
            row = cur.fetchone()
        conn.commit()
        return row


def normalize_json_value(value):
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, list):
        return [normalize_json_value(item) for item in value]
    if isinstance(value, dict):
        return {key: normalize_json_value(item) for key, item in value.items()}
    return value


def normalize_rows(rows):
    return [normalize_json_value(row) for row in rows]


def economy_snapshot(user):
    wallet = get_user_wallet(user["id"])
    relics = get_user_relics(user["id"])
    transactions = get_recent_resource_transactions(user["id"], 20)
    return {
        "wallet": normalize_json_value(wallet) if wallet else None,
        "relics": normalize_rows(relics),
        "relic_catalog": normalize_rows(get_relic_catalog()),
        "transactions": normalize_rows(transactions),
        "costs": {
            "forge": settings.dust_cost_forge,
            "repair": settings.dust_cost_repair,
            "pve_entry": settings.dust_cost_pve_entry,
            "pvp_entry": settings.dust_cost_pvp_entry,
            "pvp_revive": settings.dust_cost_pvp_revive,
            "pvp_stake": settings.pvp_stake_dust,
            "decompose_bp_percent": settings.dust_decompose_bp_percent,
        },
        "starter": {
            "dust_balance": settings.starter_dust_balance,
        },
        "shop": currency_shop_snapshot(),
        "pvp": {
            "match_tolerance_pct": settings.pvp_match_tolerance_pct,
            "low_tier_relic_drop_pct": settings.pvp_low_tier_relic_drop_pct,
            "queue_ttl_minutes": settings.pvp_queue_ttl_minutes,
        },
    }


DAILY_SIGN_IN_REWARD_DUST = 30
DAILY_TASKS = {
    "forge_one_card": {
        "title": "Forge one card",
        "description": "Create one new card in the Forge.",
        "target": 1,
        "reward_dust": 100,
    },
    "use_relic_once": {
        "title": "Bind one shard",
        "description": "Bind a shard to enchant one card.",
        "target": 1,
        "reward_dust": 300,
    },
    "enter_arena_once": {
        "title": "Enter Arena",
        "description": "Stake Dust and enter Arena matchmaking once.",
        "target": 1,
        "reward_dust": 20,
    },
    "win_arena_once": {
        "title": "Win Arena",
        "description": "Win one Arena match.",
        "target": 1,
        "reward_dust": 30,
    },
    "revive_once": {
        "title": "Revive a card",
        "description": "Revive one PvP-dead card.",
        "target": 1,
        "reward_dust": 25,
    },
}


def _daily_date_iso():
    return datetime.now(timezone.utc).date().isoformat()


DAILY_TASKS_PER_DAY = 2
DAILY_TASK_MAX_ACTIVE = 5
_DAILY_ROTATION_EPOCH = date(2026, 1, 1)


def _daily_rotation_order(day=None):
    """Deterministic rotation: everyone's offer window starts at the same pool offset each day."""
    pool = list(DAILY_TASKS)
    day = day or datetime.now(timezone.utc).date()
    start = ((day - _DAILY_ROTATION_EPOCH).days * DAILY_TASKS_PER_DAY) % len(pool)
    return [pool[(start + i) % len(pool)] for i in range(len(pool))]


def _offer_payload(row):
    config = DAILY_TASKS.get(row["task_key"], {})
    progress = int(row["progress"])
    target = int(row["target"])
    claimed = row.get("claimed_at") is not None
    return {
        "id": str(row["id"]),
        "key": row["task_key"],
        "title": config.get("title", row["task_key"]),
        "description": config.get("description", ""),
        "task_date": str(row["assigned_on"]),
        "progress": progress,
        "target": target,
        "reward_dust": int(row["reward_dust"]),
        "claimed": claimed,
        "claimable": progress >= target and not claimed,
        "claimed_at": row["claimed_at"].isoformat() if row.get("claimed_at") else None,
    }


def _active_task_offers(user_id):
    return fetch_all(
        """
        SELECT id, user_id, task_key, assigned_on, progress, target, reward_dust,
               claimed_at, created_at, updated_at
        FROM daily_task_offers
        WHERE user_id = %s AND claimed_at IS NULL
        ORDER BY assigned_on ASC, created_at ASC
        """,
        (user_id,),
    )


def _ensure_daily_task_offers(user_id):
    """Offer today's tasks once per day; unfinished tasks accumulate up to the cap."""
    today = _daily_date_iso()
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT daily_tasks_offered_on FROM users WHERE id = %s FOR UPDATE",
                (user_id,),
            )
            user_row = cur.fetchone()
            if user_row and user_row.get("daily_tasks_offered_on") and str(user_row["daily_tasks_offered_on"]) == today:
                return
            cur.execute(
                "SELECT task_key FROM daily_task_offers WHERE user_id = %s AND claimed_at IS NULL",
                (user_id,),
            )
            active_keys = {row["task_key"] for row in cur.fetchall()}
            slots = max(0, DAILY_TASK_MAX_ACTIVE - len(active_keys))
            candidates = [key for key in _daily_rotation_order() if key not in active_keys]
            for key in candidates[: min(DAILY_TASKS_PER_DAY, slots)]:
                config = DAILY_TASKS[key]
                cur.execute(
                    """
                    INSERT INTO daily_task_offers (user_id, task_key, assigned_on, target, reward_dust)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, task_key) WHERE claimed_at IS NULL DO NOTHING
                    """,
                    (user_id, key, today, int(config["target"]), int(config["reward_dust"])),
                )
            cur.execute(
                "UPDATE users SET daily_tasks_offered_on = %s WHERE id = %s",
                (today, user_id),
            )
        conn.commit()


def daily_snapshot(user):
    task_date = _daily_date_iso()
    _ensure_daily_task_offers(user["id"])
    checkin = fetch_one(
        """
        SELECT id, user_id, claim_date, reward_dust, created_at
        FROM daily_checkins
        WHERE user_id = %s AND claim_date = %s
        """,
        (user["id"], task_date),
    )
    tasks = [_offer_payload(row) for row in _active_task_offers(user["id"])]
    tasks.sort(key=lambda item: list(DAILY_TASKS).index(item["key"]) if item["key"] in DAILY_TASKS else 999)
    return {
        "date": task_date,
        "checkin": {
            "claimed": checkin is not None,
            "claim_date": str(checkin["claim_date"]) if checkin else task_date,
            "reward_dust": int(checkin["reward_dust"]) if checkin else DAILY_SIGN_IN_REWARD_DUST,
            "claimed_at": checkin["created_at"].isoformat() if checkin else None,
        },
        "tasks": tasks,
        "tasks_per_day": DAILY_TASKS_PER_DAY,
        "tasks_capacity": DAILY_TASK_MAX_ACTIVE,
        "all_completed": len(tasks) == 0,
        "economy": economy_snapshot(user),
    }


def _record_daily_task_progress(user_id, task_key, amount=1):
    """Record progress on the active offer for this key; unoffered tasks are ignored."""
    if task_key not in DAILY_TASKS:
        return None
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE daily_task_offers
                SET progress = LEAST(target, progress + %s),
                    updated_at = now()
                WHERE user_id = %s AND task_key = %s AND claimed_at IS NULL
                RETURNING id, user_id, task_key, assigned_on, progress, target,
                          reward_dust, claimed_at, created_at, updated_at
                """,
                (max(1, int(amount)), user_id, task_key),
            )
            row = cur.fetchone()
        conn.commit()
    return row


def _safe_record_daily_task_progress(user_id, task_key, amount=1):
    try:
        return _record_daily_task_progress(user_id, task_key, amount=amount)
    except Exception:
        logging.exception("Failed to record daily task progress: %s", task_key)
        return None


LADDER_BASE_RATING = 1000
LADDER_WIN_DELTA = 25
LADDER_TIE_DELTA = 5
LADDER_LOSS_DELTA = -15


def _ladder_tier(rating):
    if rating >= 1400:
        return "Mythic"
    if rating >= 1250:
        return "Gold"
    if rating >= 1100:
        return "Silver"
    return "Bronze"


def ladder_snapshot(user):
    rows = fetch_all(
        """
        SELECT id, queue_key, battle_mode, user_a_id, user_b_id, stake_dust,
               bp_a, bp_b, winner_user_id, winner_side, created_at, resolved_at
        FROM pvp_matches
        WHERE status = 'resolved'
          AND battle_mode = 'arena_2x3'
          AND (user_a_id = %s OR user_b_id = %s)
        ORDER BY COALESCE(resolved_at, created_at) DESC
        """,
        (user["id"], user["id"]),
    )

    user_id = str(user["id"])
    wins = losses = ties = 0
    rating_delta = 0
    recent_matches = []

    for row in rows:
        winner_user_id = str(row["winner_user_id"]) if row.get("winner_user_id") else None
        if row.get("winner_side") == "Tie":
            result = "tie"
            ties += 1
            delta = LADDER_TIE_DELTA
        elif winner_user_id == user_id:
            result = "win"
            wins += 1
            delta = LADDER_WIN_DELTA
        else:
            result = "loss"
            losses += 1
            delta = LADDER_LOSS_DELTA

        rating_delta += delta
        if len(recent_matches) < 10:
            is_side_a = str(row["user_a_id"]) == user_id
            recent_matches.append(
                {
                    "id": str(row["id"]),
                    "queue_key": row["queue_key"],
                    "result": result,
                    "rating_delta": delta,
                    "opponent_user_id": str(row["user_b_id"] if is_side_a else row["user_a_id"]),
                    "bp": int(row["bp_a"] if is_side_a else row["bp_b"]),
                    "opponent_bp": int(row["bp_b"] if is_side_a else row["bp_a"]),
                    "stake_dust": int(row["stake_dust"]),
                    "resolved_at": row["resolved_at"].isoformat() if row.get("resolved_at") else None,
                    "created_at": row["created_at"].isoformat() if row.get("created_at") else None,
                }
            )

    played = wins + losses + ties
    rating = max(0, LADDER_BASE_RATING + rating_delta)
    return {
        "rating": rating,
        "tier": _ladder_tier(rating),
        "record": {
            "played": played,
            "wins": wins,
            "losses": losses,
            "ties": ties,
        },
        "win_rate": round((wins / played) * 100) if played else 0,
        "rules": {
            "base_rating": LADDER_BASE_RATING,
            "win_delta": LADDER_WIN_DELTA,
            "tie_delta": LADDER_TIE_DELTA,
            "loss_delta": LADDER_LOSS_DELTA,
            "source": "resolved arena_2x3 matches",
        },
        "recent_matches": recent_matches,
    }


def _normalize_pvp_queue_key(value):
    return (value or "default").strip() or "default"


ARENA_SLOT_KEYS = ("front_0", "front_1", "front_2", "back_0", "back_1", "back_2")


def _normalize_arena_formation(value):
    if not isinstance(value, dict):
        raise ValueError("Arena formation is required")

    overflow_ids = [item for key, item in value.items() if key not in ARENA_SLOT_KEYS and item]
    formation = {}
    for slot in ARENA_SLOT_KEYS:
        raw_hero_id = value.get(slot)
        hero_id = str(raw_hero_id).strip() if raw_hero_id else None
        formation[slot] = hero_id or None

    hero_ids = [hero_id for hero_id in formation.values() if hero_id]
    if overflow_ids or not (1 <= len(hero_ids) <= 6):
        raise ValueError("Place 1 to 6 active cards")
    if len(set(hero_ids)) != len(hero_ids):
        raise ValueError("A card can only occupy one Arena slot")

    return formation, hero_ids


def _normalize_pvp_battle_mode(value, hero_count: int | None = None):
    mode = (value or "").strip()
    if mode in {"1v1", "4v4", "arena_2x3"}:
        return mode
    if hero_count is not None and 1 < hero_count <= 4:
        return "4v4"
    if hero_count is not None and 4 < hero_count <= 6:
        return "arena_2x3"
    return "1v1"


def _pvp_required_team_size(battle_mode: str) -> int:
    if battle_mode == "arena_2x3":
        return 6
    return 4 if battle_mode == "4v4" else 1


def _hero_bp(hero_payload):
    try:
        return max(0, int(hero_payload.get("BP", 0)))
    except Exception:
        return 0


def _load_pvp_team_snapshot(user, hero_ids, battle_mode: str, formation=None):
    required_size = _pvp_required_team_size(battle_mode)
    if battle_mode in {"4v4", "arena_2x3"}:
        if not (1 <= len(hero_ids) <= required_size):
            raise ValueError(f"{battle_mode} requires between 1 and {required_size} heroes")
    elif len(hero_ids) != required_size:
        raise ValueError(f"{battle_mode} requires exactly {required_size} heroes")

    placeholders = ",".join(["%s"] * len(hero_ids))
    hero_rows = fetch_all(
        f"""
        SELECT id, hero_payload, pvp_life_state, card_status, active_pvp_entry_id, created_at
        FROM heroes
        WHERE user_id = %s AND id IN ({placeholders})
        """,
        (user["id"], *hero_ids),
    )
    hero_map = {str(row["id"]): row for row in hero_rows}
    if len(hero_map) != len(hero_ids):
        raise ValueError("Some heroes were not found in your vault")

    team_snapshot = []
    total_bp = 0
    for hero_id in hero_ids:
        row = hero_map[hero_id]
        if row.get("pvp_life_state") != "active":
            raise ValueError("This card is dead. Revive it before Arena.")
        if row.get("card_status") != "active":
            raise ValueError("This card is not available for Arena.")
        if row.get("active_pvp_entry_id"):
            raise ValueError("This card is already queued.")

        hero_payload = normalize_json_value(row["hero_payload"])
        total_bp += _hero_bp(hero_payload)
        slot_key = None
        if isinstance(formation, dict):
            slot_key = next((slot for slot, placed_id in formation.items() if placed_id == hero_id), None)
        team_snapshot.append(
            {
                "id": hero_id,
                "slot_key": slot_key,
                "hero_payload": hero_payload,
                "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else row["created_at"],
            }
        )

    return team_snapshot, total_bp


def _build_pvp_battle_payload(match_row, entry_a, entry_b):
    return {
        "queueKey": match_row["queue_key"],
        "battleMode": match_row["battle_mode"],
        "stakeDust": int(match_row["stake_dust"]),
        "matchId": str(match_row["id"]),
        "entryA": normalize_json_value(entry_a),
        "entryB": normalize_json_value(entry_b),
    }


def _pvp_entry_hero_ids(entry):
    snapshot = entry.get("team_snapshot") if isinstance(entry, dict) else None
    if not isinstance(snapshot, dict):
        return []
    hero_ids = snapshot.get("hero_ids")
    if isinstance(hero_ids, list):
        return [str(hero_id) for hero_id in hero_ids if str(hero_id).strip()]
    team = snapshot.get("team")
    if isinstance(team, list):
        return [str(item.get("id")) for item in team if isinstance(item, dict) and item.get("id")]
    return []


def _clear_pvp_entry_card_locks_with_cursor(cur, entry):
    hero_ids = _pvp_entry_hero_ids(entry)
    entry_id = entry.get("id") if isinstance(entry, dict) else None
    if not hero_ids or not entry_id:
        return
    placeholders = ",".join(["%s"] * len(hero_ids))
    cur.execute(
        f"""
        UPDATE heroes
        SET active_pvp_entry_id = NULL
        WHERE id IN ({placeholders})
          AND active_pvp_entry_id = %s
        """,
        (*hero_ids, entry_id),
    )


def _clear_pvp_entry_card_locks(entry):
    with get_connection() as conn:
        with conn.cursor() as cur:
            _clear_pvp_entry_card_locks_with_cursor(cur, entry)
        conn.commit()


def _defeated_units_from_board(battle_result, team_a, team_b):
    board = battle_result.get("board") if isinstance(battle_result, dict) else None
    if not isinstance(board, dict):
        return {"A": [], "B": []}

    defeated = {"A": [], "B": []}
    for side, board_key, team in (("A", "bottom", team_a), ("B", "top", team_b)):
        units = board.get(board_key) or []
        if not isinstance(units, list):
            continue
        for unit in units:
            if not isinstance(unit, dict):
                continue
            try:
                hp_after = int(unit.get("hp", 0))
                slot_index = int(unit.get("slot", 0))
            except Exception:
                continue
            if hp_after > 0 or slot_index < 0 or slot_index >= len(team):
                continue
            team_item = team[slot_index]
            defeated[side].append(
                {
                    "hero_id": team_item.get("id"),
                    "slot_key": team_item.get("slot_key") or str(unit.get("slot", slot_index)),
                    "hp_after": hp_after,
                }
            )
    return defeated


def _apply_arena_card_deaths(match_id, user_id, side, defeated_units):
    changes = []
    if not defeated_units:
        return changes

    with get_connection() as conn:
        with conn.cursor() as cur:
            for unit in defeated_units:
                hero_id = unit.get("hero_id")
                if not hero_id:
                    continue
                cur.execute(
                    """
                    UPDATE heroes
                    SET pvp_life_state = 'pvp_dead',
                        pvp_dead_at = now(),
                        active_pvp_entry_id = NULL
                    WHERE id = %s
                      AND user_id = %s
                      AND pvp_life_state = 'active'
                      AND card_status = 'active'
                    RETURNING id, pvp_life_state, pvp_dead_at
                    """,
                    (hero_id, user_id),
                )
                row = cur.fetchone()
                if not row:
                    continue
                cur.execute(
                    """
                    INSERT INTO card_death_records (
                        hero_id, user_id, mode, source_type, source_id, side,
                        slot_key, hp_after, death_state
                    )
                    VALUES (%s, %s, 'pvp', 'pvp_match', %s, %s, %s, %s, 'pvp_dead')
                    """,
                    (hero_id, user_id, match_id, side, unit.get("slot_key"), int(unit.get("hp_after", 0))),
                )
                changes.append(
                    {
                        "id": str(row["id"]),
                        "pvp_life_state": row["pvp_life_state"],
                        "pvp_dead_at": row["pvp_dead_at"].isoformat() if hasattr(row["pvp_dead_at"], "isoformat") else row["pvp_dead_at"],
                        "side": side,
                        "slot_key": unit.get("slot_key"),
                    }
                )
        conn.commit()
    return changes


def _maybe_grant_pvp_relic_drop(winner_user_id, match_row, battle_mode):
    if not winner_user_id:
        return None

    drop_pct = max(0, int(settings.pvp_low_tier_relic_drop_pct))
    if drop_pct <= 0:
        return None
    if secrets.randbelow(100) >= drop_pct:
        return None

    drop_pool = get_low_tier_relic_types()
    if not drop_pool:
        return None

    relic_type = secrets.choice(drop_pool)
    relic_definition = get_relic_definition(relic_type) or {}
    try:
        relic_result = adjust_relic_balance(
            winner_user_id,
            relic_type,
            1,
            "pvp_relic_drop",
            ref_type="pvp_match",
            ref_id=str(match_row["id"]),
            metadata={
                "battle_mode": battle_mode,
                "drop_pct": drop_pct,
                "match_id": str(match_row["id"]),
                "relic_type": relic_type,
            },
        )
    except Exception:
        logging.exception("Failed to grant PvP relic drop")
        return None

    transaction = relic_result.get("transaction") or {}
    return {
        "relic_type": relic_type,
        "display_name": relic_definition.get("display_name", relic_type),
        "tier": relic_definition.get("tier", "common"),
        "family": relic_definition.get("family"),
        "amount": 1,
        "balance_after": relic_result["amount"],
        "transaction_id": str(transaction.get("id")) if transaction.get("id") else None,
        "reason": "pvp_relic_drop",
    }


def _resolve_pvp_match(match_row, entry_a, entry_b, battle_result):
    winner_label = str(battle_result.get("winnerLabel") or battle_result.get("winner") or "Tie")
    battle_mode = match_row["battle_mode"]
    battle_payload = _build_pvp_battle_payload(match_row, entry_a, entry_b)
    team_a = entry_a["team_snapshot"].get("team", []) if isinstance(entry_a.get("team_snapshot"), dict) else []
    team_b = entry_b["team_snapshot"].get("team", []) if isinstance(entry_b.get("team_snapshot"), dict) else []
    defeated_units = _defeated_units_from_board(battle_result, team_a, team_b)
    card_state_changes = []
    card_state_changes.extend(_apply_arena_card_deaths(match_row["id"], str(match_row["user_a_id"]), "A", defeated_units["A"]))
    card_state_changes.extend(_apply_arena_card_deaths(match_row["id"], str(match_row["user_b_id"]), "B", defeated_units["B"]))

    battle_row_a = save_battle_history(
        {"id": str(match_row["user_a_id"])},
        f"pvp_{battle_mode}",
        {
            "queueKey": match_row["queue_key"],
            "battleMode": battle_mode,
            "teamA": team_a,
            "teamB": team_b,
            "stakeDust": int(match_row["stake_dust"]),
            "matchId": str(match_row["id"]),
        },
        battle_result,
    )
    battle_row_b = save_battle_history(
        {"id": str(match_row["user_b_id"])},
        f"pvp_{battle_mode}",
        {
            "queueKey": match_row["queue_key"],
            "battleMode": battle_mode,
            "teamA": team_a,
            "teamB": team_b,
            "stakeDust": int(match_row["stake_dust"]),
            "matchId": str(match_row["id"]),
        },
        battle_result,
    )

    if winner_label == "Tie":
        adjust_dust_balance(
            str(match_row["user_a_id"]),
            int(match_row["stake_dust"]),
            "pvp_tie_refund",
            ref_type="pvp_match",
            ref_id=str(match_row["id"]),
            metadata={"side": "A", "battle_mode": battle_mode},
        )
        adjust_dust_balance(
            str(match_row["user_b_id"]),
            int(match_row["stake_dust"]),
            "pvp_tie_refund",
            ref_type="pvp_match",
            ref_id=str(match_row["id"]),
            metadata={"side": "B", "battle_mode": battle_mode},
        )
        winner_user_id = None
        winner_side = "Tie"
        reward_payload = {
            "entry_cost": int(match_row["stake_dust"]),
            "dust_pool": int(match_row["stake_dust"]) * 2,
            "winner_side": "Tie",
            "winner_user_id": None,
            "tie_refund": True,
            "payout_dust": 0,
            "refund_dust_each": int(match_row["stake_dust"]),
            "relic_drop": None,
        }
    else:
        winner_side = "A" if winner_label == "Player A" else ("B" if winner_label == "Player B" else "Tie")
        winner_user_id = str(match_row["user_a_id"]) if winner_side == "A" else str(match_row["user_b_id"]) if winner_side == "B" else None
        relic_drop = _maybe_grant_pvp_relic_drop(winner_user_id, match_row, battle_mode)
        if winner_user_id:
            adjust_dust_balance(
                winner_user_id,
                int(match_row["stake_dust"]) * 2,
                "pvp_payout",
                ref_type="pvp_match",
                ref_id=str(match_row["id"]),
                metadata={"winner_side": winner_side, "battle_mode": battle_mode},
            )
        reward_payload = {
            "entry_cost": int(match_row["stake_dust"]),
            "dust_pool": int(match_row["stake_dust"]) * 2,
            "winner_side": winner_side,
            "winner_user_id": winner_user_id,
            "tie_refund": False,
            "payout_dust": int(match_row["stake_dust"]) * 2 if winner_user_id else 0,
            "refund_dust_each": 0,
            "relic_drop": relic_drop,
        }

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE pvp_matches
                SET status = 'resolved',
                    battle_payload = %s::jsonb,
                    battle_result = %s::jsonb,
                    reward_payload = %s::jsonb,
                    card_state_changes = %s::jsonb,
                    battle_id = %s,
                    winner_user_id = %s,
                    winner_side = %s,
                    resolved_at = now()
                WHERE id = %s
                """,
                (
                    serialize_json(battle_payload),
                    serialize_json(battle_result),
                    serialize_json(reward_payload),
                    serialize_json(card_state_changes),
                    str(battle_row_a["id"]) if battle_row_a else None,
                    winner_user_id,
                    winner_side,
                    match_row["id"],
                ),
            )
            cur.execute(
                """
                UPDATE pvp_queue_entries
                SET match_id = %s,
                    status = 'matched',
                    matched_at = now()
                WHERE id IN (%s, %s)
                """,
                (match_row["id"], match_row["entry_a_id"], match_row["entry_b_id"]),
            )
            _clear_pvp_entry_card_locks_with_cursor(cur, entry_a)
            _clear_pvp_entry_card_locks_with_cursor(cur, entry_b)
        conn.commit()

    if winner_user_id:
        _safe_record_daily_task_progress(winner_user_id, "win_arena_once")

    return {
        "battle": normalize_json_value(battle_result),
        "battleRowA": normalize_json_value(battle_row_a) if battle_row_a else None,
        "battleRowB": normalize_json_value(battle_row_b) if battle_row_b else None,
        "winner_user_id": winner_user_id,
        "winner_side": winner_side,
        "reward_payload": reward_payload,
        "card_state_changes": card_state_changes,
    }


def _fetch_pvp_match(match_id):
    return fetch_one(
        """
        SELECT id, queue_key, battle_mode, entry_a_id, entry_b_id, user_a_id, user_b_id,
               stake_dust, bp_a, bp_b, bp_gap_pct, status, battle_payload, battle_result,
               formation_a, formation_b, reward_payload, card_state_changes,
               battle_session_id, battle_id, winner_user_id, winner_side, created_at, resolved_at
        FROM pvp_matches
        WHERE id = %s
        """,
        (match_id,),
    )


def _fetch_pvp_match_entries(match_row):
    entry_a = fetch_one(
        """
        SELECT id, user_id, queue_key, battle_mode, stake_dust, bp_value, status, team_snapshot,
               formation_snapshot, opponent_entry_id, match_id, expires_at, matched_at, cancelled_at, created_at
        FROM pvp_queue_entries
        WHERE id = %s
        """,
        (match_row["entry_a_id"],),
    )
    entry_b = fetch_one(
        """
        SELECT id, user_id, queue_key, battle_mode, stake_dust, bp_value, status, team_snapshot,
               formation_snapshot, opponent_entry_id, match_id, expires_at, matched_at, cancelled_at, created_at
        FROM pvp_queue_entries
        WHERE id = %s
        """,
        (match_row["entry_b_id"],),
    )
    if not entry_a or not entry_b:
        raise ValueError("PvP match entries are missing")
    return normalize_json_value(entry_a), normalize_json_value(entry_b)


def _sync_pvp_match_session(match_id):
    """Return the live session snapshot and settle a completed formal match once."""
    with PVP_SESSION_SETTLEMENT_LOCK:
        match_row = _fetch_pvp_match(match_id)
        if not match_row:
            return None, None

        session_id = str(match_row.get("battle_session_id") or "").strip()
        session = battle_sessions.get_battle_session(session_id) if session_id else None
        session_snapshot = session.public_snapshot() if session else None
        if not session_snapshot or session_snapshot.get("status") != "resolved" or not session_snapshot.get("result"):
            return normalize_json_value(match_row), session_snapshot

        if match_row.get("status") == "resolved":
            return normalize_json_value(match_row), session_snapshot

        entry_a, entry_b = _fetch_pvp_match_entries(match_row)
        _resolve_pvp_match(match_row, entry_a, entry_b, session_snapshot["result"])
        return normalize_json_value(_fetch_pvp_match(match_id) or match_row), session_snapshot


def _pvp_match_for_session(session_id):
    if session_id not in PVP_BATTLE_SESSION_IDS:
        return None
    return fetch_one(
        """
        SELECT id, user_a_id, user_b_id, status, battle_session_id
        FROM pvp_matches
        WHERE battle_session_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (session_id,),
    )


def _sync_pvp_match_session_by_session_id(session_id):
    match_row = _pvp_match_for_session(session_id)
    if not match_row:
        return None, None
    return _sync_pvp_match_session(match_row["id"])


def _assert_pvp_session_access(session_id, user, action=None):
    match_row = _pvp_match_for_session(session_id)
    if not match_row:
        return None

    user_id = str(user["id"])
    if user_id == str(match_row["user_a_id"]):
        side = "A"
    elif user_id == str(match_row["user_b_id"]):
        side = "B"
    else:
        raise PermissionError("You are not a participant in this Arena battle")

    actor_tag = str((action or {}).get("actorTag") or "").strip()
    if actor_tag and not actor_tag.startswith(side):
        raise PermissionError("An Agent may only submit actions for its own Arena side")
    return match_row


def _join_pvp_queue(user, data, require_team_payload: bool = False):
    queue_key = _normalize_pvp_queue_key(data.get("queueKey") or data.get("queue_key"))
    formation_snapshot = {}
    mode = data.get("mode") or data.get("battleMode") or data.get("battle_mode")
    if mode == "arena_2x3" or isinstance(data.get("formation"), dict):
        formation, hero_ids = _normalize_arena_formation(data.get("formation"))
        formation_snapshot = {"mode": "arena_2x3", "board": formation}
        battle_mode = "arena_2x3"
    else:
        hero_ids = data.get("heroIds") or data.get("hero_ids") or []
        battle_mode = _normalize_pvp_battle_mode(data.get("battleMode") or data.get("battle_mode"), len(hero_ids) if isinstance(hero_ids, list) else None)
        formation = None

    # Control belongs to the match contract, never to one participant's UI.
    control_mode = str(data.get("controlMode") or data.get("control_mode") or
                       ("manual" if battle_mode == "arena_2x3" else "rest")).strip().lower()
    if control_mode not in {"program", "manual", "rest"}:
        raise ValueError("controlMode must be program, manual or rest")

    if not isinstance(hero_ids, list):
        raise ValueError("heroIds must be an array")
    hero_ids = [str(hero_id) for hero_id in hero_ids if str(hero_id).strip()]

    if require_team_payload and not hero_ids:
        raise ValueError("heroIds are required for PvP matchmaking")

    if not hero_ids:
        return None

    team_snapshot, total_bp = _load_pvp_team_snapshot(user, hero_ids, battle_mode, formation=formation)
    if total_bp <= 0:
        raise ValueError("Arena team BP must be greater than 0")

    # One account owns one live queue at a time.  Without this guard an agent
    # could reserve multiple rosters, pay several stakes, and only observe the
    # latest entry in its client state.
    active_entry = fetch_one(
        """
        SELECT id
        FROM pvp_queue_entries
        WHERE user_id = %s
          AND status = 'waiting'
          AND expires_at > now()
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (user["id"],),
    )
    if active_entry:
        raise ValueError("You are already searching for an Arena opponent. Cancel the active queue first.")

    stake_dust = settings.pvp_stake_dust
    stake_charged = False
    queue_entry = None
    opponent_entry = None
    match_row = None

    tolerance_pct = max(0, int(settings.pvp_match_tolerance_pct))
    try:
        adjust_dust_balance(
            user["id"],
            -stake_dust,
            "pvp_stake",
            ref_type="pvp_queue",
            metadata={"queue_key": queue_key, "battle_mode": battle_mode, "hero_ids": hero_ids, "bp_value": total_bp, "formation": formation_snapshot},
        )
        stake_charged = True

        with get_connection() as conn:
            with conn.cursor() as cur:
                # Serialize joins for this account. The optimistic read above
                # keeps the common rejection cheap; this lock closes the race
                # when two agent workers submit different formations together.
                cur.execute("SELECT id FROM users WHERE id = %s FOR UPDATE", (user["id"],))
                cur.execute(
                    """
                    SELECT id
                    FROM pvp_queue_entries
                    WHERE user_id = %s
                      AND status = 'waiting'
                      AND expires_at > now()
                    ORDER BY created_at DESC
                    LIMIT 1
                    """,
                    (user["id"],),
                )
                if cur.fetchone():
                    raise ValueError("You are already searching for an Arena opponent. Cancel the active queue first.")

                cur.execute(
                    """
                    INSERT INTO pvp_queue_entries (
                        user_id, queue_key, battle_mode, stake_dust, bp_value, team_snapshot, formation_snapshot, expires_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, now() + (%s || ' minutes')::interval)
                    RETURNING id, user_id, queue_key, battle_mode, stake_dust, bp_value, status, team_snapshot, formation_snapshot, opponent_entry_id, match_id, expires_at, matched_at, cancelled_at, created_at
                    """,
                    (
                        user["id"],
                        queue_key,
                        battle_mode,
                        int(stake_dust),
                        int(total_bp),
                        serialize_json({"hero_ids": hero_ids, "team": team_snapshot, "total_bp": total_bp, "control_mode": control_mode}),
                        serialize_json(formation_snapshot),
                        settings.pvp_queue_ttl_minutes,
                    ),
                )
                queue_entry = cur.fetchone()
                lock_placeholders = ",".join(["%s"] * len(hero_ids))
                cur.execute(
                    f"""
                    UPDATE heroes
                    SET active_pvp_entry_id = %s
                    WHERE user_id = %s
                      AND id IN ({lock_placeholders})
                      AND active_pvp_entry_id IS NULL
                    RETURNING id
                    """,
                    (queue_entry["id"], user["id"], *hero_ids),
                )
                locked_rows = cur.fetchall()
                if len(locked_rows) != len(hero_ids):
                    raise ValueError("This card is already queued.")

                cur.execute(
                    """
                    SELECT id, user_id, queue_key, battle_mode, stake_dust, bp_value, status, team_snapshot, formation_snapshot, opponent_entry_id, match_id, expires_at, matched_at, cancelled_at, created_at
                    FROM pvp_queue_entries
                    WHERE queue_key = %s
                      AND battle_mode = %s
                      AND COALESCE(team_snapshot->>'control_mode',
                          CASE WHEN battle_mode = 'arena_2x3' THEN 'manual' ELSE 'rest' END) = %s
                      AND status = 'waiting'
                      AND user_id <> %s
                      AND expires_at > now()
                      AND ABS(bp_value - %s) <= LEAST(bp_value, %s) * (%s / 100.0)
                    ORDER BY ABS(bp_value - %s) ASC, created_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                    """,
                    (
                        queue_key,
                        battle_mode,
                        control_mode,
                        user["id"],
                        int(total_bp),
                        max(int(total_bp), 1),
                        tolerance_pct,
                        int(total_bp),
                    ),
                )
                opponent_entry = cur.fetchone()

                if opponent_entry:
                    cur.execute(
                        """
                        UPDATE pvp_queue_entries
                        SET status = 'matched',
                            matched_at = now(),
                            opponent_entry_id = %s
                        WHERE id = %s
                        """,
                        (opponent_entry["id"], queue_entry["id"]),
                    )
                    cur.execute(
                        """
                        UPDATE pvp_queue_entries
                        SET status = 'matched',
                            matched_at = now(),
                            opponent_entry_id = %s
                        WHERE id = %s
                        """,
                        (queue_entry["id"], opponent_entry["id"]),
                    )
                    cur.execute(
                        """
                        INSERT INTO pvp_matches (
                            queue_key, battle_mode, entry_a_id, entry_b_id,
                            user_a_id, user_b_id, stake_dust, bp_a, bp_b, bp_gap_pct,
                            status, battle_payload, formation_a, formation_b
                        )
                        VALUES (
                            %s, %s, %s, %s,
                            %s, %s, %s, %s, %s, %s,
                            'created', %s::jsonb, %s::jsonb, %s::jsonb
                        )
                        RETURNING id, queue_key, battle_mode, entry_a_id, entry_b_id, user_a_id, user_b_id, stake_dust, bp_a, bp_b, bp_gap_pct, status, battle_payload, battle_result, formation_a, formation_b, reward_payload, card_state_changes, battle_id, winner_user_id, winner_side, created_at, resolved_at
                        """,
                        (
                            queue_key,
                            battle_mode,
                            opponent_entry["id"],
                            queue_entry["id"],
                            opponent_entry["user_id"],
                            user["id"],
                            int(stake_dust),
                            int(opponent_entry["bp_value"]),
                            int(queue_entry["bp_value"]),
                            round(abs(int(opponent_entry["bp_value"]) - int(queue_entry["bp_value"])) / max(min(int(opponent_entry["bp_value"]), int(queue_entry["bp_value"])), 1) * 100, 2),
                            serialize_json(
                                {
                                    "queue_key": queue_key,
                                    "battle_mode": battle_mode,
                                    "control_mode": control_mode,
                                    "tolerance_pct": tolerance_pct,
                                }
                            ),
                            serialize_json(normalize_json_value(opponent_entry.get("formation_snapshot") or {})),
                            serialize_json(normalize_json_value(queue_entry.get("formation_snapshot") or {})),
                        ),
                    )
                    match_row = cur.fetchone()
            conn.commit()
    except Exception:
        # The wallet write is intentionally separate from the queue transaction.
        # Any validation, locking, or insert failure before a match exists must
        # restore the stake; otherwise a failed click silently burns Dust.
        if stake_charged and match_row is None:
            try:
                adjust_dust_balance(
                    user["id"],
                    int(stake_dust),
                    "pvp_queue_join_refund",
                    ref_type="pvp_queue",
                    metadata={"queue_key": queue_key, "battle_mode": battle_mode, "reason": "queue_join_failed"},
                )
            except Exception:
                logging.exception("Failed to refund Arena stake after queue join failure")
        raise

    _safe_record_daily_task_progress(user["id"], "enter_arena_once")

    if not match_row:
        return {
            "status": "waiting",
            "entry": normalize_json_value(queue_entry),
            "opponent": None,
            "match": None,
            "battle": None,
            "economy": economy_snapshot(user),
        }

    entry_a = normalize_json_value(opponent_entry)
    entry_b = normalize_json_value(queue_entry)
    team_a = entry_a["team_snapshot"].get("team", []) if isinstance(entry_a.get("team_snapshot"), dict) else []
    team_b = entry_b["team_snapshot"].get("team", []) if isinstance(entry_b.get("team_snapshot"), dict) else []
    label_a = "Player A"
    label_b = "Player B"
    session_control_mode = control_mode

    try:
        session = battle_sessions.create_battle_session(
            battle_mode=battle_mode,
            control_mode=session_control_mode,
            label_a=label_a,
            label_b=label_b,
            team_a=[item["hero_payload"] for item in team_a],
            team_b=[item["hero_payload"] for item in team_b],
            wait_seconds=max(1, min(30, int(settings.pvp_battle_session_wait_seconds))),
            require_confirmation=battle_mode == "arena_2x3",
            participant_ids={"A": str(entry_a["user_id"]), "B": str(entry_b["user_id"])},
        )
        PVP_BATTLE_SESSION_IDS.add(session.session_id)
        execute(
            """
            UPDATE pvp_matches
            SET status = 'running',
                battle_session_id = %s,
                battle_payload = battle_payload || %s::jsonb
            WHERE id = %s
            """,
            (
                session.session_id,
                serialize_json(
                    {
                        "battle_session_id": session.session_id,
                        "control_mode": session_control_mode,
                        "wait_seconds": session.wait_seconds,
                    }
                ),
                match_row["id"],
            ),
        )
        updated_match_row, session_snapshot = _sync_pvp_match_session(match_row["id"])
        battle_payload = {
            "queue_key": queue_key,
            "battle_mode": battle_mode,
            "entry_a": entry_a,
            "entry_b": entry_b,
            "match_id": str(match_row["id"]),
            "stake_dust": int(stake_dust),
            "battle_session_id": session.session_id,
        }
        return {
            "status": "matched",
            "entry": normalize_json_value(queue_entry),
            "opponent": normalize_json_value(opponent_entry),
            "match": normalize_json_value(updated_match_row or match_row),
            "battle": (session_snapshot or {}).get("result"),
            "battle_session": _battle_session_view(session, user),
            "battle_payload": battle_payload,
            "reward": (updated_match_row or {}).get("reward_payload") or None,
            "card_state_changes": (updated_match_row or {}).get("card_state_changes") or [],
            "economy": economy_snapshot(user),
            "winner_side": (updated_match_row or {}).get("winner_side"),
        }
    except Exception as exc:
        logging.exception("Failed to create PvP battle session")
        try:
            adjust_dust_balance(
                str(queue_entry["user_id"]),
                int(stake_dust),
                "pvp_match_refund",
                ref_type="pvp_match",
                ref_id=str(match_row["id"]),
                metadata={"error": str(exc)},
            )
        except Exception:
            logging.exception("Failed to refund queued user")
        try:
            adjust_dust_balance(
                str(opponent_entry["user_id"]),
                int(stake_dust),
                "pvp_match_refund",
                ref_type="pvp_match",
                ref_id=str(match_row["id"]),
                metadata={"error": str(exc)},
            )
        except Exception:
            logging.exception("Failed to refund opponent")
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE pvp_matches
                    SET status = 'failed',
                        battle_result = %s::jsonb,
                        resolved_at = now()
                    WHERE id = %s
                    """,
                    (serialize_json({"error": str(exc)}), match_row["id"]),
                )
                cur.execute(
                    """
                    UPDATE pvp_queue_entries
                    SET status = 'cancelled',
                        cancelled_at = now()
                    WHERE id IN (%s, %s)
                    """,
                    (queue_entry["id"], opponent_entry["id"]),
                )
                _clear_pvp_entry_card_locks_with_cursor(cur, queue_entry)
                _clear_pvp_entry_card_locks_with_cursor(cur, opponent_entry)
            conn.commit()
        raise


@app.route("/api/auth/request-code", methods=["POST"])
@app.route("/api/auth/request-login", methods=["POST"])
def request_login_code():
    try:
        data = request.json or {}
        email = data.get("email", "")
        result = create_login_code(email, request.headers.get("X-Forwarded-For", request.remote_addr))
        return jsonify({"ok": True, "message": "Login code sent", "data": result})
    except Exception as exc:
        logging.exception("request_login_code failed")
        return jsonify({"error": str(exc)}), 400


@app.route("/api/auth/verify-code", methods=["POST"])
@app.route("/api/auth/verify-login", methods=["POST"])
def verify_login_code_route():
    try:
        data = request.json or {}
        email = data.get("email", "")
        code = data.get("code", "")
        result = verify_login_code(
            email,
            code,
            request.headers.get("X-Forwarded-For", request.remote_addr),
            request.headers.get("User-Agent"),
        )
        return jsonify({"ok": True, "data": result})
    except Exception as exc:
        logging.exception("verify_login_code failed")
        return jsonify({"error": str(exc)}), 400


@app.route("/api/auth/me", methods=["GET"])
def auth_me():
    user = current_user()
    if not user:
        return jsonify({"authenticated": False}), 200
    return jsonify({"authenticated": True, "user": user})


@app.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    revoke_session(get_bearer_token())
    return jsonify({"ok": True})


@app.route("/api/me/agent-keys", methods=["GET"])
@session_required
def me_agent_keys():
    return jsonify({"data": list_agent_api_keys(current_user()["id"])})


@app.route("/api/me/agent-keys", methods=["POST"])
@session_required
def create_me_agent_key():
    try:
        data = request.json or {}
        result = create_agent_api_key(current_user()["id"], str(data.get("name") or ""))
        return jsonify({"data": result}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        logging.exception("Failed to create Agent key")
        return jsonify({"error": "Failed to create Agent key"}), 500


@app.route("/api/me/agent-keys/<key_id>", methods=["DELETE"])
@session_required
def revoke_me_agent_key(key_id):
    try:
        UUID(str(key_id))
        key = revoke_agent_api_key(current_user()["id"], key_id)
        return jsonify({"ok": True, "data": key})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        logging.exception("Failed to revoke Agent key")
        return jsonify({"error": "Failed to revoke Agent key"}), 500


@app.route("/api/me/economy", methods=["GET"])
@auth_required
def me_economy():
    user = current_user()
    return jsonify({"data": economy_snapshot(user)})


@app.route("/api/daily/me", methods=["GET"])
@auth_required
def daily_me():
    user = current_user()
    return jsonify({"ok": True, "data": daily_snapshot(user)})


@app.route("/api/daily/sign-in/claim", methods=["POST"])
@auth_required
def daily_sign_in_claim():
    user = current_user()
    task_date = _daily_date_iso()
    try:
        ensure_user_wallet(user["id"])
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO daily_checkins (user_id, claim_date, reward_dust)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, claim_date) DO NOTHING
                    RETURNING id
                    """,
                    (user["id"], task_date, DAILY_SIGN_IN_REWARD_DUST),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Daily sign-in already claimed"}), 400

                # Pay the reward in the same transaction so a failed payment
                # can never strand a claimed check-in row.
                cur.execute(
                    "SELECT dust_balance FROM user_wallets WHERE user_id = %s FOR UPDATE",
                    (user["id"],),
                )
                wallet = cur.fetchone()
                next_balance = int(wallet["dust_balance"] if wallet else 0) + DAILY_SIGN_IN_REWARD_DUST
                cur.execute(
                    "UPDATE user_wallets SET dust_balance = %s, updated_at = now() WHERE user_id = %s",
                    (next_balance, user["id"]),
                )
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, delta, balance_after, reason, ref_type, ref_id, metadata
                    )
                    VALUES (%s, 'dust', %s, %s, 'daily_sign_in', 'daily_checkin', %s, %s::jsonb)
                    """,
                    (
                        user["id"],
                        DAILY_SIGN_IN_REWARD_DUST,
                        next_balance,
                        str(row["id"]),
                        serialize_json({"claim_date": task_date}),
                    ),
                )
            conn.commit()
        return jsonify({"ok": True, "data": daily_snapshot(user)})
    except Exception as exc:
        logging.exception("daily_sign_in_claim failed")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/daily/tasks/<task_key>/claim", methods=["POST"])
@auth_required
def daily_task_claim(task_key):
    user = current_user()
    if task_key not in DAILY_TASKS:
        return jsonify({"error": "Unknown daily task"}), 404

    try:
        ensure_user_wallet(user["id"])
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, progress, target, reward_dust
                    FROM daily_task_offers
                    WHERE user_id = %s AND task_key = %s AND claimed_at IS NULL
                    FOR UPDATE
                    """,
                    (user["id"], task_key),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Daily task is not active"}), 404
                if int(row["progress"]) < int(row["target"]):
                    return jsonify({"error": "Daily task not complete"}), 400

                # Mark claimed and pay out atomically; a failure rolls both back.
                cur.execute(
                    "UPDATE daily_task_offers SET claimed_at = now(), updated_at = now() WHERE id = %s",
                    (row["id"],),
                )
                cur.execute(
                    "SELECT dust_balance FROM user_wallets WHERE user_id = %s FOR UPDATE",
                    (user["id"],),
                )
                wallet = cur.fetchone()
                reward = int(row["reward_dust"])
                next_balance = int(wallet["dust_balance"] if wallet else 0) + reward
                cur.execute(
                    "UPDATE user_wallets SET dust_balance = %s, updated_at = now() WHERE user_id = %s",
                    (next_balance, user["id"]),
                )
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, delta, balance_after, reason, ref_type, ref_id, metadata
                    )
                    VALUES (%s, 'dust', %s, %s, 'daily_task_reward', 'daily_task_offer', %s, %s::jsonb)
                    """,
                    (
                        user["id"],
                        reward,
                        next_balance,
                        str(row["id"]),
                        serialize_json({"task_key": task_key}),
                    ),
                )
            conn.commit()
        return jsonify({"ok": True, "data": daily_snapshot(user)})
    except Exception as exc:
        logging.exception("daily_task_claim failed")
        return jsonify({"error": str(exc)}), 500


@app.route("/api/ladder/me", methods=["GET"])
@auth_required
def ladder_me():
    user = current_user()
    return jsonify({"ok": True, "data": ladder_snapshot(user)})


@app.route("/api/health", methods=["GET"])
def health():
    try:
        with get_connection() as conn:
            conn.execute("SELECT 1")
        return jsonify({"ok": True, "database": "ready"})
    except Exception:
        logging.exception("Health check database connection failed")
        return jsonify({"ok": False, "database": "unavailable"}), 503


@app.route("/api/forge", methods=["POST"])
@auth_required
def forge():
    charged = False
    user = current_user()
    try:
        data = request.json or {}
        image_base64 = data.get("image")
        if not image_base64:
            return jsonify({"error": "No image provided"}), 400

        if model_vision is None or model_text is None:
            return jsonify({"error": "OPENAI_API_KEY or KIMI_API_KEY is not configured"}), 500

        try:
            adjust_dust_balance(
                user["id"],
                -settings.dust_cost_forge,
                "forge_entry",
                ref_type="hero_generation",
                metadata={},
            )
            charged = True
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 402

        # Step 1: Analyze Image (P1)
        image_part = _image_part_from_base64(image_base64)
        p1_response = model_vision.generate_content([P1_PROMPT, image_part])
        p1_data = extract_json(p1_response.text)
        if not p1_data:
            raise ValueError("Failed to analyze image")

        # Step 2: Generate Stats (P2)
        p2_input = {
            "source": p1_data,
        }

        p2_response = model_text.generate_content(f"{P2_PROMPT_V2}\n\nInput Data:\n{json.dumps(p2_input)}")
        p2_data = extract_json(p2_response.text)
        if not p2_data:
            raise ValueError("Failed to generate stats")

        # Step 3: Scale
        final_hero = adjust_based_on_bp(p2_data)
        # Keep the normalized portrait with the saved hero, without sending it
        # through the second text-model call again.
        image_url = f"data:image/png;base64,{image_part['data']}"
        saved_source = {**p2_input, "image_url": image_url}
        generation_row = save_hero_generation_history(
            user,
            saved_source,
            {"p1": p1_data, "p2": p2_data},
            final_hero,
            template=p2_data.get("template"),
            bp_requested=int(p2_data.get("BP") or p1_data.get("BP") or final_hero.get("BP") or 0),
            bp_final=int(final_hero.get("BP") or 0),
            model_name=LLM_MODEL_NAME,
            prompt_version="p2_v2",
            source_image_hash=hashlib.sha256(base64.b64decode(image_part["data"])).hexdigest(),
            source_image_url=image_url,
            status="completed",
        )
        saved_hero = save_hero_history(user, saved_source, final_hero)
        _safe_record_daily_task_progress(user["id"], "forge_one_card")

        response = dict(final_hero)
        response["generation_id"] = str(generation_row["id"]) if generation_row else None
        response["hero_id"] = str(saved_hero["id"]) if saved_hero else None
        response["economy"] = economy_snapshot(user)
        return jsonify(response)

    except Exception as e:
        if charged:
            try:
                adjust_dust_balance(
                    user["id"],
                    settings.dust_cost_forge,
                    "forge_refund",
                    ref_type="hero_generation",
                    metadata={"error": str(e)},
                )
            except Exception:
                logging.exception("Failed to refund forge cost")
        logging.exception(e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/battle", methods=["POST"])
@auth_required
def battle():
    try:
        data = request.json or {}
        hero_a = data.get("heroA")
        hero_b = data.get("heroB")
        control_mode = str(data.get("controlMode") or "program").strip().lower() or "program"

        if not hero_a or not hero_b:
            return jsonify({"error": "Two heroes required for battle"}), 400

        result = run_auto_duel(hero_a, hero_b, control_mode=control_mode)
        try:
            save_battle_history(current_user(), "1v1", data, result)
        except Exception:
            logging.exception("Failed to persist battle history")
        return jsonify(result)

    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500

@app.route("/api/battle/team", methods=["POST"])
@auth_required
def battle_team():
    try:
        data = request.json or {}
        team_a = data.get("teamA")
        team_b = data.get("teamB")
        size = data.get("size", "1v1")
        label_a = data.get("labelA", "Team A")
        label_b = data.get("labelB", "Team B")
        control_mode = str(data.get("controlMode") or "program").strip().lower() or "program"

        if not team_a or not team_b:
            return jsonify({"error": "Two teams required for battle"}), 400

        if size == "pve_4v6" and (len(team_a) > 4 or len(team_b) > 6):
            return jsonify({"error": "pve_4v6 allows at most 4 player units and 6 enemies"}), 400
        result = run_team_duel(team_a, team_b, size, label_a, label_b, control_mode=control_mode)
        try:
            save_battle_history(current_user(), size, data, result)
        except Exception:
            logging.exception("Failed to persist team battle history")
        return jsonify(result)

    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


def _sync_friendly_battle_session(session):
    challenge_id = FRIEND_BATTLE_SESSION_IDS.get(session.session_id)
    if not challenge_id or session.status != "resolved" or not session.result:
        return
    with PVP_SESSION_SETTLEMENT_LOCK:
        challenge = fetch_one("SELECT * FROM friend_challenges WHERE id = %s", (challenge_id,))
        if not challenge or challenge["status"] == "resolved":
            return
        result = session.result
        hp_a, hp_b = result.get("finalHpA", 0), result.get("finalHpB", 0)
        winner = session.participant_ids.get("A" if hp_a > hp_b else "B") if hp_a != hp_b else None
        execute("""UPDATE friend_challenges SET status = 'resolved', battle_result = %s::jsonb,
                   winner_user_id = %s, resolved_at = now() WHERE id = %s""",
                (serialize_json(result), winner, challenge_id))
        payload = {"challengeId": challenge_id, "teamA": session.team_a_payload, "teamB": session.team_b_payload, "friendly": True}
        for user_id in session.participant_ids.values():
            player = fetch_one("SELECT id, email FROM users WHERE id = %s", (user_id,))
            if player:
                save_battle_history(player, "friendly_arena_2x3", payload, result)


def _battle_session_view(session, user):
    snapshot = session.public_snapshot()
    if session.participant_ids:
        side = next((side for side, user_id in session.participant_ids.items() if user_id == str(user["id"])), None)
        if not side:
            raise PermissionError("You are not a participant in this battle")
        snapshot["viewerSide"] = side
    return snapshot


@app.route("/api/battle/sessions/<session_id>/confirm", methods=["POST"])
@auth_required
def confirm_battle_session_route(session_id):
    try:
        session = battle_sessions.get_battle_session(session_id)
        if not session:
            return jsonify({"error": "Battle session not found"}), 404
        view = _battle_session_view(session, current_user())
        side = view.get("viewerSide")
        if not side:
            raise PermissionError("This session has no participant assigned for confirmation")
        session.confirm_preparation(side, (request.json or {}).get("positions"))
        _sync_pvp_match_session_by_session_id(session_id)
        _sync_friendly_battle_session(session)
        if session.auto_ready_b and session.status == "resolved":
            with PVP_SESSION_SETTLEMENT_LOCK:
                if session_id not in PREPARED_BATTLE_HISTORY_IDS:
                    save_battle_history(current_user(), f"battle_session_{session.battle_mode}", {
                        "sessionId": session_id, "teamA": session.team_a_payload, "teamB": session.team_b_payload,
                    }, session.result)
                    PREPARED_BATTLE_HISTORY_IDS.add(session_id)
        return jsonify({"data": _battle_session_view(session, current_user())})
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 403
    except battle_sessions.BattleSessionError as exc:
        return jsonify({"error": str(exc)}), 409
    except Exception:
        logging.exception("Failed to confirm battle formation")
        return jsonify({"error": "Unable to confirm formation. Please retry."}), 500


@app.route("/api/battle/sessions", methods=["POST"])
@auth_required
def create_battle_session_route():
    try:
        data = request.json or {}
        battle_mode = str(data.get("battleMode") or "1v1").strip()
        control_mode = str(data.get("controlMode") or "rest").strip().lower() or "rest"
        label_a = str(data.get("labelA") or "Team A").strip()
        label_b = str(data.get("labelB") or "Team B").strip()
        team_a = data.get("teamA") or []
        team_b = data.get("teamB") or []
        try:
            wait_seconds = int(data.get("waitSeconds") or 30)
        except (TypeError, ValueError):
            wait_seconds = 30
        wait_seconds = max(1, min(60, wait_seconds))

        preparing = data.get("preparation") is True
        if control_mode != "rest" and not (preparing and control_mode in {"program", "manual"}):
            return jsonify({"error": "Battle sessions currently support rest control only"}), 400
        if not isinstance(team_a, list) or not isinstance(team_b, list) or not team_a or not team_b:
            return jsonify({"error": "Two teams are required"}), 400
        if battle_mode == "pve_4v6" and (len(team_a) > 4 or len(team_b) > 6):
            return jsonify({"error": "pve_4v6 allows at most 4 player units and 6 enemies"}), 400

        session = battle_sessions.create_battle_session(
            battle_mode=battle_mode,
            control_mode=control_mode,
            label_a=label_a,
            label_b=label_b,
            team_a=team_a,
            team_b=team_b,
            wait_seconds=wait_seconds,
            require_confirmation=preparing,
            auto_ready_b=preparing,
            participant_ids={"A": str(current_user()["id"])} if preparing else {},
        )
        return jsonify({"data": _battle_session_view(session, current_user())}), 201
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/battle/sessions/<session_id>", methods=["GET"])
@auth_required
def get_battle_session_route(session_id):
    try:
        battle_sessions.advance_due_sessions()
        session = battle_sessions.get_battle_session(session_id)
        if not session:
            return jsonify({"error": "Battle session not found"}), 404
        _assert_pvp_session_access(session_id, current_user())
        _battle_session_view(session, current_user())
        _sync_pvp_match_session_by_session_id(session_id)
        _sync_friendly_battle_session(session)
        return jsonify({"data": _battle_session_view(session, current_user())})
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/battle/sessions/<session_id>/actions", methods=["POST"])
@auth_required
def advance_battle_session_route(session_id):
    try:
        battle_sessions.advance_due_sessions()
        session = battle_sessions.get_battle_session(session_id)
        if not session:
            return jsonify({"error": "Battle session not found"}), 404

        data = request.json or {}
        action = data.get("action")
        if not isinstance(action, dict):
            return jsonify({"error": "action is required"}), 400

        pvp_match = _assert_pvp_session_access(session_id, current_user(), action)
        view = _battle_session_view(session, current_user())
        if session.control_mode == "manual" and str(action.get("actorTag") or "")[:1] != view.get("viewerSide"):
            raise PermissionError("You can only command units on your own side")
        snapshot = session.submit_action(action)
        if snapshot.get("status") == "resolved":
            if pvp_match:
                _sync_pvp_match_session(pvp_match["id"])
            elif session.session_id in FRIEND_BATTLE_SESSION_IDS:
                _sync_friendly_battle_session(session)
            else:
                try:
                    save_battle_history(
                        current_user(),
                        f"battle_session_{session.battle_mode}",
                        {
                            "sessionId": session.session_id,
                            "battleMode": session.battle_mode,
                            "controlMode": session.control_mode,
                            "labelA": session.label_a,
                            "labelB": session.label_b,
                            "teamA": session.team_a_payload,
                            "teamB": session.team_b_payload,
                        },
                        session.result,
                    )
                except Exception:
                    logging.exception("Failed to persist battle session history")

        return jsonify({"data": _battle_session_view(session, current_user())})
    except PermissionError as e:
        return jsonify({"error": str(e)}), 403
    except battle_sessions.BattleSessionError as e:
        return jsonify({"error": str(e)}), 409
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


from pve_api import register_pve_routes
register_pve_routes(app, auth_required, current_user)


@app.route("/api/pve/start", methods=["POST"])
@auth_required
def pve_start():
    charged = False
    user = current_user()
    try:
        data = request.json or {}
        theme_key = (data.get("themeKey") or data.get("theme_key") or "tower").strip()
        hero_ids = data.get("heroIds") or data.get("hero_ids") or []

        if theme_key == 'void_labyrinth':
            return jsonify({'error': 'Void Labyrinth uses the free /api/pve/runs endpoint.'}), 400

        if not theme_key:
            return jsonify({"error": "themeKey is required"}), 400
        if not isinstance(hero_ids, list) or not hero_ids:
            return jsonify({"error": "At least one hero is required"}), 400

        hero_ids = [str(hero_id) for hero_id in hero_ids if str(hero_id).strip()]
        if not hero_ids:
            return jsonify({"error": "At least one hero is required"}), 400

        try:
            adjust_dust_balance(
                user["id"],
                -settings.dust_cost_pve_entry,
                "pve_entry",
                ref_type="pve_run",
                metadata={"theme_key": theme_key, "hero_ids": hero_ids},
            )
            charged = True
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 402

        placeholders = ",".join(["%s"] * len(hero_ids))
        hero_rows = fetch_all(
            f"""
            SELECT id, hero_payload, created_at
            FROM heroes
            WHERE user_id = %s AND id IN ({placeholders})
            """,
            (user["id"], *hero_ids),
        )
        hero_map = {str(row["id"]): row for row in hero_rows}
        if len(hero_map) != len(hero_ids):
            raise ValueError("Some heroes were not found in your vault")

        party = []
        for hero_id in hero_ids:
            row = hero_map[hero_id]
            party.append(
                {
                    "id": hero_id,
                    "hero_payload": normalize_json_value(row["hero_payload"]),
                    "created_at": row["created_at"].isoformat() if hasattr(row["created_at"], "isoformat") else row["created_at"],
                }
            )

        seed = secrets.randbits(31)
        run_payload = {
            "theme_key": theme_key,
            "party": party,
            "entry_cost_dust": settings.dust_cost_pve_entry,
        }
        run_row = save_pve_run(user, theme_key, settings.dust_cost_pve_entry, seed, run_payload)
        save_pve_party(run_row["id"], party)
        save_pve_stage(
            run_row["id"],
            1,
            enemy_payload={
                "theme_key": theme_key,
                "floor": 1,
                "hint": "Enemy generation can be added later by the battle engine.",
            },
            battle_result={},
            reward_payload={},
            cleared=False,
        )

        return jsonify(
            {
                "ok": True,
                "run": normalize_json_value(run_row),
                "party": party,
                "economy": economy_snapshot(user),
            }
        )
    except Exception as e:
        if charged:
            try:
                adjust_dust_balance(
                    user["id"],
                    settings.dust_cost_pve_entry,
                    "pve_entry_refund",
                    ref_type="pve_run",
                    metadata={"error": str(e)},
                )
            except Exception:
                logging.exception("Failed to refund pve entry cost")
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/economy/repair", methods=["POST"])
@auth_required
def repair_hero():
    user = current_user()
    charged = False
    try:
        data = request.json or {}
        hero_id = data.get("heroId") or data.get("hero_id")
        note = (data.get("note") or "").strip()

        if not hero_id:
            return jsonify({"error": "heroId is required"}), 400

        hero_row = fetch_one(
            """
            SELECT id, hero_payload, created_at
            FROM heroes
            WHERE user_id = %s AND id = %s
            """,
            (user["id"], hero_id),
        )
        if not hero_row:
            return jsonify({"error": "Hero not found"}), 404

        try:
            adjust_dust_balance(
                user["id"],
                -settings.dust_cost_repair,
                "repair_hero",
                ref_type="hero",
                ref_id=str(hero_row["id"]),
                metadata={"note": note},
            )
            charged = True
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 402

        audit_row = save_audit_log(
            user,
            "repair_hero",
            entity_type="hero",
            entity_id=hero_row["id"],
            payload={"hero_id": str(hero_row["id"]), "note": note, "cost": settings.dust_cost_repair},
        )
        return jsonify(
            {
                "ok": True,
                "hero": normalize_json_value(hero_row),
                "audit": normalize_json_value(audit_row) if audit_row else None,
                "economy": economy_snapshot(user),
            }
        )
    except Exception as e:
        if charged:
            try:
                adjust_dust_balance(
                    user["id"],
                    settings.dust_cost_repair,
                    "repair_refund",
                    ref_type="hero",
                    metadata={"error": str(e)},
                )
            except Exception:
                logging.exception("Failed to refund repair cost")
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/economy/pvp-entry", methods=["POST"])
@auth_required
def pvp_entry():
    user = current_user()
    charged = False
    try:
        data = request.json or {}
        queue_key = (data.get("queueKey") or data.get("queue_key") or "default").strip()
        hero_ids = data.get("heroIds") or data.get("hero_ids") or []

        if hero_ids:
            return jsonify(_join_pvp_queue(user, data, require_team_payload=False))

        try:
            adjust_dust_balance(
                user["id"],
                -settings.dust_cost_pvp_entry,
                "pvp_entry",
                ref_type="pvp",
                metadata={"queue_key": queue_key},
            )
            charged = True
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 402

        ticket = save_audit_log(
            user,
            "pvp_entry",
            entity_type="queue",
            entity_id=None,
            payload={"queue_key": queue_key, "cost": settings.dust_cost_pvp_entry},
        )
        return jsonify(
            {
                "ok": True,
                "ticket": normalize_json_value(ticket) if ticket else None,
                "queue_key": queue_key,
                "economy": economy_snapshot(user),
            }
        )
    except Exception as e:
        if charged:
            try:
                adjust_dust_balance(
                    user["id"],
                    settings.dust_cost_pvp_entry,
                    "pvp_entry_refund",
                    ref_type="pvp",
                    metadata={"error": str(e)},
                )
            except Exception:
                logging.exception("Failed to refund pvp entry cost")
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


def _ordered_friend_pair(user_id_a, user_id_b):
    values = sorted((str(user_id_a), str(user_id_b)))
    return values[0], values[1]


def _friendship_exists(user_id_a, user_id_b):
    user_a_id, user_b_id = _ordered_friend_pair(user_id_a, user_id_b)
    return bool(fetch_one("SELECT 1 AS ok FROM friendships WHERE user_a_id = %s AND user_b_id = %s", (user_a_id, user_b_id)))


def _friends_snapshot(user_id):
    execute("UPDATE friend_challenges SET status = 'expired' WHERE status = 'pending' AND expires_at <= now()")
    friends = fetch_all(
        """
        SELECT u.id, u.email, f.created_at AS friends_since
        FROM friendships f
        JOIN users u ON u.id = CASE WHEN f.user_a_id = %s THEN f.user_b_id ELSE f.user_a_id END
        WHERE f.user_a_id = %s OR f.user_b_id = %s
        ORDER BY lower(u.email)
        """,
        (user_id, user_id, user_id),
    )
    incoming_requests = fetch_all(
        """
        SELECT r.id, r.status, r.created_at, u.id AS user_id, u.email
        FROM friend_requests r JOIN users u ON u.id = r.sender_user_id
        WHERE r.receiver_user_id = %s AND r.status = 'pending'
        ORDER BY r.created_at DESC
        """,
        (user_id,),
    )
    outgoing_requests = fetch_all(
        """
        SELECT r.id, r.status, r.created_at, u.id AS user_id, u.email
        FROM friend_requests r JOIN users u ON u.id = r.receiver_user_id
        WHERE r.sender_user_id = %s AND r.status = 'pending'
        ORDER BY r.created_at DESC
        """,
        (user_id,),
    )
    incoming_challenges = fetch_all(
        """
        SELECT c.*, u.email AS challenger_email
        FROM friend_challenges c JOIN users u ON u.id = c.challenger_user_id
        WHERE c.challenged_user_id = %s AND c.status IN ('pending', 'accepted')
        ORDER BY c.created_at DESC
        """,
        (user_id,),
    )
    outgoing_challenges = fetch_all(
        """
        SELECT c.*, u.email AS challenged_email
        FROM friend_challenges c JOIN users u ON u.id = c.challenged_user_id
        WHERE c.challenger_user_id = %s AND c.status IN ('pending', 'accepted', 'resolved')
        ORDER BY c.created_at DESC LIMIT 20
        """,
        (user_id,),
    )
    return {
        "friends": normalize_rows(friends),
        "incoming_requests": normalize_rows(incoming_requests),
        "outgoing_requests": normalize_rows(outgoing_requests),
        "incoming_challenges": normalize_rows(incoming_challenges),
        "outgoing_challenges": normalize_rows(outgoing_challenges),
    }


@app.route("/api/friends", methods=["GET"])
@session_required
def friends_list():
    return jsonify({"ok": True, "data": _friends_snapshot(current_user()["id"])})


@app.route("/api/friends/requests", methods=["POST"])
@session_required
def friend_request_create():
    user = current_user()
    try:
        email = str((request.json or {}).get("email") or "").strip().lower()
        if not email:
            raise ValueError("Friend email is required")
        target = fetch_one("SELECT id, email FROM users WHERE lower(email) = %s", (email,))
        if not target:
            raise ValueError("No player exists with that email")
        if str(target["id"]) == str(user["id"]):
            raise ValueError("You cannot add yourself")
        if _friendship_exists(user["id"], target["id"]):
            raise ValueError("This player is already your friend")
        existing = fetch_one(
            """
            SELECT id, sender_user_id, receiver_user_id FROM friend_requests
            WHERE status = 'pending'
              AND LEAST(sender_user_id, receiver_user_id) = LEAST(%s::uuid, %s::uuid)
              AND GREATEST(sender_user_id, receiver_user_id) = GREATEST(%s::uuid, %s::uuid)
            """,
            (user["id"], target["id"], user["id"], target["id"]),
        )
        if existing:
            if str(existing["sender_user_id"]) == str(target["id"]):
                raise ValueError("This player already sent you a friend request")
            raise ValueError("Friend request already sent")
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO friend_requests (sender_user_id, receiver_user_id)
                    VALUES (%s, %s)
                    RETURNING id, sender_user_id, receiver_user_id, status, created_at
                    """,
                    (user["id"], target["id"]),
                )
                row = cur.fetchone()
            conn.commit()
        return jsonify({"ok": True, "data": normalize_json_value(row), "friends": _friends_snapshot(user["id"])}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        logging.exception("Failed to create friend request")
        return jsonify({"error": "Failed to create friend request"}), 500


@app.route("/api/friends/requests/<request_id>/<action>", methods=["POST"])
@session_required
def friend_request_respond(request_id, action):
    user = current_user()
    if action not in {"accept", "decline"}:
        return jsonify({"error": "Unsupported friend request action"}), 404
    try:
        UUID(str(request_id))
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT * FROM friend_requests WHERE id = %s AND receiver_user_id = %s FOR UPDATE",
                    (request_id, user["id"]),
                )
                row = cur.fetchone()
                if not row:
                    raise ValueError("Friend request not found")
                if row["status"] != "pending":
                    raise ValueError("Friend request is no longer pending")
                next_status = "accepted" if action == "accept" else "declined"
                cur.execute("UPDATE friend_requests SET status = %s, responded_at = now() WHERE id = %s", (next_status, request_id))
                if action == "accept":
                    user_a_id, user_b_id = _ordered_friend_pair(row["sender_user_id"], row["receiver_user_id"])
                    cur.execute(
                        "INSERT INTO friendships (user_a_id, user_b_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                        (user_a_id, user_b_id),
                    )
                    cur.execute(
                        """
                        UPDATE friend_requests SET status = 'cancelled', responded_at = now()
                        WHERE id <> %s AND status = 'pending'
                          AND LEAST(sender_user_id, receiver_user_id) = LEAST(%s::uuid, %s::uuid)
                          AND GREATEST(sender_user_id, receiver_user_id) = GREATEST(%s::uuid, %s::uuid)
                        """,
                        (request_id, user_a_id, user_b_id, user_a_id, user_b_id),
                    )
            conn.commit()
        return jsonify({"ok": True, "data": _friends_snapshot(user["id"])})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        logging.exception("Failed to respond to friend request")
        return jsonify({"error": "Failed to respond to friend request"}), 500


@app.route("/api/friends/<friend_user_id>", methods=["DELETE"])
@session_required
def friend_remove(friend_user_id):
    user = current_user()
    try:
        UUID(str(friend_user_id))
        user_a_id, user_b_id = _ordered_friend_pair(user["id"], friend_user_id)
        execute("DELETE FROM friendships WHERE user_a_id = %s AND user_b_id = %s", (user_a_id, user_b_id))
        execute(
            "UPDATE friend_challenges SET status = 'cancelled', responded_at = now() WHERE status = 'pending' AND LEAST(challenger_user_id, challenged_user_id) = LEAST(%s::uuid, %s::uuid) AND GREATEST(challenger_user_id, challenged_user_id) = GREATEST(%s::uuid, %s::uuid)",
            (user_a_id, user_b_id, user_a_id, user_b_id),
        )
        return jsonify({"ok": True, "data": _friends_snapshot(user["id"])})
    except Exception:
        logging.exception("Failed to remove friend")
        return jsonify({"error": "Failed to remove friend"}), 400


@app.route("/api/friends/<friend_user_id>/challenges", methods=["POST"])
@session_required
def friend_challenge_create(friend_user_id):
    user = current_user()
    try:
        UUID(str(friend_user_id))
        if not _friendship_exists(user["id"], friend_user_id):
            raise ValueError("Only friends can challenge each other")
        formation, hero_ids = _normalize_arena_formation((request.json or {}).get("formation"))
        team, total_bp = _load_pvp_team_snapshot(user, hero_ids, "arena_2x3", formation=formation)
        existing = fetch_one(
            "SELECT id FROM friend_challenges WHERE status = 'pending' AND LEAST(challenger_user_id, challenged_user_id) = LEAST(%s::uuid, %s::uuid) AND GREATEST(challenger_user_id, challenged_user_id) = GREATEST(%s::uuid, %s::uuid)",
            (user["id"], friend_user_id, user["id"], friend_user_id),
        )
        if existing:
            raise ValueError("A friendly challenge is already pending between you")
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO friend_challenges (
                        challenger_user_id, challenged_user_id, challenger_formation, challenger_team_snapshot
                    ) VALUES (%s, %s, %s::jsonb, %s::jsonb)
                    RETURNING *
                    """,
                    (
                        user["id"], friend_user_id, serialize_json({"mode": "arena_2x3", "board": formation}),
                        serialize_json({"hero_ids": hero_ids, "team": team, "total_bp": total_bp}),
                    ),
                )
                row = cur.fetchone()
            conn.commit()
        return jsonify({"ok": True, "data": normalize_json_value(row), "friends": _friends_snapshot(user["id"])}), 201
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception:
        logging.exception("Failed to create friend challenge")
        return jsonify({"error": "Failed to create friend challenge"}), 500


@app.route("/api/friend-challenges/<challenge_id>/<action>", methods=["POST"])
@session_required
def friend_challenge_respond(challenge_id, action):
    user = current_user()
    claimed_challenge_id = None
    if action not in {"accept", "decline", "cancel"}:
        return jsonify({"error": "Unsupported challenge action"}), 404
    try:
        UUID(str(challenge_id))
        challenge = fetch_one("SELECT * FROM friend_challenges WHERE id = %s", (challenge_id,))
        if not challenge:
            return jsonify({"error": "Friendly challenge not found"}), 404
        if challenge["status"] != "pending":
            raise ValueError("Friendly challenge is no longer pending")
        is_challenger = str(challenge["challenger_user_id"]) == str(user["id"])
        is_challenged = str(challenge["challenged_user_id"]) == str(user["id"])
        if action == "cancel" and not is_challenger:
            return jsonify({"error": "Only the challenger can cancel this challenge"}), 403
        if action in {"accept", "decline"} and not is_challenged:
            return jsonify({"error": "Only the invited friend can respond"}), 403
        if action != "accept":
            next_status = "declined" if action == "decline" else "cancelled"
            execute("UPDATE friend_challenges SET status = %s, responded_at = now() WHERE id = %s", (next_status, challenge_id))
            return jsonify({"ok": True, "data": _friends_snapshot(user["id"])})
        if challenge["expires_at"] <= datetime.now(timezone.utc):
            execute("UPDATE friend_challenges SET status = 'expired', responded_at = now() WHERE id = %s", (challenge_id,))
            raise ValueError("Friendly challenge expired")

        formation, hero_ids = _normalize_arena_formation((request.json or {}).get("formation"))
        challenged_team, challenged_bp = _load_pvp_team_snapshot(user, hero_ids, "arena_2x3", formation=formation)
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE friend_challenges
                    SET status = 'accepted', responded_at = now()
                    WHERE id = %s AND challenged_user_id = %s AND status = 'pending'
                    RETURNING id
                    """,
                    (challenge_id, user["id"]),
                )
                claimed = cur.fetchone()
            conn.commit()
        if not claimed:
            raise ValueError("Friendly challenge is no longer pending")
        claimed_challenge_id = challenge_id
        challenger_snapshot = normalize_json_value(challenge["challenger_team_snapshot"])
        challenger_team = challenger_snapshot.get("team", []) if isinstance(challenger_snapshot, dict) else []
        challenger = fetch_one("SELECT id, email FROM users WHERE id = %s", (challenge["challenger_user_id"],))
        challenged = fetch_one("SELECT id, email FROM users WHERE id = %s", (challenge["challenged_user_id"],))
        session = battle_sessions.create_battle_session(
            battle_mode="arena_2x3", control_mode="manual",
            label_a=str(challenger["email"]).split("@", 1)[0],
            label_b=str(challenged["email"]).split("@", 1)[0],
            team_a=[item["hero_payload"] for item in challenger_team],
            team_b=[item["hero_payload"] for item in challenged_team],
            wait_seconds=30, require_confirmation=True,
            participant_ids={"A": str(challenger["id"]), "B": str(challenged["id"])},
        )
        FRIEND_BATTLE_SESSION_IDS[session.session_id] = str(challenge_id)
        challenged_snapshot = {"hero_ids": hero_ids, "team": challenged_team, "total_bp": challenged_bp}
        execute(
            """UPDATE friend_challenges
               SET challenged_formation = %s::jsonb, challenged_team_snapshot = %s::jsonb,
                   battle_session_id = %s, responded_at = now()
               WHERE id = %s""",
            (serialize_json({"mode": "arena_2x3", "board": formation}), serialize_json(challenged_snapshot), session.session_id, challenge_id),
        )
        prepared = fetch_one("SELECT * FROM friend_challenges WHERE id = %s", (challenge_id,))
        return jsonify({"ok": True, "data": normalize_json_value(prepared), "battle": None, "battle_session": _battle_session_view(session, user)})
    except ValueError as exc:
        if claimed_challenge_id:
            execute("UPDATE friend_challenges SET status = 'pending', responded_at = NULL WHERE id = %s AND status = 'accepted'", (claimed_challenge_id,))
        return jsonify({"error": str(exc)}), 400
    except Exception:
        if claimed_challenge_id:
            try:
                execute("UPDATE friend_challenges SET status = 'pending', responded_at = NULL WHERE id = %s AND status = 'accepted'", (claimed_challenge_id,))
            except Exception:
                logging.exception("Failed to release friend challenge after battle error")
        logging.exception("Failed to respond to friend challenge")
        return jsonify({"error": "Failed to respond to friend challenge"}), 500


@app.route("/api/friend-challenges/<challenge_id>", methods=["GET"])
@session_required
def friend_challenge_get(challenge_id):
    user = current_user()
    challenge = fetch_one(
        "SELECT * FROM friend_challenges WHERE id = %s AND (challenger_user_id = %s OR challenged_user_id = %s)",
        (challenge_id, user["id"], user["id"]),
    )
    if not challenge:
        return jsonify({"error": "Friendly challenge not found"}), 404
    return jsonify({"ok": True, "data": normalize_json_value(challenge)})


@app.route("/api/pvp/join", methods=["POST"])
@auth_required
def pvp_join():
    try:
        data = request.json or {}
        result = _join_pvp_queue(current_user(), data, require_team_payload=True)
        if result is None:
            return jsonify({"error": "heroIds are required for PvP matchmaking"}), 400
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/pvp/entries/<entry_id>", methods=["GET"])
@auth_required
def pvp_entry_status(entry_id):
    user = current_user()
    battle_sessions.advance_due_sessions()
    entry = fetch_one(
        """
        SELECT id, user_id, queue_key, battle_mode, stake_dust, bp_value, status, team_snapshot,
               formation_snapshot, opponent_entry_id, match_id, expires_at, matched_at, cancelled_at, created_at
        FROM pvp_queue_entries
        WHERE id = %s AND user_id = %s
        """,
        (entry_id, user["id"]),
    )
    if not entry:
        return jsonify({"error": "PvP entry not found"}), 404

    entry = normalize_json_value(entry)
    if entry["status"] == "waiting" and entry["expires_at"]:
        expires_at = entry["expires_at"]
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at)
        if expires_at <= datetime.now(timezone.utc):
            try:
                adjust_dust_balance(
                    user["id"],
                    int(entry["stake_dust"]),
                    "pvp_entry_expire_refund",
                    ref_type="pvp_queue",
                    ref_id=str(entry["id"]),
                    metadata={"queue_key": entry["queue_key"], "battle_mode": entry["battle_mode"]},
                )
            except Exception:
                logging.exception("Failed to refund expired PvP entry")
            execute(
                """
                UPDATE pvp_queue_entries
                SET status = 'expired',
                    cancelled_at = now()
                WHERE id = %s
                """,
                (entry["id"],),
            )
            _clear_pvp_entry_card_locks(entry)
            entry["status"] = "expired"
            entry["cancelled_at"] = datetime.now(timezone.utc).isoformat()

    match = fetch_one(
        """
        SELECT id, queue_key, battle_mode, entry_a_id, entry_b_id, user_a_id, user_b_id,
               stake_dust, bp_a, bp_b, bp_gap_pct, status, battle_payload, battle_result,
               formation_a, formation_b, reward_payload, card_state_changes,
               battle_session_id, battle_id, winner_user_id, winner_side, created_at, resolved_at
        FROM pvp_matches
        WHERE entry_a_id = %s OR entry_b_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (entry["id"], entry["id"]),
    )
    battle_session = None
    if match:
        match, battle_session = _sync_pvp_match_session(match["id"])
        session = battle_sessions.get_battle_session(str((match or {}).get("battle_session_id") or ""))
        if session:
            battle_session = _battle_session_view(session, user)
    return jsonify({"ok": True, "entry": entry, "match": match, "battle_session": battle_session})


@app.route("/api/pvp/cancel", methods=["POST"])
@auth_required
def pvp_cancel():
    user = current_user()
    try:
        data = request.json or {}
        entry_id = data.get("entryId") or data.get("entry_id")
        if not entry_id:
            return jsonify({"error": "entryId is required"}), 400

        entry = fetch_one(
            """
            SELECT id, user_id, queue_key, battle_mode, stake_dust, bp_value, status, team_snapshot,
                   formation_snapshot, opponent_entry_id, match_id, expires_at, matched_at, cancelled_at, created_at
            FROM pvp_queue_entries
            WHERE id = %s AND user_id = %s
            """,
            (entry_id, user["id"]),
        )
        if not entry:
            return jsonify({"error": "PvP entry not found"}), 404
        if entry["status"] != "waiting":
            return jsonify({"error": "Only waiting entries can be cancelled"}), 400

        adjust_dust_balance(
            user["id"],
            int(entry["stake_dust"]),
            "pvp_cancel_refund",
            ref_type="pvp_queue",
            ref_id=str(entry["id"]),
            metadata={"queue_key": entry["queue_key"], "battle_mode": entry["battle_mode"]},
        )
        execute(
            """
            UPDATE pvp_queue_entries
            SET status = 'cancelled',
                cancelled_at = now()
            WHERE id = %s
            """,
            (entry["id"],),
        )
        _clear_pvp_entry_card_locks(entry)
        return jsonify({"ok": True, "entry": normalize_json_value({**entry, "status": "cancelled"}), "economy": economy_snapshot(user)})
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/cards/<card_id>/revive", methods=["POST"])
@auth_required
def revive_card(card_id):
    user = current_user()
    try:
        UUID(str(card_id))
    except Exception:
        return jsonify({"error": "Invalid card id"}), 400

    try:
        ensure_user_wallet(user["id"])
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, user_id, hero_payload, pvp_life_state, pve_life_state,
                           card_status, locked_reason, pvp_dead_at, decomposed_at,
                           active_pvp_entry_id, created_at
                    FROM heroes
                    WHERE id = %s AND user_id = %s
                    FOR UPDATE
                    """,
                    (card_id, user["id"]),
                )
                hero = cur.fetchone()
                if not hero:
                    return jsonify({"error": "Card not found"}), 404
                if hero["pvp_life_state"] != "pvp_dead":
                    return jsonify({"error": "Only pvp_dead cards can be revived"}), 400
                if hero["card_status"] != "active":
                    return jsonify({"error": "Only active cards can be revived"}), 400

                cur.execute(
                    """
                    SELECT dust_balance
                    FROM user_wallets
                    WHERE user_id = %s
                    FOR UPDATE
                    """,
                    (user["id"],),
                )
                wallet = cur.fetchone()
                current_balance = int(wallet["dust_balance"] if wallet else 0)
                next_balance = current_balance - int(settings.dust_cost_pvp_revive)
                if next_balance < 0:
                    return jsonify({"error": "Insufficient dust"}), 400

                cur.execute(
                    """
                    UPDATE user_wallets
                    SET dust_balance = %s, updated_at = now()
                    WHERE user_id = %s
                    """,
                    (next_balance, user["id"]),
                )
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, delta, balance_after, reason, ref_type, ref_id, metadata
                    )
                    VALUES (%s, 'dust', %s, %s, 'pvp_revive', 'hero', %s, %s::jsonb)
                    """,
                    (
                        user["id"],
                        -int(settings.dust_cost_pvp_revive),
                        next_balance,
                        card_id,
                        serialize_json({"cost": settings.dust_cost_pvp_revive}),
                    ),
                )
                cur.execute(
                    """
                    UPDATE heroes
                    SET pvp_life_state = 'active',
                        pvp_dead_at = NULL
                    WHERE id = %s AND user_id = %s
                    RETURNING id, hero_payload, pvp_life_state, pve_life_state, card_status,
                              locked_reason, pvp_dead_at, decomposed_at, active_pvp_entry_id, created_at
                    """,
                    (card_id, user["id"]),
                )
                revived = cur.fetchone()
                cur.execute(
                    """
                    UPDATE card_death_records
                    SET revived_at = now()
                    WHERE id = (
                        SELECT id
                        FROM card_death_records
                        WHERE hero_id = %s
                          AND user_id = %s
                          AND mode = 'pvp'
                          AND death_state = 'pvp_dead'
                          AND revived_at IS NULL
                        ORDER BY created_at DESC
                        LIMIT 1
                    )
                    """,
                    (card_id, user["id"]),
                )
            conn.commit()

        _safe_record_daily_task_progress(user["id"], "revive_once")
        return jsonify({"ok": True, "card": normalize_json_value(revived), "economy": economy_snapshot(user)})
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


def _decompose_dust_return(hero_payload):
    try:
        bp = int(float(str((hero_payload or {}).get("BP", 0))))
    except (TypeError, ValueError):
        bp = 0
    return max(10, bp * int(settings.dust_decompose_bp_percent) // 100)


@app.route("/api/cards/<card_id>/decompose", methods=["POST"])
@auth_required
def decompose_card(card_id):
    user = current_user()
    try:
        UUID(str(card_id))
    except Exception:
        return jsonify({"error": "Invalid card id"}), 400

    try:
        ensure_user_wallet(user["id"])
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, user_id, hero_payload, pvp_life_state, pve_life_state,
                           card_status, locked_reason, pvp_dead_at, decomposed_at,
                           active_pvp_entry_id, created_at
                    FROM heroes
                    WHERE id = %s AND user_id = %s
                    FOR UPDATE
                    """,
                    (card_id, user["id"]),
                )
                hero = cur.fetchone()
                if not hero:
                    return jsonify({"error": "Card not found"}), 404
                if hero["card_status"] == "decomposed":
                    return jsonify({"error": "This card has already been decomposed"}), 400
                if hero["card_status"] != "active":
                    return jsonify({"error": "Locked cards cannot be decomposed"}), 400
                if hero["active_pvp_entry_id"]:
                    return jsonify({"error": "Queued cards cannot be decomposed. Leave the Arena queue first."}), 400

                dust_returned = _decompose_dust_return(hero["hero_payload"])

                cur.execute(
                    """
                    SELECT dust_balance
                    FROM user_wallets
                    WHERE user_id = %s
                    FOR UPDATE
                    """,
                    (user["id"],),
                )
                wallet = cur.fetchone()
                next_balance = int(wallet["dust_balance"] if wallet else 0) + dust_returned

                cur.execute(
                    """
                    UPDATE user_wallets
                    SET dust_balance = %s, updated_at = now()
                    WHERE user_id = %s
                    """,
                    (next_balance, user["id"]),
                )
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, delta, balance_after, reason, ref_type, ref_id, metadata
                    )
                    VALUES (%s, 'dust', %s, %s, 'decompose', 'hero', %s, %s::jsonb)
                    """,
                    (
                        user["id"],
                        dust_returned,
                        next_balance,
                        card_id,
                        serialize_json({"dust_returned": dust_returned, "bp_percent": settings.dust_decompose_bp_percent}),
                    ),
                )
                cur.execute(
                    """
                    UPDATE heroes
                    SET card_status = 'decomposed',
                        decomposed_at = now(),
                        equipped_relic_type = NULL
                    WHERE id = %s AND user_id = %s
                    RETURNING id, hero_payload, pvp_life_state, pve_life_state, card_status,
                              locked_reason, pvp_dead_at, decomposed_at, active_pvp_entry_id, created_at
                    """,
                    (card_id, user["id"]),
                )
                decomposed = cur.fetchone()
            conn.commit()

        return jsonify({"ok": True, "card": normalize_json_value(decomposed), "dust_returned": dust_returned, "economy": economy_snapshot(user)})
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


def _card_row_for_response(row):
    return normalize_json_value(row) if row else None


def _parse_relic_type(payload):
    if not isinstance(payload, dict):
        return None
    relic_type = payload.get("relicType", payload.get("relic_type"))
    if relic_type is None:
        return None
    relic_type = str(relic_type).strip()
    return relic_type or None


def _validate_known_relic(relic_type):
    definition = get_relic_definition(relic_type)
    if not definition:
        raise ValueError("Unknown relic type")
    return definition


def _parse_market_quantity(payload):
    if not isinstance(payload, dict):
        return 1
    raw = payload.get("quantity", 1)
    try:
        quantity = int(raw)
    except Exception as exc:
        raise ValueError("Quantity must be an integer") from exc
    if quantity < 1 or quantity > 99:
        raise ValueError("Quantity must be between 1 and 99")
    return quantity


def _market_quote_for_relic(relic_type):
    _validate_known_relic(relic_type)
    return relic_market_quote(relic_type, get_relic_catalog())


def market_board_snapshot(user):
    relics = get_user_relics(user["id"])
    owned_amounts = {str(row["relic_type"]): int(row["amount"]) for row in relics}
    transactions = get_recent_resource_transactions(user["id"], 20)
    return build_market_board_snapshot(
        catalog=get_relic_catalog(),
        owned_amounts=owned_amounts,
        transactions=normalize_rows(transactions),
    )


@app.route("/api/market/board", methods=["GET"])
@auth_required
def get_market_board():
    user = current_user()
    try:
        return jsonify({"data": market_board_snapshot(user)})
    except Exception as exc:
        logging.exception(exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/market/relics/buy", methods=["POST"])
@auth_required
def market_buy_relic():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    relic_type = _parse_relic_type(payload)
    if not relic_type:
        return jsonify({"error": "Relic type required"}), 400

    try:
        quantity = _parse_market_quantity(payload)
        catalog = get_relic_catalog()
        if not is_market_purchasable(relic_type, catalog):
            return jsonify({"error": "This relic is not currently available for purchase"}), 400
        quote = relic_market_quote(relic_type, catalog)
        unit_price = int(quote["ask_price"])
        total_price = unit_price * quantity
        ensure_user_wallet(user["id"])

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT dust_balance
                    FROM user_wallets
                    WHERE user_id = %s
                    FOR UPDATE
                    """,
                    (user["id"],),
                )
                wallet = cur.fetchone()
                current_balance = int(wallet["dust_balance"] if wallet else 0)
                next_balance = current_balance - total_price
                if next_balance < 0:
                    return jsonify({"error": "Insufficient dust"}), 400

                cur.execute(
                    """
                    UPDATE user_wallets
                    SET dust_balance = %s, updated_at = now()
                    WHERE user_id = %s
                    """,
                    (next_balance, user["id"]),
                )
                trade_metadata = {
                    "side": "buy",
                    "relic_type": relic_type,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "total_price": total_price,
                    "purchase_window": quote.get("purchase_window"),
                }
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, delta, balance_after, reason, ref_type, ref_id, metadata
                    )
                    VALUES (%s, 'dust', %s, %s, 'market_buy_relic', 'market_relic', NULL, %s::jsonb)
                    """,
                    (
                        user["id"],
                        -total_price,
                        next_balance,
                        serialize_json(trade_metadata),
                    ),
                )

                cur.execute(
                    """
                    INSERT INTO user_relics (user_id, relic_type, amount)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (user_id, relic_type) DO UPDATE
                    SET amount = user_relics.amount + EXCLUDED.amount,
                        updated_at = now()
                    RETURNING amount
                    """,
                    (user["id"], relic_type, quantity),
                )
                relic_row = cur.fetchone()
                next_amount = int(relic_row["amount"] if relic_row else quantity)

                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, resource_key, delta, balance_after, reason, ref_type, ref_id, metadata
                    )
                    VALUES (%s, 'relic', %s, %s, %s, 'market_buy_relic', 'market_relic', NULL, %s::jsonb)
                    """,
                    (
                        user["id"],
                        relic_type,
                        quantity,
                        next_amount,
                        serialize_json(trade_metadata),
                    ),
                )
            conn.commit()

        return jsonify(
            {
                "ok": True,
                "trade": {
                    "side": "buy",
                    "relicType": relic_type,
                    "quantity": quantity,
                    "unitPrice": unit_price,
                    "totalPrice": total_price,
                },
                "economy": economy_snapshot(user),
            }
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        logging.exception(exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/market/relics/sell", methods=["POST"])
@auth_required
def market_sell_relic():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    relic_type = _parse_relic_type(payload)
    if not relic_type:
        return jsonify({"error": "Relic type required"}), 400

    try:
        quantity = _parse_market_quantity(payload)
        quote = _market_quote_for_relic(relic_type)
        unit_price = int(quote["bid_price"])
        total_price = unit_price * quantity
        ensure_user_wallet(user["id"])

        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT amount
                    FROM user_relics
                    WHERE user_id = %s AND relic_type = %s
                    FOR UPDATE
                    """,
                    (user["id"], relic_type),
                )
                relic_row = cur.fetchone()
                current_amount = int(relic_row["amount"] if relic_row else 0)
                if current_amount < quantity:
                    return jsonify({"error": "Insufficient relics"}), 400
                next_amount = current_amount - quantity

                cur.execute(
                    """
                    UPDATE user_relics
                    SET amount = %s, updated_at = now()
                    WHERE user_id = %s AND relic_type = %s
                    """,
                    (next_amount, user["id"], relic_type),
                )
                trade_metadata = {
                    "side": "sell",
                    "relic_type": relic_type,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "total_price": total_price,
                }
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, resource_key, delta, balance_after, reason, ref_type, ref_id, metadata
                    )
                    VALUES (%s, 'relic', %s, %s, %s, 'market_sell_relic', 'market_relic', NULL, %s::jsonb)
                    """,
                    (
                        user["id"],
                        relic_type,
                        -quantity,
                        next_amount,
                        serialize_json(trade_metadata),
                    ),
                )

                cur.execute(
                    """
                    SELECT dust_balance
                    FROM user_wallets
                    WHERE user_id = %s
                    FOR UPDATE
                    """,
                    (user["id"],),
                )
                wallet = cur.fetchone()
                current_balance = int(wallet["dust_balance"] if wallet else 0)
                next_balance = current_balance + total_price

                cur.execute(
                    """
                    UPDATE user_wallets
                    SET dust_balance = %s, updated_at = now()
                    WHERE user_id = %s
                    """,
                    (next_balance, user["id"]),
                )
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, delta, balance_after, reason, ref_type, ref_id, metadata
                    )
                    VALUES (%s, 'dust', %s, %s, 'market_sell_relic', 'market_relic', NULL, %s::jsonb)
                    """,
                    (
                        user["id"],
                        total_price,
                        next_balance,
                        serialize_json(trade_metadata),
                    ),
                )
            conn.commit()

        return jsonify(
            {
                "ok": True,
                "trade": {
                    "side": "sell",
                    "relicType": relic_type,
                    "quantity": quantity,
                    "unitPrice": unit_price,
                    "totalPrice": total_price,
                },
                "economy": economy_snapshot(user),
            }
        )
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        logging.exception(exc)
        return jsonify({"error": str(exc)}), 500


DUST_PER_DIAMOND = 100

# Mock top-up packs while real payments are deferred. Recorded as test_purchase.
DIAMOND_PACKS = [
    {"id": "diamonds_60", "diamonds": 60, "price_cny": 6, "title": "Handful of Gems"},
    {"id": "diamonds_320", "diamonds": 320, "price_cny": 30, "title": "Pouch of Gems"},
    {"id": "diamonds_1080", "diamonds": 1080, "price_cny": 98, "title": "Crate of Gems"},
]

DUST_PACKS = [
    {"id": "dust_1000", "dust": 1000, "diamonds": 10, "title": "Dust Pouch"},
    {"id": "dust_5500", "dust": 5500, "diamonds": 50, "title": "Dust Cache"},
    {"id": "dust_12000", "dust": 12000, "diamonds": 100, "title": "Dust Vault"},
]


def currency_shop_snapshot():
    return {
        "dust_per_diamond": DUST_PER_DIAMOND,
        "diamond_packs": DIAMOND_PACKS,
        "dust_packs": DUST_PACKS,
    }


def _find_currency_pack(packs, pack_id):
    return next((pack for pack in packs if pack["id"] == pack_id), None)


@app.route("/api/market/currency/diamonds", methods=["POST"])
@auth_required
def market_buy_diamond_pack():
    """Simulated top-up while real payments are deferred; logged as test_purchase."""
    user = current_user()
    payload = request.get_json(silent=True) or {}
    pack = _find_currency_pack(DIAMOND_PACKS, str(payload.get("packId") or ""))
    if not pack:
        return jsonify({"error": "Unknown diamond pack"}), 404

    try:
        ensure_user_wallet(user["id"])
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT diamond_balance FROM user_wallets WHERE user_id = %s FOR UPDATE",
                    (user["id"],),
                )
                wallet = cur.fetchone()
                next_diamonds = int(wallet["diamond_balance"] if wallet else 0) + int(pack["diamonds"])
                cur.execute(
                    "UPDATE user_wallets SET diamond_balance = %s, updated_at = now() WHERE user_id = %s",
                    (next_diamonds, user["id"]),
                )
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, delta, balance_after, reason, ref_type, metadata
                    )
                    VALUES (%s, 'diamond', %s, %s, 'test_purchase', 'currency_pack', %s::jsonb)
                    """,
                    (
                        user["id"],
                        int(pack["diamonds"]),
                        next_diamonds,
                        serialize_json({"pack_id": pack["id"], "price_cny": pack["price_cny"], "test_purchase": True}),
                    ),
                )
            conn.commit()
        return jsonify({"ok": True, "pack": pack, "economy": economy_snapshot(user)})
    except Exception as exc:
        logging.exception(exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/market/currency/dust", methods=["POST"])
@auth_required
def market_buy_dust_pack():
    user = current_user()
    payload = request.get_json(silent=True) or {}
    pack = _find_currency_pack(DUST_PACKS, str(payload.get("packId") or ""))
    if not pack:
        return jsonify({"error": "Unknown dust pack"}), 404

    try:
        ensure_user_wallet(user["id"])
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT dust_balance, diamond_balance FROM user_wallets WHERE user_id = %s FOR UPDATE",
                    (user["id"],),
                )
                wallet = cur.fetchone()
                current_dust = int(wallet["dust_balance"] if wallet else 0)
                current_diamonds = int(wallet["diamond_balance"] if wallet else 0)
                cost = int(pack["diamonds"])
                if current_diamonds < cost:
                    return jsonify({"error": "Insufficient diamonds"}), 400
                next_diamonds = current_diamonds - cost
                next_dust = current_dust + int(pack["dust"])
                cur.execute(
                    "UPDATE user_wallets SET dust_balance = %s, diamond_balance = %s, updated_at = now() WHERE user_id = %s",
                    (next_dust, next_diamonds, user["id"]),
                )
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, delta, balance_after, reason, ref_type, metadata
                    )
                    VALUES (%s, 'diamond', %s, %s, 'dust_pack_purchase', 'currency_pack', %s::jsonb)
                    """,
                    (
                        user["id"],
                        -cost,
                        next_diamonds,
                        serialize_json({"pack_id": pack["id"]}),
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, delta, balance_after, reason, ref_type, metadata
                    )
                    VALUES (%s, 'dust', %s, %s, 'market_buy_dust', 'currency_pack', %s::jsonb)
                    """,
                    (
                        user["id"],
                        int(pack["dust"]),
                        next_dust,
                        serialize_json({"pack_id": pack["id"], "diamonds_spent": cost}),
                    ),
                )
            conn.commit()
        return jsonify({"ok": True, "pack": pack, "economy": economy_snapshot(user)})
    except Exception as exc:
        logging.exception(exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/cards/<card_id>/equip-relic", methods=["POST"])
@auth_required
def equip_card_relic(card_id):
    user = current_user()
    payload = request.get_json(silent=True) or {}
    relic_type = _parse_relic_type(payload)
    try:
        UUID(str(card_id))
    except Exception:
        return jsonify({"error": "Invalid card id"}), 400

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id
                    FROM heroes
                    WHERE id = %s AND user_id = %s
                    FOR UPDATE
                    """,
                    (card_id, user["id"]),
                )
                if not cur.fetchone():
                    return jsonify({"error": "Card not found"}), 404

                if relic_type:
                    definition = _validate_known_relic(relic_type)
                    if definition.get("kind") != "relic":
                        return jsonify({"error": "Only relics can be equipped. Shards are consumable enchant materials."}), 400
                    cur.execute(
                        """
                        SELECT amount
                        FROM user_relics
                        WHERE user_id = %s AND relic_type = %s
                        FOR UPDATE
                        """,
                        (user["id"], relic_type),
                    )
                    relic_row = cur.fetchone()
                    if int(relic_row["amount"] if relic_row else 0) <= 0:
                        return jsonify({"error": "Relic not owned"}), 400

                cur.execute(
                    """
                    UPDATE heroes
                    SET equipped_relic_type = %s
                    WHERE id = %s AND user_id = %s
                    RETURNING id, hero_payload, equipped_relic_type, enchantment,
                              pvp_life_state, pve_life_state, card_status,
                              locked_reason, pvp_dead_at, decomposed_at, active_pvp_entry_id, created_at
                    """,
                    (relic_type, card_id, user["id"]),
                )
                card = cur.fetchone()
            conn.commit()
        return jsonify({"ok": True, "card": _card_row_for_response(card), "economy": economy_snapshot(user)})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        logging.exception(exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/cards/<card_id>/enchant", methods=["POST"])
@auth_required
def enchant_card(card_id):
    user = current_user()
    payload = request.get_json(silent=True) or {}
    relic_type = _parse_relic_type(payload)
    if not relic_type:
        return jsonify({"error": "Relic type required"}), 400
    try:
        UUID(str(card_id))
    except Exception:
        return jsonify({"error": "Invalid card id"}), 400

    try:
        definition = _validate_known_relic(relic_type)
        if definition.get("kind") != "shard":
            return jsonify({"error": "Only shards can be bound as enchantments. Relics are card equipment."}), 400
        now_iso = datetime.now(timezone.utc).isoformat()
        enchantment = {
            "relicType": relic_type,
            "relicName": definition.get("display_name", relic_type),
            "effectProfile": definition.get("effect_profile"),
            "appliedAt": now_iso,
            "removedAt": None,
        }
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, enchantment
                    FROM heroes
                    WHERE id = %s AND user_id = %s
                    FOR UPDATE
                    """,
                    (card_id, user["id"]),
                )
                card = cur.fetchone()
                if not card:
                    return jsonify({"error": "Card not found"}), 404
                if card.get("enchantment") is not None:
                    return jsonify({"error": "Card has already been enchanted"}), 409

                cur.execute(
                    """
                    SELECT amount
                    FROM user_relics
                    WHERE user_id = %s AND relic_type = %s
                    FOR UPDATE
                    """,
                    (user["id"], relic_type),
                )
                relic_row = cur.fetchone()
                current_amount = int(relic_row["amount"] if relic_row else 0)
                if current_amount <= 0:
                    return jsonify({"error": "Insufficient shards"}), 400
                next_amount = current_amount - 1

                cur.execute(
                    """
                    UPDATE user_relics
                    SET amount = %s, updated_at = now()
                    WHERE user_id = %s AND relic_type = %s
                    """,
                    (next_amount, user["id"], relic_type),
                )
                cur.execute(
                    """
                    INSERT INTO resource_transactions (
                        user_id, resource_type, resource_key, delta, balance_after,
                        reason, ref_type, ref_id, metadata
                    )
                    VALUES (%s, 'relic', %s, -1, %s, 'card_enchant', 'hero', %s, %s::jsonb)
                    """,
                    (
                        user["id"],
                        relic_type,
                        next_amount,
                        card_id,
                        serialize_json({"enchantment": enchantment}),
                    ),
                )
                cur.execute(
                    """
                    UPDATE heroes
                    SET enchantment = %s::jsonb
                    WHERE id = %s AND user_id = %s
                    RETURNING id, hero_payload, equipped_relic_type, enchantment,
                              pvp_life_state, pve_life_state, card_status,
                              locked_reason, pvp_dead_at, decomposed_at, active_pvp_entry_id, created_at
                    """,
                    (serialize_json(enchantment), card_id, user["id"]),
                )
                updated = cur.fetchone()
            conn.commit()
        _safe_record_daily_task_progress(user["id"], "use_relic_once")
        return jsonify({"ok": True, "card": _card_row_for_response(updated), "economy": economy_snapshot(user)})
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    except Exception as exc:
        logging.exception(exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/cards/<card_id>/wash-enchant", methods=["POST"])
@auth_required
def wash_card_enchant(card_id):
    user = current_user()
    try:
        UUID(str(card_id))
    except Exception:
        return jsonify({"error": "Invalid card id"}), 400

    try:
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, enchantment
                    FROM heroes
                    WHERE id = %s AND user_id = %s
                    FOR UPDATE
                    """,
                    (card_id, user["id"]),
                )
                card = cur.fetchone()
                if not card:
                    return jsonify({"error": "Card not found"}), 404
                enchantment = card.get("enchantment")
                if not enchantment or enchantment.get("removedAt"):
                    return jsonify({"error": "No active enchantment"}), 409

                enchantment = dict(enchantment)
                enchantment["removedAt"] = datetime.now(timezone.utc).isoformat()
                cur.execute(
                    """
                    UPDATE heroes
                    SET enchantment = %s::jsonb
                    WHERE id = %s AND user_id = %s
                    RETURNING id, hero_payload, equipped_relic_type, enchantment,
                              pvp_life_state, pve_life_state, card_status,
                              locked_reason, pvp_dead_at, decomposed_at, active_pvp_entry_id, created_at
                    """,
                    (serialize_json(enchantment), card_id, user["id"]),
                )
                updated = cur.fetchone()
            conn.commit()
        return jsonify({"ok": True, "card": _card_row_for_response(updated), "economy": economy_snapshot(user)})
    except Exception as exc:
        logging.exception(exc)
        return jsonify({"error": str(exc)}), 500


@app.route("/api/me/heroes", methods=["GET"])
@auth_required
def list_my_heroes():
    user = current_user()
    from starter_cards import rebalance_starter_cards
    rebalance_starter_cards(user['id'])
    rows = fetch_all(
        """
        SELECT id, source_payload, hero_payload, equipped_relic_type, enchantment,
               pvp_life_state, pve_life_state, card_status,
               locked_reason, pvp_dead_at, decomposed_at, active_pvp_entry_id, created_at
        FROM heroes
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT 50
        """,
        (user["id"],),
    )
    return jsonify({"data": normalize_rows(rows)})


@app.route("/api/me/battles", methods=["GET"])
@auth_required
def list_my_battles():
    user = current_user()
    rows = fetch_all(
        """
        SELECT id, battle_type, payload, result, created_at
        FROM battles
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT %s
        """,
        (user["id"], BATTLE_HISTORY_LIMIT),
    )
    return jsonify({"data": normalize_rows(rows)})

if __name__ == "__main__":
    if _database_init_error is not None:
        raise SystemExit("Database initialization failed. Check backend/.env and the Supabase connection URL.")
    port = settings.port
    debug_enabled = os.getenv("FLASK_DEBUG", "0").strip().lower() in {"1", "true", "yes"}
    print(f"Server starting on http://127.0.0.1:{port}")
    app.run(
        host="127.0.0.1",
        port=port,
        debug=debug_enabled,
        use_reloader=debug_enabled,
    )
