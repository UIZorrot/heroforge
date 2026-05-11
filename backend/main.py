import base64
import json
import logging
import secrets
import warnings
from functools import wraps
from datetime import datetime, timezone
from uuid import UUID
from flask import Flask, request, jsonify
from flask_cors import CORS
from PIL import Image
import io
from pydantic.warnings import PydanticDeprecatedSince212

warnings.filterwarnings(
    "ignore",
    category=PydanticDeprecatedSince212,
    module=r"google\.genai\.types",
)
from google import genai
from google.genai import types

from auth import create_login_code, get_user_from_token, revoke_session, verify_login_code
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
from utils import extract_json
from game_logic import adjust_based_on_bp
from battle_logic import run_auto_duel, run_team_duel

settings = get_settings()

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

try:
    initialize_schema()
except Exception:
    logging.exception("Database schema initialization skipped or failed")

class GeminiModelAdapter:
    def __init__(self, client: genai.Client, model_name: str):
        self._client = client
        self._model_name = model_name

    def generate_content(self, contents, **kwargs):
        return self._client.models.generate_content(
            model=self._model_name,
            contents=contents,
            **kwargs,
        )


# Configure Gemini
GEMINI_API_KEY = settings.gemini_api_key
GEM_MODEL_NAME = settings.gemini_model

if GEMINI_API_KEY:
    _gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    model_vision = GeminiModelAdapter(_gemini_client, GEM_MODEL_NAME)
    model_text = GeminiModelAdapter(_gemini_client, GEM_MODEL_NAME)
else:
    model_vision = None
    model_text = None
    logging.warning("GEMINI_API_KEY is not configured; /api/forge will be unavailable")

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
(frozen): Decreases enemy accuracy by X
(poison): Deals X damage to the enemy at the start of each turn
(corrupt): Reduces enemy armor by X

Buffs (positive effects):
(bless): Increases X attack
(heal): Restores X HP or MP (immediate or per turn)
(haste): Increases X crit rate and accuracy
(pray): Increases X attribute

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
        "BUFF_NAME": "<stun, frozen, poison, corrupt, bless, heal, haste, pray>"
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
"TYPE": "<Attack Type>" (choose ONE canonical type: flesh, magic, thunder, weapon, gun, fire, poison, frost, dark, light, nature, water)

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
"TYPE": "<Effect Type>",
"TARGET": "<Self/ally/Enemy>",
"TARGET_NUM": "<How many units will be targeted>",
"RANGE": "<melee|ranged|self|ally|enemy>",
"IS_STUN": <true or false>,
"BUFF_TIME": <turn count, 0 if the effect does not exist>,
"BUFF_NAME": "<weakness, wound, stun, curse, bless, heal>",
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
      "BUFF_NAME": "<weakness, wound, stun, curse, bless, heal>",
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

def build_material_directive(materials):
    directives = {
        'glowGem': 'bias style and skills toward light, precision, speed, and control stability.',
        'chaosMind': 'bias style and skills toward dark, burst, volatility, and aggressive effects.',
        'emberCore': 'bias style and skills toward fire, damage-over-time pressure, and offensive momentum.',
        'frostShard': 'bias style and skills toward frost, survivability, slowing control, and defensive consistency.',
        'stormSigil': 'bias style and skills toward thunder, chain impact, acceleration, and burst tempo.',
        'voidDust': 'bias style and skills toward void, disruption, armor-pierce, and evasive unpredictability.',
    }
    labels = {
        'glowGem': 'Luminous Gem',
        'chaosMind': 'Chaos Mind',
        'emberCore': 'Ember Core',
        'frostShard': 'Frost Shard',
        'stormSigil': 'Storm Sigil',
        'voidDust': 'Void Dust',
    }
    
    notes = []
    for key, amount in materials.items():
        if amount > 0:
            name = labels.get(key, key)
            effect = directives.get(key, 'nudge theme and attributes to reflect this special material.')
            notes.append(f"{name} x{amount}: {effect}")
            
    if not notes:
        return "No special forging materials. Keep neutral style and balanced stat distribution."
    return " ".join(notes)


def _image_part_from_base64(image_base64: str):
    image_bytes = base64.b64decode(image_base64)
    image = Image.open(io.BytesIO(image_bytes))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return types.Part.from_bytes(data=buffer.getvalue(), mime_type="image/png")


