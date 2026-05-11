from __future__ import annotations

import base64
import copy
import io
import uuid
from typing import Any, Dict

import pytest
from PIL import Image

import battle_logic


def _sample_image_base64(color: tuple[int, int, int] = (180, 120, 60)) -> str:
    image = Image.new("RGB", (4, 4), color=color)
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _hero_pair(name: str, template: str, bp: int, attack_type: str, s1_name: str, s2_name: str) -> Dict[str, Any]:
    weights = {
        "HP": 8,
        "MP": 5,
        "ATK": 8,
        "DEF": 6,
        "CC": 7,
        "SPEED": 6,
        "CA": 6,
        "PI": 5,
        "EV": 5,
        "AC": 7,
        "TYPE": attack_type,
    }
    skill = {
        "s1": {
            "ROLE": "attack",
            "IS_PASSIVE": False,
            "name": s1_name,
            "description": f"{name} strikes hard.",
            "TYPE": attack_type,
            "TARGET": "Enemy",
            "TARGET_NUM": "1",
            "RANGE": "melee",
            "IS_STUN": False,
            "BUFF_TIME": 2,
            "BUFF_NAME": "wound",
            "DMG": 1,
            "BUFF_HP": 0,
            "BUFF_MP": 0,
            "BUFF_DMG": 0,
            "BUFF_CC": 0,
            "BUFF_DEF": 0,
            "BUFF_EV": 0,
            "BUFF_AC": 0,
        },
        "s2": {
            "ROLE": "buff",
            "IS_PASSIVE": False,
            "name": s2_name,
            "description": f"{name} prepares for the next clash.",
            "TYPE": attack_type,
            "TARGET": "Self",
            "TARGET_NUM": "1",
            "RANGE": "self",
            "IS_STUN": False,
            "BUFF_TIME": 2,
            "BUFF_NAME": "bless",
            "DMG": 0,
            "BUFF_HP": 0,
            "BUFF_MP": 0,
            "BUFF_DMG": 1,
            "BUFF_CC": 0,
            "BUFF_DEF": 0,
            "BUFF_EV": 0,
            "BUFF_AC": 0,
        },
    }
    return {
        "p1": {
            "name": name,
            "description": f"{name} is a forged unit for integration tests.",
            "extra": f"{template} archetype",
            "BP": str(bp),
        },
        "p2": {
            "name": name,
            "description": f"{name} is a forged unit for integration tests.",
            "BP": str(bp),
            "template": template,
            "state_weights": weights,
            "skill": skill,
        },
    }


def _board_hero(
    name: str,
    *,
    range_mode: str = "melee",
    target_num: int = 1,
    hp: int = 1000,
    mp: int = 120,
    atk: int = 60,
    defense: int = 20,
    speed: int = 30,
    accuracy: int = 90,
    evasion: int = 10,
) -> Dict[str, Any]:
    return {
        "name": name,
        "description": f"{name} board test hero.",
        "template": "warrior",
        "BP": "1000",
        "state": {
            "HP": hp,
            "MP": mp,
            "ATK": atk,
            "DEF": defense,
            "CC": 0,
            "SPEED": speed,
            "CA": 0,
            "PI": 0,
            "EV": evasion,
            "AC": accuracy,
            "TYPE": "weapon",
        },
        "skill": {
            "s1": {
                "ROLE": "attack",
                "IS_PASSIVE": False,
                "name": f"{name} Strike",
                "description": f"{name} strikes from the board.",
                "TYPE": "weapon",
                "TARGET": "Enemy",
                "TARGET_NUM": str(target_num),
                "RANGE": range_mode,
                "IS_STUN": False,
                "BUFF_TIME": 0,
                "BUFF_NAME": "wound",
                "DMG": 1,
                "BUFF_HP": 0,
                "BUFF_MP": 0,
                "BUFF_DMG": 0,
                "BUFF_CC": 0,
                "BUFF_DEF": 0,
                "BUFF_EV": 0,
                "BUFF_AC": 0,
            },
            "s2": {
                "ROLE": "buff",
                "IS_PASSIVE": False,
                "name": f"{name} Guard",
                "description": f"{name} braces for impact.",
                "TYPE": "weapon",
                "TARGET": "Self",
                "TARGET_NUM": "1",
                "RANGE": "self",
                "IS_STUN": False,
                "BUFF_TIME": 1,
                "BUFF_NAME": "bless",
                "DMG": 0,
                "BUFF_HP": 0,
                "BUFF_MP": 0,
                "BUFF_DMG": 1,
                "BUFF_CC": 0,
                "BUFF_DEF": 0,
                "BUFF_EV": 0,
                "BUFF_AC": 0,
            },
        },
    }