def get_bearer_token():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()
    return request.headers.get("X-Session-Token", "").strip() or None


def current_user():
    return get_user_from_token(get_bearer_token())


def auth_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        request.current_user = user
        return fn(*args, **kwargs)

    return wrapper


def save_hero_history(user, source_payload, hero_payload):
    execute(
        """
        INSERT INTO heroes (user_id, source_payload, hero_payload)
        VALUES (%s, %s::jsonb, %s::jsonb)
        """,
        (
            user["id"] if user else None,
            serialize_json(source_payload),
            serialize_json(hero_payload),
        ),
    )


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
        },
        "starter": {
            "dust_balance": settings.starter_dust_balance,
        },
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
        "reward_dust": 20,
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


def _ensure_daily_task_rows(user_id):
    task_date = _daily_date_iso()
    rows = []
    with get_connection() as conn:
        with conn.cursor() as cur:
            for key, config in DAILY_TASKS.items():
                cur.execute(
                    """
                    INSERT INTO daily_task_progress (
                        user_id, task_date, task_key, target, reward_dust
                    )
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, task_date, task_key) DO UPDATE
                    SET target = EXCLUDED.target,
                        reward_dust = EXCLUDED.reward_dust,
                        updated_at = now()
                    RETURNING id, user_id, task_date, task_key, progress, target,
                              reward_dust, claimed_at, created_at, updated_at
                    """,
                    (
                        user_id,
                        task_date,
                        key,
                        int(config["target"]),
                        int(config["reward_dust"]),
                    ),
                )
                rows.append(cur.fetchone())
        conn.commit()
    return rows


def _daily_task_payload(row):
    config = DAILY_TASKS.get(row["task_key"], {})
    progress = int(row["progress"])
    target = int(row["target"])
    claimed = row.get("claimed_at") is not None
    return {
        "id": str(row["id"]),
        "key": row["task_key"],
        "title": config.get("title", row["task_key"]),
        "description": config.get("description", ""),
        "task_date": str(row["task_date"]),
        "progress": progress,
        "target": target,
        "reward_dust": int(row["reward_dust"]),
        "claimed": claimed,
        "claimable": progress >= target and not claimed,
        "claimed_at": row["claimed_at"].isoformat() if row.get("claimed_at") else None,
    }


def daily_snapshot(user):
    task_date = _daily_date_iso()
    checkin = fetch_one(
        """
        SELECT id, user_id, claim_date, reward_dust, created_at
        FROM daily_checkins
        WHERE user_id = %s AND claim_date = %s
        """,
        (user["id"], task_date),
    )
    tasks = [_daily_task_payload(row) for row in _ensure_daily_task_rows(user["id"])]
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
        "economy": economy_snapshot(user),
    }


def _record_daily_task_progress(user_id, task_key, amount=1):
    if task_key not in DAILY_TASKS:
        return None
    task_date = _daily_date_iso()
    config = DAILY_TASKS[task_key]
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO daily_task_progress (
                    user_id, task_date, task_key, progress, target, reward_dust
                )
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (user_id, task_date, task_key) DO UPDATE
                SET progress = LEAST(daily_task_progress.target, daily_task_progress.progress + EXCLUDED.progress),
                    target = EXCLUDED.target,
                    reward_dust = EXCLUDED.reward_dust,
                    updated_at = now()
                RETURNING id, user_id, task_date, task_key, progress, target,
                          reward_dust, claimed_at, created_at, updated_at
                """,
                (
                    user_id,
                    task_date,
                    task_key,
                    max(1, int(amount)),
                    int(config["target"]),
                    int(config["reward_dust"]),
                ),
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

    formation = {}
    for slot in ARENA_SLOT_KEYS:
        raw_hero_id = value.get(slot)
        hero_id = str(raw_hero_id).strip() if raw_hero_id else None
        formation[slot] = hero_id or None

    hero_ids = [hero_id for hero_id in formation.values() if hero_id]
    if not (1 <= len(hero_ids) <= 4):
        raise ValueError("Place 1 to 4 active cards")
    if len(set(hero_ids)) != len(hero_ids):
        raise ValueError("A card can only occupy one Arena slot")

    return formation, hero_ids


def _normalize_pvp_battle_mode(value, hero_count: int | None = None):
    mode = (value or "").strip()
    if mode in {"1v1", "4v4", "arena_2x3"}:
        return mode
    if hero_count is not None and 1 < hero_count <= 4:
        return "4v4"
    return "1v1"


def _pvp_required_team_size(battle_mode: str) -> int:
    return 4 if battle_mode in {"4v4", "arena_2x3"} else 1


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
    stake_dust = settings.pvp_stake_dust

    stake_row = adjust_dust_balance(
        user["id"],
        -stake_dust,
        "pvp_stake",
        ref_type="pvp_queue",
            metadata={"queue_key": queue_key, "battle_mode": battle_mode, "hero_ids": hero_ids, "bp_value": total_bp, "formation": formation_snapshot},
    )

    queue_entry = None
    opponent_entry = None
    match_row = None

    tolerance_pct = max(0, int(settings.pvp_match_tolerance_pct))

    with get_connection() as conn:
        with conn.cursor() as cur:
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
                    serialize_json({"hero_ids": hero_ids, "team": team_snapshot, "total_bp": total_bp}),
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
                                "tolerance_pct": tolerance_pct,
                            }
                        ),
                        serialize_json(normalize_json_value(opponent_entry.get("formation_snapshot") or {})),
                        serialize_json(normalize_json_value(queue_entry.get("formation_snapshot") or {})),
                    ),
                )
                match_row = cur.fetchone()
        conn.commit()

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

    try:
        battle_result = run_team_duel(
            [item["hero_payload"] for item in team_a],
            [item["hero_payload"] for item in team_b],
            battle_mode,
            label_a,
            label_b,
        )
        resolved = _resolve_pvp_match(match_row, entry_a, entry_b, battle_result)
        updated_match_row = fetch_one(
            """
            SELECT id, queue_key, battle_mode, entry_a_id, entry_b_id, user_a_id, user_b_id,
                   stake_dust, bp_a, bp_b, bp_gap_pct, status, battle_payload, battle_result,
                   formation_a, formation_b, reward_payload, card_state_changes,
                   battle_id, winner_user_id, winner_side, created_at, resolved_at
            FROM pvp_matches
            WHERE id = %s
            """,
            (match_row["id"],),
        )
        battle_payload = {
            "queue_key": queue_key,
            "battle_mode": battle_mode,
            "entry_a": entry_a,
            "entry_b": entry_b,
            "match_id": str(match_row["id"]),
            "stake_dust": int(stake_dust),
        }
        result = {
            "status": "matched",
            "entry": normalize_json_value(queue_entry),
            "opponent": normalize_json_value(opponent_entry),
            "match": normalize_json_value(updated_match_row or match_row),
            "battle": normalize_json_value(resolved["battle"]),
            "battle_record_a": normalize_json_value(resolved["battleRowA"]) if resolved["battleRowA"] else None,
            "battle_record_b": normalize_json_value(resolved["battleRowB"]) if resolved["battleRowB"] else None,
            "battle_payload": battle_payload,
            "reward": normalize_json_value(resolved["reward_payload"]),
            "card_state_changes": normalize_json_value(resolved["card_state_changes"]),
            "economy": economy_snapshot(user),
            "winner_side": resolved["winner_side"],
        }
        if isinstance(result["battle"], dict):
            battle_payload_result = result["battle"]
            details = battle_payload_result.get("details")
            if isinstance(details, dict):
                battle_payload_result.setdefault("winner", details.get("winner"))
                battle_payload_result.setdefault("winnerLabel", details.get("winnerLabel"))
        return result
    except Exception as exc:
        logging.exception("PvP match resolution failed")
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
            conn.commit()

        adjust_dust_balance(
            user["id"],
            DAILY_SIGN_IN_REWARD_DUST,
            "daily_sign_in",
            ref_type="daily_checkin",
            ref_id=str(row["id"]),
            metadata={"claim_date": task_date},
        )
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
        task_date = _daily_date_iso()
        _ensure_daily_task_rows(user["id"])
        with get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, progress, target, reward_dust, claimed_at
                    FROM daily_task_progress
                    WHERE user_id = %s AND task_date = %s AND task_key = %s
                    FOR UPDATE
                    """,
                    (user["id"], task_date, task_key),
                )
                row = cur.fetchone()
                if not row:
                    return jsonify({"error": "Daily task not found"}), 404
                if row["claimed_at"] is not None:
                    return jsonify({"error": "Daily task already claimed"}), 400
                if int(row["progress"]) < int(row["target"]):
                    return jsonify({"error": "Daily task not complete"}), 400

                cur.execute(
                    """
                    UPDATE daily_task_progress
                    SET claimed_at = now(),
                        updated_at = now()
                    WHERE id = %s
                    RETURNING id, reward_dust
                    """,
                    (row["id"],),
                )
                claimed = cur.fetchone()
            conn.commit()

        adjust_dust_balance(
            user["id"],
            int(claimed["reward_dust"]),
            "daily_task_reward",
            ref_type="daily_task_progress",
            ref_id=str(claimed["id"]),
            metadata={"task_key": task_key, "task_date": task_date},
        )
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
    return jsonify({"ok": True})