@pytest.mark.integration
def test_auth_login_and_initial_economy(harness):
    email = "integration-auth@example.com"
    headers = harness.login(email)

    auth_state = harness.auth_me(headers)
    assert auth_state["authenticated"] is True
    assert auth_state["user"]["email"] == email

    economy = harness.economy(headers)
    assert economy["wallet"]["dust_balance"] == 500
    assert economy["costs"]["forge"] == 100
    assert economy["costs"]["repair"] == 60
    assert economy["costs"]["pve_entry"] == 40
    assert economy["costs"]["pvp_entry"] == 30
    assert economy["costs"]["pvp_stake"] == 30
    assert economy["costs"]["pvp_revive"] == 200
    assert economy["pvp"]["match_tolerance_pct"] == 5
    assert economy["pvp"]["low_tier_relic_drop_pct"] == 3
    assert economy["transactions"] == []

    unauthorized = harness.client.get("/api/me/economy")
    harness.trace("economy-unauthorized", unauthorized)
    assert unauthorized.status_code == 401


@pytest.mark.integration
def test_initial_economy_includes_relic_catalog(harness):
    headers = harness.login("integration-relic-catalog@example.com")
    economy = harness.economy(headers)

    assert isinstance(economy["relic_catalog"], list)
    assert any(row["relic_type"] == "low_ember_shard" for row in economy["relic_catalog"])
    assert any(row["relic_type"] == "named_echo_heart" for row in economy["relic_catalog"])

    ember = next(row for row in economy["relic_catalog"] if row["relic_type"] == "low_ember_shard")
    assert ember["display_name"] == "Ember Shard"
    assert ember["tier"] == "common"
    assert "soulslike item icon" in ember["icon_prompt"]


@pytest.mark.integration
def test_arena_lifecycle_schema_exists(harness):
    with harness.db_module.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'heroes'
                  AND column_name IN (
                    'pvp_life_state',
                    'pve_life_state',
                    'card_status',
                    'locked_reason',
                    'pvp_dead_at',
                    'decomposed_at',
                    'active_pvp_entry_id'
                  )
                """
            )
            hero_columns = {row["column_name"] for row in cur.fetchall()}

            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'pvp_queue_entries'
                  AND column_name = 'formation_snapshot'
                """
            )
            queue_columns = {row["column_name"] for row in cur.fetchall()}

            cur.execute(
                """
                SELECT column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = 'pvp_matches'
                  AND column_name IN (
                    'formation_a',
                    'formation_b',
                    'reward_payload',
                    'card_state_changes'
                  )
                """
            )
            match_columns = {row["column_name"] for row in cur.fetchall()}

            cur.execute("SELECT to_regclass('card_death_records') AS table_name")
            death_table = cur.fetchone()["table_name"]

            cur.execute("SELECT to_regclass('daily_checkins') AS table_name")
            checkin_table = cur.fetchone()["table_name"]

            cur.execute("SELECT to_regclass('daily_task_progress') AS table_name")
            task_table = cur.fetchone()["table_name"]

    assert hero_columns == {
        "pvp_life_state",
        "pve_life_state",
        "card_status",
        "locked_reason",
        "pvp_dead_at",
        "decomposed_at",
        "active_pvp_entry_id",
    }
    assert queue_columns == {"formation_snapshot"}
    assert match_columns == {"formation_a", "formation_b", "reward_payload", "card_state_changes"}
    assert death_table is not None
    assert checkin_table is not None
    assert task_table is not None


@pytest.mark.integration
def test_daily_sign_in_can_only_claim_once(harness):
    headers = harness.login("integration-daily-signin@example.com")

    first = harness.client.post("/api/daily/sign-in/claim", headers=headers)
    harness.trace("daily-sign-in-first", first)
    assert first.status_code == 200
    first_payload = first.get_json()["data"]
    assert first_payload["checkin"]["claimed"] is True
    assert first_payload["checkin"]["reward_dust"] == 30
    assert first_payload["economy"]["wallet"]["dust_balance"] == 530

    second = harness.client.post("/api/daily/sign-in/claim", headers=headers)
    harness.trace("daily-sign-in-second", second)
    assert second.status_code == 400
    assert "already claimed" in second.get_json()["error"]


@pytest.mark.integration
def test_daily_task_claim_requires_completion(harness):
    headers = harness.login("integration-daily-locked-task@example.com")

    response = harness.client.post("/api/daily/tasks/win_arena_once/claim", headers=headers)
    harness.trace("daily-claim-incomplete", response)

    assert response.status_code == 400
    assert "not complete" in response.get_json()["error"]