@app.route("/api/forge", methods=["POST"])
@auth_required
def forge():
    charged = False
    user = current_user()
    try:
        data = request.json or {}
        image_base64 = data.get("image")
        materials = data.get("materials", {})

        if not image_base64:
            return jsonify({"error": "No image provided"}), 400

        if model_vision is None or model_text is None:
            return jsonify({"error": "GEMINI_API_KEY is not configured"}), 500

        try:
            adjust_dust_balance(
                user["id"],
                -settings.dust_cost_forge,
                "forge_entry",
                ref_type="hero_generation",
                metadata={"materials": materials},
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
        directive = build_material_directive(materials)
        p2_input = {
            "source": p1_data,
            "materials": materials,
            "directive": directive,
        }

        p2_response = model_text.generate_content(f"{P2_PROMPT_V2}\n\nInput Data:\n{json.dumps(p2_input)}")
        p2_data = extract_json(p2_response.text)
        if not p2_data:
            raise ValueError("Failed to generate stats")

        # Step 3: Scale
        final_hero = adjust_based_on_bp(p2_data)
        generation_row = save_hero_generation_history(
            user,
            p2_input,
            {"p1": p1_data, "p2": p2_data},
            final_hero,
            template=p2_data.get("template"),
            bp_requested=int(p2_data.get("BP") or p1_data.get("BP") or final_hero.get("BP") or 0),
            bp_final=int(final_hero.get("BP") or 0),
            model_name=GEM_MODEL_NAME,
            prompt_version="p2_v2",
            status="completed",
        )
        save_hero_history(user, p2_input, final_hero)
        _safe_record_daily_task_progress(user["id"], "forge_one_card")

        response = dict(final_hero)
        response["generation_id"] = str(generation_row["id"]) if generation_row else None
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
            
        result = run_team_duel(team_a, team_b, size, label_a, label_b, control_mode=control_mode)
        try:
            save_battle_history(current_user(), size, data, result)
        except Exception:
            logging.exception("Failed to persist team battle history")
        return jsonify(result)
        
    except Exception as e:
        logging.exception(e)
        return jsonify({"error": str(e)}), 500


@app.route("/api/pve/start", methods=["POST"])
@auth_required
def pve_start():
    charged = False
    user = current_user()
    try:
        data = request.json or {}
        theme_key = (data.get("themeKey") or data.get("theme_key") or "tower").strip()
        hero_ids = data.get("heroIds") or data.get("hero_ids") or []

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
               battle_id, winner_user_id, winner_side, created_at, resolved_at
        FROM pvp_matches
        WHERE entry_a_id = %s OR entry_b_id = %s
        ORDER BY created_at DESC
        LIMIT 1
        """,
        (entry["id"], entry["id"]),
    )
    if match:
        match = normalize_json_value(match)
    return jsonify({"ok": True, "entry": entry, "match": match})


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


@app.route("/api/me/heroes", methods=["GET"])
@auth_required
def list_my_heroes():
    user = current_user()
    rows = fetch_all(
        """
        SELECT id, hero_payload, pvp_life_state, pve_life_state, card_status,
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
        SELECT id, battle_type, result, created_at
        FROM battles
        WHERE user_id = %s
        ORDER BY created_at DESC
        LIMIT 50
        """,
        (user["id"],),
    )
    return jsonify({"data": normalize_rows(rows)})

if __name__ == "__main__":
    port = settings.port
    print(f"Server starting on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=True)