@pytest.mark.integration
def test_daily_forge_task_progress_and_claim(harness):
    headers = harness.login("integration-daily-forge-task@example.com")

    initial = harness.client.get("/api/daily/me", headers=headers)
    harness.trace("daily-initial", initial)
    assert initial.status_code == 200
    initial_tasks = {task["key"]: task for task in initial.get_json()["data"]["tasks"]}
    assert initial_tasks["forge_one_card"]["progress"] == 0
    assert initial_tasks["forge_one_card"]["target"] == 1

    harness.set_forge_sequence([
        _hero_pair("Daily Smith", "warrior", 1000, "weapon", "Hammer Cut", "Temper"),
    ])
    harness.forge(headers, _sample_image_base64((150, 120, 70)), materials={})

    progressed = harness.client.get("/api/daily/me", headers=headers)
    harness.trace("daily-progressed", progressed)
    progressed_tasks = {task["key"]: task for task in progressed.get_json()["data"]["tasks"]}
    assert progressed_tasks["forge_one_card"]["progress"] == 1
    assert progressed_tasks["forge_one_card"]["claimable"] is True

    claimed = harness.client.post("/api/daily/tasks/forge_one_card/claim", headers=headers)
    harness.trace("daily-claim-forge", claimed)
    assert claimed.status_code == 200
    claimed_payload = claimed.get_json()["data"]
    claimed_tasks = {task["key"]: task for task in claimed_payload["tasks"]}
    assert claimed_tasks["forge_one_card"]["claimed"] is True
    assert claimed_payload["economy"]["wallet"]["dust_balance"] == 420


@pytest.mark.integration
def test_ladder_me_returns_empty_profile(harness):
    headers = harness.login("integration-ladder-empty@example.com")

    response = harness.client.get("/api/ladder/me", headers=headers)
    harness.trace("ladder-empty", response)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["rating"] == 1000
    assert payload["tier"] == "Bronze"
    assert payload["record"] == {"played": 0, "wins": 0, "losses": 0, "ties": 0}
    assert payload["win_rate"] == 0
    assert payload["recent_matches"] == []


@pytest.mark.integration
def test_ladder_me_summarizes_arena_results(harness):
    headers_a = harness.login("integration-ladder-a@example.com")
    user_a_id = harness.last_user["id"]
    headers_b = harness.login("integration-ladder-b@example.com")
    user_b_id = harness.last_user["id"]

    def insert_match(winner_user_id, winner_side):
        with harness.db_module.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO pvp_queue_entries (
                        user_id, queue_key, battle_mode, stake_dust, bp_value, status,
                        team_snapshot, formation_snapshot, matched_at
                    )
                    VALUES (%s, 'ranked', 'arena_2x3', 30, 1000, 'matched', '{}'::jsonb, '{}'::jsonb, now())
                    RETURNING id
                    """,
                    (user_a_id,),
                )
                entry_a = cur.fetchone()
                cur.execute(
                    """
                    INSERT INTO pvp_queue_entries (
                        user_id, queue_key, battle_mode, stake_dust, bp_value, status,
                        team_snapshot, formation_snapshot, matched_at
                    )
                    VALUES (%s, 'ranked', 'arena_2x3', 30, 1000, 'matched', '{}'::jsonb, '{}'::jsonb, now())
                    RETURNING id
                    """,
                    (user_b_id,),
                )
                entry_b = cur.fetchone()
                cur.execute(
                    """
                    INSERT INTO pvp_matches (
                        queue_key, battle_mode, entry_a_id, entry_b_id, user_a_id, user_b_id,
                        stake_dust, bp_a, bp_b, bp_gap_pct, status, winner_user_id, winner_side, resolved_at
                    )
                    VALUES (
                        'ranked', 'arena_2x3', %s, %s, %s, %s,
                        30, 1000, 1000, 0, 'resolved', %s, %s, now()
                    )
                    """,
                    (entry_a["id"], entry_b["id"], user_a_id, user_b_id, winner_user_id, winner_side),
                )
            conn.commit()

    insert_match(user_a_id, "A")
    insert_match(user_b_id, "B")
    insert_match(None, "Tie")

    response = harness.client.get("/api/ladder/me", headers=headers_a)
    harness.trace("ladder-summary", response)

    assert response.status_code == 200
    payload = response.get_json()["data"]
    assert payload["rating"] == 1015
    assert payload["tier"] == "Bronze"
    assert payload["record"] == {"played": 3, "wins": 1, "losses": 1, "ties": 1}
    assert payload["win_rate"] == 33
    assert len(payload["recent_matches"]) == 3
    assert payload["recent_matches"][0]["result"] in {"win", "loss", "tie"}


@pytest.mark.integration
def test_list_heroes_includes_lifecycle_fields(harness):
    headers = harness.login("integration-lifecycle@example.com")
    hero_payload = _hero_pair("Lifecycle", "warrior", 1000, "weapon", "Slash", "Guard")["p2"]
    harness.db_module.execute(
        """
        INSERT INTO heroes (user_id, source_payload, hero_payload)
        VALUES (%s, %s::jsonb, %s::jsonb)
        """,
        (
            harness.last_user["id"],
            harness.db_module.serialize_json({"source": "integration"}),
            harness.db_module.serialize_json(hero_payload),
        ),
    )

    heroes = harness.heroes(headers)
    hero = heroes[0]

    assert hero["pvp_life_state"] == "active"
    assert hero["pve_life_state"] == "active"
    assert hero["card_status"] == "active"
    assert "locked_reason" in hero
    assert "pvp_dead_at" in hero
    assert "decomposed_at" in hero
    assert "active_pvp_entry_id" in hero


@pytest.mark.integration
def test_arena_join_rejects_empty_formation(harness):
    headers = harness.login("integration-empty-arena@example.com")
    response = harness.client.post(
        "/api/pvp/join",
        headers=headers,
        json={"mode": "arena_2x3", "queueKey": "ranked", "formation": {}},
    )
    harness.trace("arena-empty-formation", response)

    assert response.status_code == 400
    assert "Place 1 to 4 active cards" in response.get_json()["error"]


@pytest.mark.integration
def test_arena_join_rejects_more_than_four_cards(harness):
    headers = harness.login("integration-five-arena@example.com")
    hero_ids = []
    for index in range(5):
        hero_payload = _hero_pair(f"Arena {index}", "warrior", 1000, "weapon", "Slash", "Guard")["p2"]
        row = harness.db_module.fetch_one(
            """
            INSERT INTO heroes (user_id, source_payload, hero_payload)
            VALUES (%s, %s::jsonb, %s::jsonb)
            RETURNING id
            """,
            (
                harness.last_user["id"],
                harness.db_module.serialize_json({"source": "integration"}),
                harness.db_module.serialize_json(hero_payload),
            ),
        )
        hero_ids.append(str(row["id"]))

    response = harness.client.post(
        "/api/pvp/join",
        headers=headers,
        json={
            "mode": "arena_2x3",
            "queueKey": "ranked",
            "formation": {
                "front_0": hero_ids[0],
                "front_1": hero_ids[1],
                "front_2": hero_ids[2],
                "back_0": hero_ids[3],
                "back_1": hero_ids[4],
                "back_2": None,
            },
        },
    )
    harness.trace("arena-five-formation", response)

    assert response.status_code == 400
    assert "Place 1 to 4 active cards" in response.get_json()["error"]


@pytest.mark.integration
def test_pvp_dead_card_cannot_queue_until_revived(harness):
    headers = harness.login("integration-dead-card@example.com")
    hero_payload = _hero_pair("Fallen", "warrior", 1000, "weapon", "Last Cut", "Still Guard")["p2"]
    hero_id = str(uuid.uuid4())
    harness.db_module.execute(
        """
        INSERT INTO heroes (id, user_id, source_payload, hero_payload, pvp_life_state, pvp_dead_at)
        VALUES (%s, %s, %s::jsonb, %s::jsonb, 'pvp_dead', now())
        """,
        (
            hero_id,
            harness.last_user["id"],
            harness.db_module.serialize_json({"source": "integration"}),
            harness.db_module.serialize_json(hero_payload),
        ),
    )

    response = harness.client.post(
        "/api/pvp/join",
        headers=headers,
        json={
            "mode": "arena_2x3",
            "queueKey": "ranked",
            "formation": {"front_1": hero_id},
        },
    )
    harness.trace("arena-dead-card", response)

    assert response.status_code == 400
    assert "Revive it before Arena" in response.get_json()["error"]


@pytest.mark.integration
def test_revive_card_costs_200_dust_and_restores_arena_eligibility(harness):
    headers = harness.login("integration-revive-card@example.com")
    hero_payload = _hero_pair("Returned", "paladin", 1000, "weapon", "Dawn Cut", "Oath Light")["p2"]
    hero_id = str(uuid.uuid4())
    harness.db_module.execute(
        """
        INSERT INTO heroes (id, user_id, source_payload, hero_payload, pvp_life_state, pvp_dead_at)
        VALUES (%s, %s, %s::jsonb, %s::jsonb, 'pvp_dead', now())
        """,
        (
            hero_id,
            harness.last_user["id"],
            harness.db_module.serialize_json({"source": "integration"}),
            harness.db_module.serialize_json(hero_payload),
        ),
    )

    response = harness.client.post(f"/api/cards/{hero_id}/revive", headers=headers)
    harness.trace("revive-card", response)
    assert response.status_code == 200
    payload = response.get_json()
    assert payload["card"]["pvp_life_state"] == "active"
    assert payload["card"]["pvp_dead_at"] is None
    assert payload["economy"]["wallet"]["dust_balance"] == 300

    join_response = harness.client.post(
        "/api/pvp/join",
        headers=headers,
        json={
            "mode": "arena_2x3",
            "queueKey": "ranked-revived",
            "formation": {"front_1": hero_id},
        },
    )
    harness.trace("arena-revived-card", join_response)
    assert join_response.status_code == 200
    assert join_response.get_json()["status"] == "waiting"


@pytest.mark.integration
def test_arena_waiting_entry_locks_card_and_cancel_clears_lock(harness):
    headers = harness.login("integration-arena-lock@example.com")
    harness.set_forge_sequence([
        _hero_pair("Lockstep", "warrior", 1000, "weapon", "Step Cut", "Brace"),
    ])
    harness.forge(headers, _sample_image_base64((110, 90, 130)), materials={})
    hero_id = harness.heroes(headers)[0]["id"]

    join = harness.pvp_join(headers, [hero_id], queue_key="ranked-lock", battle_mode="1v1")
    assert join["status"] == "waiting"

    locked_row = harness.db_module.fetch_one(
        "SELECT active_pvp_entry_id FROM heroes WHERE id = %s",
        (hero_id,),
    )
    assert str(locked_row["active_pvp_entry_id"]) == join["entry"]["id"]

    duplicate = harness.client.post(
        "/api/pvp/join",
        headers=headers,
        json={"queueKey": "ranked-lock", "heroIds": [hero_id], "battleMode": "1v1"},
    )
    harness.trace("arena-duplicate-lock", duplicate)
    assert duplicate.status_code == 400
    assert "already queued" in duplicate.get_json()["error"]

    cancel = harness.pvp_cancel(headers, join["entry"]["id"])
    assert cancel["ok"] is True
    assert cancel["entry"]["status"] == "cancelled"
    assert cancel["economy"]["wallet"]["dust_balance"] == 400

    unlocked_row = harness.db_module.fetch_one(
        "SELECT active_pvp_entry_id FROM heroes WHERE id = %s",
        (hero_id,),
    )
    assert unlocked_row["active_pvp_entry_id"] is None


@pytest.mark.integration
def test_forge_and_battle_persistence(harness):
    email = "integration-battle@example.com"
    headers = harness.login(email)

    sequence = [
        _hero_pair("Northwind", "warrior", 1200, "weapon", "Cleave", "Battle Cry"),
        _hero_pair("Starfall", "mage", 1100, "magic", "Arc Bolt", "Arcane Ward"),
    ]
    harness.set_forge_sequence(sequence)

    image_a = _sample_image_base64((180, 120, 60))
    image_b = _sample_image_base64((60, 120, 180))

    hero_a = harness.forge(headers, image_a, materials={"glowGem": 1})
    hero_b = harness.forge(headers, image_b, materials={"emberCore": 2})

    assert hero_a["name"] == "Northwind"
    assert hero_b["name"] == "Starfall"
    assert int(hero_a["state"]["HP"]) > 0
    assert int(hero_b["state"]["HP"]) > 0
    assert hero_a["generation_id"]
    assert hero_b["generation_id"]

    economy = harness.economy(headers)
    assert economy["wallet"]["dust_balance"] == 300
    assert len(economy["transactions"]) == 2

    hero_rows = harness.heroes(headers)
    assert len(hero_rows) >= 2
    hero_ids = {row["hero_payload"]["name"]: row["id"] for row in hero_rows}
    assert set(hero_ids) >= {"Northwind", "Starfall"}

    battle_a = copy.deepcopy(hero_a)
    battle_b = copy.deepcopy(hero_b)
    battle_a["id"] = hero_ids["Northwind"]
    battle_b["id"] = hero_ids["Starfall"]
    battle_result = harness.battle(headers, battle_a, battle_b)

    assert battle_result["winner"] in {"Northwind", "Starfall", "Tie"}
    assert len(battle_result["logs"]) > 0

    battles = harness.battles(headers)
    assert len(battles) >= 1

    battle_count_row = harness.db_module.fetch_one(
        "SELECT count(*) AS count FROM battles WHERE user_id = %s",
        (harness.last_user["id"],),
    )
    participants_row = harness.db_module.fetch_one(
        "SELECT count(*) AS count FROM battle_participants WHERE battle_id = (SELECT id FROM battles WHERE user_id = %s ORDER BY created_at DESC LIMIT 1)",
        (harness.last_user["id"],),
    )
    assert int(battle_count_row["count"]) >= 1
    assert int(participants_row["count"]) == 2


@pytest.mark.integration
def test_repair_pvp_and_pve_entry_costs(harness):
    email = "integration-economy@example.com"
    headers = harness.login(email)

    sequence = [
        _hero_pair("Gatewarden", "knight", 1000, "weapon", "Shield Bash", "Fortify"),
    ]
    harness.set_forge_sequence(sequence)
    hero = harness.forge(headers, _sample_image_base64((90, 140, 90)), materials={})

    hero_rows = harness.heroes(headers)
    hero_id = hero_rows[0]["id"]

    repair_result = harness.repair(headers, hero_id)
    assert repair_result["ok"] is True
    assert repair_result["economy"]["wallet"]["dust_balance"] == 340

    pvp_result = harness.pvp_entry(headers, queue_key="ranked")
    assert pvp_result["ok"] is True
    assert pvp_result["queue_key"] == "ranked"
    assert pvp_result["economy"]["wallet"]["dust_balance"] == 310

    pve_result = harness.pve_start(headers, [hero_id], theme_key="tower")
    assert pve_result["ok"] is True
    assert pve_result["run"]["theme_key"] == "tower"
    assert pve_result["economy"]["wallet"]["dust_balance"] == 270
    assert len(pve_result["party"]) == 1

    economy = harness.economy(headers)
    assert economy["wallet"]["dust_balance"] == 270
    assert len(economy["transactions"]) >= 4

    resource_row = harness.db_module.fetch_one(
        "SELECT count(*) AS count FROM resource_transactions WHERE user_id = %s",
        (harness.last_user["id"],),
    )
    pve_row = harness.db_module.fetch_one(
        "SELECT count(*) AS count FROM pve_runs WHERE user_id = %s",
        (harness.last_user["id"],),
    )
    audit_row = harness.db_module.fetch_one(
        "SELECT count(*) AS count FROM audit_logs WHERE user_id = %s",
        (harness.last_user["id"],),
    )
    assert int(resource_row["count"]) >= 4
    assert int(pve_row["count"]) >= 1
    assert int(audit_row["count"]) >= 2


@pytest.mark.integration
def test_pvp_matchmaking_within_bp_window_and_stake_settlement(harness):
    email_a = "integration-pvp-a@example.com"
    email_b = "integration-pvp-b@example.com"

    headers_a = harness.login(email_a)
    harness.set_forge_sequence([
        _hero_pair("Aegis", "knight", 1000, "weapon", "Shield Line", "Iron Oath"),
    ])
    hero_a = harness.forge(headers_a, _sample_image_base64((140, 100, 60)), materials={})
    hero_a_id = harness.heroes(headers_a)[0]["id"]

    headers_b = harness.login(email_b)
    harness.set_forge_sequence([
        _hero_pair("Blitz", "rogue", 1050, "gun", "Quick Shot", "Smoke Step"),
    ])
    hero_b = harness.forge(headers_b, _sample_image_base64((80, 120, 170)), materials={})
    hero_b_id = harness.heroes(headers_b)[0]["id"]

    join_a = harness.pvp_join(headers_a, [hero_a_id], queue_key="ranked", battle_mode="1v1")
    assert join_a["status"] == "waiting"
    assert join_a["entry"]["bp_value"] == 1000

    join_b = harness.pvp_join(headers_b, [hero_b_id], queue_key="ranked", battle_mode="1v1")
    assert join_b["status"] == "matched"
    assert join_b["match"]["status"] == "resolved"
    assert join_b["battle"]["winner"] in {"Aegis", "Blitz", "Tie"}
    assert join_b["battle"]["winnerLabel"] in {"Player A", "Player B", "Tie"}

    status_a = harness.pvp_entry_status(headers_a, join_a["entry"]["id"])
    assert status_a["entry"]["status"] == "matched"
    assert status_a["match"]["status"] == "resolved"

    lock_a = harness.db_module.fetch_one("SELECT active_pvp_entry_id FROM heroes WHERE id = %s", (hero_a_id,))
    lock_b = harness.db_module.fetch_one("SELECT active_pvp_entry_id FROM heroes WHERE id = %s", (hero_b_id,))
    assert lock_a["active_pvp_entry_id"] is None
    assert lock_b["active_pvp_entry_id"] is None

    economy_a = harness.economy(headers_a)
    economy_b = harness.economy(headers_b)
    total_dust = economy_a["wallet"]["dust_balance"] + economy_b["wallet"]["dust_balance"]
    assert total_dust == 800


@pytest.mark.integration
def test_pvp_win_can_grant_low_tier_relic(harness, monkeypatch):
    import battle_logic

    headers_a = harness.login("integration-relic-a@example.com")
    hero_a = _board_hero(
        "RelicWinner",
        hp=1500,
        mp=120,
        atk=220,
        defense=80,
        speed=110,
        accuracy=100,
        evasion=0,
    )
    with harness.db_module.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO heroes (user_id, source_payload, hero_payload)
                VALUES (%s, %s::jsonb, %s::jsonb)
                RETURNING id
                """,
                (
                    harness.last_user["id"],
                    harness.db_module.serialize_json({"source": "integration"}),
                    harness.db_module.serialize_json(hero_a),
                ),
            )
            hero_a_id = str(cur.fetchone()["id"])
        conn.commit()

    headers_b = harness.login("integration-relic-b@example.com")
    hero_b = _board_hero(
        "RelicRunnerUp",
        hp=500,
        mp=80,
        atk=20,
        defense=5,
        speed=10,
        accuracy=100,
        evasion=0,
    )
    with harness.db_module.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO heroes (user_id, source_payload, hero_payload)
                VALUES (%s, %s::jsonb, %s::jsonb)
                RETURNING id
                """,
                (
                    harness.last_user["id"],
                    harness.db_module.serialize_json({"source": "integration"}),
                    harness.db_module.serialize_json(hero_b),
                ),
            )
            hero_b_id = str(cur.fetchone()["id"])
        conn.commit()

    monkeypatch.setattr(harness.app_module.secrets, "randbelow", lambda n: 0)
    monkeypatch.setattr(battle_logic.random, "shuffle", lambda seq: None)
    monkeypatch.setattr(battle_logic.random, "random", lambda: 1.0)

    join_a = harness.pvp_join(headers_a, [hero_a_id], queue_key="ranked-relic", battle_mode="1v1")
    assert join_a["status"] == "waiting"

    join_b = harness.pvp_join(headers_b, [hero_b_id], queue_key="ranked-relic", battle_mode="1v1")
    assert join_b["status"] == "matched"
    assert join_b["winner_side"] == "A"
    assert join_b["reward"]["relic_drop"] is not None
    assert join_b["reward"]["relic_drop"]["relic_type"] in {
        "low_ember_shard",
        "low_frost_shard",
        "low_radiant_shard",
        "low_void_shard",
        "low_storm_shard",
        "low_beast_fang",
    }
    assert join_b["reward"]["relic_drop"]["display_name"]
    assert join_b["reward"]["relic_drop"]["amount"] == 1

    economy_a = harness.economy(headers_a)
    assert any(relic["relic_type"] == join_b["reward"]["relic_drop"]["relic_type"] and relic["amount"] == 1 for relic in economy_a["relics"])
    assert any(txn["reason"] == "pvp_relic_drop" for txn in economy_a["transactions"])


@pytest.mark.integration
def test_pvp_matchmaking_supports_partial_4v4_rosters(harness):
    email_a = "integration-pvp-partial-a@example.com"
    email_b = "integration-pvp-partial-b@example.com"

    headers_a = harness.login(email_a)
    harness.set_forge_sequence([
        _hero_pair("Anchor", "knight", 1000, "weapon", "Anchor Slash", "Anchor Guard"),
        _hero_pair("Spark", "mage", 1000, "magic", "Spark Bolt", "Spark Ward"),
    ])
    harness.forge(headers_a, _sample_image_base64((150, 100, 60)), materials={})
    harness.forge(headers_a, _sample_image_base64((160, 110, 70)), materials={})
    alpha_ids = [row["id"] for row in harness.heroes(headers_a)[:2]]

    headers_b = harness.login(email_b)
    harness.set_forge_sequence([
        _hero_pair("Bastion", "tank", 1000, "weapon", "Bastion Strike", "Bastion Wall"),
        _hero_pair("Nova", "mage", 1000, "magic", "Nova Burst", "Nova Aegis"),
    ])
    harness.forge(headers_b, _sample_image_base64((70, 110, 160)), materials={})
    harness.forge(headers_b, _sample_image_base64((80, 120, 170)), materials={})
    beta_ids = [row["id"] for row in harness.heroes(headers_b)[:2]]

    join_a = harness.pvp_join(headers_a, alpha_ids, queue_key="ranked-partial", battle_mode="4v4")
    assert join_a["status"] == "waiting"
    assert join_a["entry"]["battle_mode"] == "4v4"
    assert len(join_a["entry"]["team_snapshot"]["team"]) == 2

    join_b = harness.pvp_join(headers_b, beta_ids, queue_key="ranked-partial", battle_mode="4v4")
    assert join_b["status"] == "matched"
    assert join_b["battle"]["winner"] in {"Player A", "Player B", "Tie"}
    assert join_b["battle"]["board"]["topLabel"] == "Player B"
    assert join_b["battle"]["board"]["bottomLabel"] == "Player A"
    assert len(join_b["battle"]["board"]["top"]) == 4
    assert len(join_b["battle"]["board"]["bottom"]) == 4


@pytest.mark.integration
def test_pvp_matchmaking_rejects_large_bp_gap(harness):
    email_a = "integration-pvp-gap-a@example.com"
    email_b = "integration-pvp-gap-b@example.com"

    headers_a = harness.login(email_a)
    harness.set_forge_sequence([
        _hero_pair("Anchor", "tank", 1000, "weapon", "Hold Line", "Iron Wall"),
    ])
    harness.forge(headers_a, _sample_image_base64((120, 80, 60)), materials={})
    hero_a_id = harness.heroes(headers_a)[0]["id"]

    headers_b = harness.login(email_b)
    harness.set_forge_sequence([
        _hero_pair("Titan", "tank", 1300, "weapon", "Crush", "Fortress"),
    ])
    harness.forge(headers_b, _sample_image_base64((60, 80, 140)), materials={})
    hero_b_id = harness.heroes(headers_b)[0]["id"]

    join_a = harness.pvp_join(headers_a, [hero_a_id], queue_key="ranked-gap", battle_mode="1v1")
    assert join_a["status"] == "waiting"

    join_b = harness.pvp_join(headers_b, [hero_b_id], queue_key="ranked-gap", battle_mode="1v1")
    assert join_b["status"] == "waiting"

    status_a = harness.pvp_entry_status(headers_a, join_a["entry"]["id"])
    assert status_a["entry"]["status"] == "waiting"
    assert status_a["match"] is None

    economy_a = harness.economy(headers_a)
    economy_b = harness.economy(headers_b)
    assert economy_a["wallet"]["dust_balance"] == 370
    assert economy_b["wallet"]["dust_balance"] == 370


@pytest.mark.integration
def test_4v4_board_snapshot_and_range_targeting(harness):
    email = "integration-board@example.com"
    headers = harness.login(email)

    team_a = [
        _board_hero("Alpha", range_mode="ranged", target_num=2, speed=60, accuracy=95, evasion=20),
        _board_hero("Bravo", range_mode="melee", target_num=1, speed=50, accuracy=90, evasion=18),
        _board_hero("Charlie", range_mode="melee", target_num=1, speed=45, accuracy=88, evasion=16),
        _board_hero("Delta", range_mode="ranged", target_num=2, speed=40, accuracy=85, evasion=14),
    ]
    team_b = [
        _board_hero("Echo", range_mode="melee", target_num=1, speed=58, accuracy=92, evasion=18),
        _board_hero("Foxtrot", range_mode="melee", target_num=1, speed=52, accuracy=90, evasion=16),
        _board_hero("Gulf", range_mode="melee", target_num=1, speed=48, accuracy=88, evasion=14),
        _board_hero("Hotel", range_mode="ranged", target_num=2, speed=42, accuracy=86, evasion=12),
    ]

    result = harness.battle_team(headers, team_a, team_b, size="4v4")
    assert result["board"]["riverLabel"].startswith("Round")
    assert len(result["board"]["top"]) == 4
    assert len(result["board"]["bottom"]) == 4
    assert result["board"]["round"] >= 1

    attacker = battle_logic.Battler(_board_hero("LaneBreaker", range_mode="ranged", target_num=1), "A", 0)
    allies = [attacker]
    melee_target = battle_logic.Battler(_board_hero("Guard", range_mode="melee"), "B", 0)
    melee_target.hp = 0
    adjacent_target = battle_logic.Battler(_board_hero("Flank", range_mode="melee"), "B", 1)
    far_target = battle_logic.Battler(_board_hero("Rear", range_mode="melee"), "B", 3)

    melee_skill = attacker.character["skill"]["s1"] | {"RANGE": "melee"}
    ranged_skill = attacker.character["skill"]["s1"] | {"RANGE": "ranged"}

    melee_targets = battle_logic._ordered_board_targets(attacker, allies, [melee_target, adjacent_target, far_target], melee_skill)
    ranged_targets = battle_logic._ordered_board_targets(attacker, allies, [melee_target, adjacent_target, far_target], ranged_skill)

    assert melee_targets == []
    assert ranged_targets and ranged_targets[0].tag == "B2"
