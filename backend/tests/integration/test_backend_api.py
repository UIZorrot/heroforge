from __future__ import annotations

import base64
import copy
import io
import uuid
from typing import Any, Dict

import pytest
from PIL import Image

import battle_logic
from market_logic import relic_market_quote
from relic_catalog import get_relic_catalog
from relic_catalog import get_low_tier_relic_types


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


def _resolve_pvp_session_with_program(harness, headers: Dict[str, str], entry_id: str, session_id: str):
    import battle_sessions

    session = battle_sessions.get_battle_session(session_id)
    assert session is not None
    for _ in range(160):
        if session.status == "resolved":
            break
        assert session.waiting_until_ms is not None
        assert session.auto_advance_due(now_ms=session.waiting_until_ms + 1) is True
    assert session.status == "resolved"
    return harness.pvp_entry_status(headers, entry_id)


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
def test_agent_key_can_read_roster_and_is_revocable(harness):
    session_headers = harness.login("integration-agent-key@example.com")

    created = harness.client.post("/api/me/agent-keys", headers=session_headers, json={"name": "Arena Strategist"})
    harness.trace("agent-key-create", created)
    assert created.status_code == 201
    payload = created.get_json()["data"]
    agent_key = payload["secret"]
    key_record = payload["key"]
    assert agent_key.startswith("hf_agent_")
    assert key_record["name"] == "Arena Strategist"
    assert "battle:act" in key_record["scopes"]
    assert "secret" not in key_record

    listed = harness.client.get("/api/me/agent-keys", headers=session_headers)
    harness.trace("agent-key-list", listed)
    assert listed.status_code == 200
    assert listed.get_json()["data"][0]["id"] == key_record["id"]
    assert "secret" not in listed.get_json()["data"][0]

    agent_headers = harness.headers(agent_key)
    roster = harness.client.get("/api/me/heroes", headers=agent_headers)
    harness.trace("agent-key-heroes", roster)
    assert roster.status_code == 200

    forbidden = harness.client.get("/api/daily/me", headers=agent_headers)
    harness.trace("agent-key-forbidden", forbidden)
    assert forbidden.status_code == 403

    revoked = harness.client.delete(f"/api/me/agent-keys/{key_record['id']}", headers=session_headers)
    harness.trace("agent-key-revoke", revoked)
    assert revoked.status_code == 200
    assert revoked.get_json()["data"]["revoked_at"]

    invalid_after_revoke = harness.client.get("/api/me/heroes", headers=agent_headers)
    harness.trace("agent-key-revoked", invalid_after_revoke)
    assert invalid_after_revoke.status_code == 401


@pytest.mark.integration
def test_new_user_receives_eight_starter_cards_with_example_images(harness):
    headers = harness.login("integration-starter-cards@example.com")

    heroes = harness.heroes(headers)

    assert len(heroes) == 8
    starter_names = {hero["hero_payload"]["name"] for hero in heroes}
    assert starter_names == {
        "Aurelia",
        "Myrr",
        "Kharos",
        "Vera",
        "Sylwen",
        "Odran",
        "Brakka",
        "Garran",
    }
    image_urls = [hero["source_payload"]["image_url"] for hero in heroes]
    assert len(set(image_urls)) == 8
    assert all(image_url.startswith("/test/") and image_url.endswith(".png") for image_url in image_urls)
    assert all(hero["source_payload"]["source"] == "starter_deck_v1" for hero in heroes)

    heroes_again = harness.heroes(headers)
    assert len(heroes_again) == 8


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
def test_market_relic_buy_updates_wallet_inventory_and_ledger(harness):
    headers = harness.login("integration-market-buy@example.com")

    response = harness.client.post(
        "/api/market/relics/buy",
        headers=headers,
        json={"relicType": "low_ember_shard", "quantity": 2},
    )
    harness.trace("market-buy", response)
    assert response.status_code == 200, response.get_data(as_text=True)

    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["trade"]["side"] == "buy"
    assert payload["trade"]["relicType"] == "low_ember_shard"
    assert payload["trade"]["quantity"] == 2

    quote = relic_market_quote("low_ember_shard", get_relic_catalog())
    expected_total = int(quote["ask_price"]) * 2
    assert payload["trade"]["unitPrice"] == int(quote["ask_price"])
    assert payload["trade"]["totalPrice"] == expected_total

    economy = payload["economy"]
    assert economy["wallet"]["dust_balance"] == 500 - expected_total
    ember_row = next(row for row in economy["relics"] if row["relic_type"] == "low_ember_shard")
    assert ember_row["amount"] == 2

    market_transactions = [row for row in economy["transactions"] if row["reason"] == "market_buy_relic"]
    assert len(market_transactions) == 2
    dust_txn = next(row for row in market_transactions if row["resource_type"] == "dust")
    relic_txn = next(row for row in market_transactions if row["resource_type"] == "relic")
    assert dust_txn["delta"] == -expected_total
    assert relic_txn["resource_key"] == "low_ember_shard"
    assert relic_txn["delta"] == 2


@pytest.mark.integration
def test_market_board_snapshot_returns_server_authored_sections(harness):
    headers = harness.login("integration-market-board@example.com")

    response = harness.client.get("/api/market/board", headers=headers)
    harness.trace("market-board", response)
    assert response.status_code == 200, response.get_data(as_text=True)

    payload = response.get_json()["data"]
    assert isinstance(payload["relic_listings"], list)
    assert isinstance(payload["featured_relics"], list)
    assert isinstance(payload["broker_offers"], list)
    assert isinstance(payload["order_tape"], list)
    assert isinstance(payload["notes"], list)
    assert payload["broker_offers"]

    ember = next(row for row in payload["relic_listings"] if row["relic_type"] == "low_ember_shard")
    quote = relic_market_quote("low_ember_shard", get_relic_catalog())
    assert ember["ask_price"] == int(quote["ask_price"])
    assert ember["bid_price"] == int(quote["bid_price"])
    assert ember["category"] == "artifact"
    assert ember["icon_path"].endswith("/Ember%20Shard.png")
    assert ember["owned_amount"] == 0


@pytest.mark.integration
def test_market_board_order_tape_prefers_real_transactions(harness):
    headers = harness.login("integration-market-board-tape@example.com")

    buy_response = harness.client.post(
        "/api/market/relics/buy",
        headers=headers,
        json={"relicType": "low_ember_shard", "quantity": 1},
    )
    harness.trace("market-board-buy", buy_response)
    assert buy_response.status_code == 200, buy_response.get_data(as_text=True)

    response = harness.client.get("/api/market/board", headers=headers)
    harness.trace("market-board-after-buy", response)
    assert response.status_code == 200, response.get_data(as_text=True)

    payload = response.get_json()["data"]
    assert any(entry["action"] == "Bought from market" for entry in payload["order_tape"])
    assert any(entry["label"] == "low_ember_shard" for entry in payload["order_tape"])


@pytest.mark.integration
def test_market_relic_sell_updates_wallet_inventory_and_ledger(harness):
    headers = harness.login("integration-market-sell@example.com")
    user_id = harness.last_user["id"]
    harness.grant_relic(user_id, "low_ember_shard", 3)

    response = harness.client.post(
        "/api/market/relics/sell",
        headers=headers,
        json={"relicType": "low_ember_shard", "quantity": 2},
    )
    harness.trace("market-sell", response)
    assert response.status_code == 200, response.get_data(as_text=True)

    payload = response.get_json()
    assert payload["ok"] is True
    assert payload["trade"]["side"] == "sell"
    assert payload["trade"]["relicType"] == "low_ember_shard"
    assert payload["trade"]["quantity"] == 2

    quote = relic_market_quote("low_ember_shard", get_relic_catalog())
    expected_total = int(quote["bid_price"]) * 2
    assert payload["trade"]["unitPrice"] == int(quote["bid_price"])
    assert payload["trade"]["totalPrice"] == expected_total

    economy = payload["economy"]
    assert economy["wallet"]["dust_balance"] == 500 + expected_total
    ember_row = next(row for row in economy["relics"] if row["relic_type"] == "low_ember_shard")
    assert ember_row["amount"] == 1

    market_transactions = [row for row in economy["transactions"] if row["reason"] == "market_sell_relic"]
    assert len(market_transactions) == 2
    dust_txn = next(row for row in market_transactions if row["resource_type"] == "dust")
    relic_txn = next(row for row in market_transactions if row["resource_type"] == "relic")
    assert dust_txn["delta"] == expected_total
    assert relic_txn["resource_key"] == "low_ember_shard"
    assert relic_txn["delta"] == -2


@pytest.mark.integration
def test_market_relic_buy_rejects_insufficient_dust(harness):
    headers = harness.login("integration-market-no-dust@example.com")

    response = harness.client.post(
        "/api/market/relics/buy",
        headers=headers,
        json={"relicType": "named_echo_heart", "quantity": 1},
    )
    harness.trace("market-buy-insufficient-dust", response)
    assert response.status_code == 400
    assert response.get_json()["error"] == "Insufficient dust"

    economy = harness.economy(headers)
    assert economy["wallet"]["dust_balance"] == 500
    assert economy["relics"] == []


@pytest.mark.integration
def test_market_relic_sell_rejects_insufficient_inventory(harness):
    headers = harness.login("integration-market-no-relics@example.com")

    response = harness.client.post(
        "/api/market/relics/sell",
        headers=headers,
        json={"relicType": "low_ember_shard", "quantity": 1},
    )
    harness.trace("market-sell-insufficient-relics", response)
    assert response.status_code == 400
    assert response.get_json()["error"] == "Insufficient relics"

    economy = harness.economy(headers)
    assert economy["wallet"]["dust_balance"] == 500
    assert economy["relics"] == []


@pytest.mark.integration
def test_card_relic_enchant_lifecycle_is_persistent_and_one_time(harness):
    headers = harness.login("integration-card-relic@example.com")
    user_id = harness.last_user["id"]
    harness.set_forge_sequence([
        _hero_pair("Relic Bearer", "warrior", 1600, "fire", "Torch Cut", "Ash Guard"),
    ])
    harness.forge(headers, _sample_image_base64())
    hero = harness.heroes(headers)[0]
    hero_id = hero["id"]

    harness.grant_relic(user_id, "low_ember_shard", 2)
    harness.grant_relic(user_id, "low_frost_shard", 1)

    equipped = harness.equip_relic(headers, hero_id, "low_frost_shard")
    assert equipped["card"]["equipped_relic_type"] == "low_frost_shard"
    assert harness.heroes(headers)[0]["equipped_relic_type"] == "low_frost_shard"

    enchanted_response = harness.enchant_card(headers, hero_id, "low_ember_shard")
    assert enchanted_response.status_code == 200, enchanted_response.get_data(as_text=True)
    enchanted = enchanted_response.get_json()
    assert enchanted["card"]["enchantment"]["relicType"] == "low_ember_shard"
    assert enchanted["card"]["enchantment"]["removedAt"] is None
    economy_after_enchant = enchanted["economy"]
    ember_after_enchant = next(row for row in economy_after_enchant["relics"] if row["relic_type"] == "low_ember_shard")
    assert ember_after_enchant["amount"] == 1
    assert economy_after_enchant["transactions"][0]["reason"] == "card_enchant"

    washed_response = harness.wash_enchant(headers, hero_id)
    assert washed_response.status_code == 200, washed_response.get_data(as_text=True)
    washed = washed_response.get_json()
    assert washed["card"]["enchantment"]["removedAt"]
    ember_after_wash = next(row for row in washed["economy"]["relics"] if row["relic_type"] == "low_ember_shard")
    assert ember_after_wash["amount"] == 1

    second_response = harness.enchant_card(headers, hero_id, "low_ember_shard")
    assert second_response.status_code == 409
    assert "already been enchanted" in second_response.get_json()["error"]

    persisted = harness.heroes(headers)[0]
    assert persisted["equipped_relic_type"] == "low_frost_shard"
    assert persisted["enchantment"]["relicType"] == "low_ember_shard"
    assert persisted["enchantment"]["removedAt"]


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
    assert claimed_payload["economy"]["wallet"]["dust_balance"] == 500


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
    assert "Place 1 to 6 active cards" in response.get_json()["error"]


@pytest.mark.integration
def test_arena_join_rejects_more_than_six_cards(harness):
    headers = harness.login("integration-seven-arena@example.com")
    hero_ids = []
    for index in range(7):
        hero_payload = _hero_pair(f"Arena {index}", "warrior", 1000, "weapon", "Slash", "Guard")["p2"]
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
                        harness.db_module.serialize_json(hero_payload),
                    ),
                )
                row = cur.fetchone()
            conn.commit()
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
                "back_2": hero_ids[5],
                "overflow": hero_ids[6],
            },
        },
    )
    harness.trace("arena-seven-formation", response)

    assert response.status_code == 400
    assert "Place 1 to 6 active cards" in response.get_json()["error"]


@pytest.mark.integration
def test_arena_join_accepts_six_card_formation(harness):
    headers = harness.login("integration-six-arena@example.com")
    hero_ids = []
    for index in range(6):
        hero_payload = _hero_pair(f"Arena Six {index}", "warrior", 1000, "weapon", "Slash", "Guard")["p2"]
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
                        harness.db_module.serialize_json(hero_payload),
                    ),
                )
                row = cur.fetchone()
            conn.commit()
            hero_ids.append(str(row["id"]))

    response = harness.client.post(
        "/api/pvp/join",
        headers=headers,
        json={
            "mode": "arena_2x3",
            "queueKey": "ranked-six",
            "formation": {
                "front_0": hero_ids[0],
                "front_1": hero_ids[1],
                "front_2": hero_ids[2],
                "back_0": hero_ids[3],
                "back_1": hero_ids[4],
                "back_2": hero_ids[5],
            },
        },
    )
    harness.trace("arena-six-formation", response)

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["entry"]["battle_mode"] == "arena_2x3"
    assert len(payload["entry"]["team_snapshot"]["team"]) == 6
    assert payload["entry"]["formation_snapshot"]["board"]["back_2"] == hero_ids[5]


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
def test_arena_rejects_second_active_queue_without_charging_again(harness):
    headers = harness.login("integration-arena-single-queue@example.com")
    harness.set_forge_sequence([
        _hero_pair("First Watch", "warrior", 1000, "weapon", "Watch Cut", "Brace"),
        _hero_pair("Second Watch", "mage", 1000, "magic", "Watch Bolt", "Ward"),
    ])
    harness.forge(headers, _sample_image_base64((100, 90, 130)), materials={})
    harness.forge(headers, _sample_image_base64((90, 110, 150)), materials={})
    hero_ids = [hero["id"] for hero in harness.heroes(headers)[:2]]

    first = harness.pvp_join(headers, [hero_ids[0]], queue_key="ranked-single", battle_mode="1v1")
    assert first["status"] == "waiting"

    duplicate = harness.client.post(
        "/api/pvp/join",
        headers=headers,
        json={"queueKey": "ranked-single", "heroIds": [hero_ids[1]], "battleMode": "1v1"},
    )
    harness.trace("arena-second-active-queue", duplicate)
    assert duplicate.status_code == 400
    assert "already searching" in duplicate.get_json()["error"].lower()

    economy = harness.economy(headers)
    assert economy["wallet"]["dust_balance"] == 270


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
    latest_battle = battles[0]
    assert latest_battle["payload"]["heroA"]["name"] == "Northwind"
    assert latest_battle["payload"]["heroB"]["name"] == "Starfall"
    assert latest_battle["result"]["events"]

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
    assert join_b["match"]["status"] == "running"
    assert join_b["battle"] is None
    assert join_b["battle_session"]["status"] == "awaiting_action"
    assert join_b["battle_session"]["activeActorTag"]

    status_a = _resolve_pvp_session_with_program(
        harness,
        headers_a,
        join_a["entry"]["id"],
        join_b["battle_session"]["sessionId"],
    )
    assert status_a["entry"]["status"] == "matched"
    assert status_a["match"]["status"] == "resolved"
    assert status_a["match"]["battle_result"]["winnerLabel"] in {"Player A", "Player B", "Tie"}

    lock_a = harness.db_module.fetch_one("SELECT active_pvp_entry_id FROM heroes WHERE id = %s", (hero_a_id,))
    lock_b = harness.db_module.fetch_one("SELECT active_pvp_entry_id FROM heroes WHERE id = %s", (hero_b_id,))
    assert lock_a["active_pvp_entry_id"] is None
    assert lock_b["active_pvp_entry_id"] is None

    economy_a = harness.economy(headers_a)
    economy_b = harness.economy(headers_b)
    total_dust = economy_a["wallet"]["dust_balance"] + economy_b["wallet"]["dust_balance"]
    assert total_dust == 800


@pytest.mark.integration
def test_arena_session_allows_only_the_active_side_agent_to_act(harness):
    headers_a = harness.login("integration-session-side-a@example.com")
    harness.set_forge_sequence([_hero_pair("Aster", "knight", 1000, "weapon", "Aster Cut", "Aster Guard")])
    harness.forge(headers_a, _sample_image_base64((130, 90, 60)), materials={})
    hero_a_id = harness.heroes(headers_a)[0]["id"]

    headers_b = harness.login("integration-session-side-b@example.com")
    harness.set_forge_sequence([_hero_pair("Brim", "rogue", 1000, "gun", "Brim Shot", "Brim Guard")])
    harness.forge(headers_b, _sample_image_base64((60, 100, 150)), materials={})
    hero_b_id = harness.heroes(headers_b)[0]["id"]

    join_a = harness.pvp_join(headers_a, [hero_a_id], queue_key="ranked-session-access", battle_mode="1v1")
    join_b = harness.pvp_join(headers_b, [hero_b_id], queue_key="ranked-session-access", battle_mode="1v1")
    session = join_b["battle_session"]
    actor_tag = session["activeActorTag"]
    wrong_headers = headers_b if actor_tag.startswith("A") else headers_a
    right_headers = headers_a if actor_tag.startswith("A") else headers_b

    denied = harness.client.post(
        f"/api/battle/sessions/{session['sessionId']}/actions",
        headers=wrong_headers,
        json={"action": {"actorTag": actor_tag, "kind": "attack"}},
    )
    assert denied.status_code == 403

    accepted = harness.client.post(
        f"/api/battle/sessions/{session['sessionId']}/actions",
        headers=right_headers,
        json={"action": {"actorTag": actor_tag, "kind": "attack"}},
    )
    assert accepted.status_code == 200
    assert accepted.get_json()["data"]["lastActionSource"] == "rest"


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
    status_a = _resolve_pvp_session_with_program(
        harness,
        headers_a,
        join_a["entry"]["id"],
        join_b["battle_session"]["sessionId"],
    )
    assert status_a["match"]["winner_side"] == "A"
    reward = status_a["match"]["reward_payload"]
    assert reward["relic_drop"] is not None
    assert reward["relic_drop"]["relic_type"] in get_low_tier_relic_types()
    assert reward["relic_drop"]["display_name"]
    assert reward["relic_drop"]["amount"] == 1

    economy_a = harness.economy(headers_a)
    assert any(relic["relic_type"] == reward["relic_drop"]["relic_type"] and relic["amount"] == 1 for relic in economy_a["relics"])
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
    assert join_b["battle"] is None
    board = join_b["battle_session"]["board"]
    assert board["topLabel"] == "Player B"
    assert board["bottomLabel"] == "Player A"
    assert len(board["top"]) == 4
    assert len(board["bottom"]) == 4


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


@pytest.mark.integration
def test_public_battle_observation_exposes_only_visible_state():
    hero_a = _board_hero("Alpha", range_mode="ranged", target_num=1)
    hero_b = _board_hero("Bravo", range_mode="melee", target_num=1)
    attacker = battle_logic.Battler(hero_a, "A", 0)
    defender = battle_logic.Battler(hero_b, "B", 0)

    observation = battle_logic.build_public_battle_observation(
        round_num=3,
        actor=attacker,
        allies=[attacker],
        enemies=[defender],
        label_a="Player A",
        label_b="Player B",
    )

    assert observation["round"] == 3
    assert observation["labels"] == {"a": "Player A", "b": "Player B"}
    assert observation["actor"]["tag"].startswith("A")
    assert observation["actor"]["hp"] == attacker.hp
    assert observation["actor"]["mp"] == attacker.mp
    assert observation["enemies"][0]["tag"].startswith("B")
    assert "secret" not in observation


@pytest.mark.integration
def test_program_controller_targets_self_skill_at_actor(monkeypatch):
    hero = _board_hero("Mage", range_mode="ranged", target_num=1)
    hero["skill"]["s1"]["TARGET"] = "Self"
    hero["skill"]["s1"]["TARGET_NUM"] = 1
    hero["skill"]["s1"]["MP_COST"] = 0
    hero["skill"]["s2"]["MP_COST"] = 9999
    actor = battle_logic.Battler(hero, "A", 0)
    enemy = battle_logic.Battler(_board_hero("Target", range_mode="melee", target_num=1), "B", 0)
    controller = battle_logic.ProgramBattleController()
    observation = battle_logic.build_public_battle_observation(
        round_num=1,
        actor=actor,
        allies=[actor],
        enemies=[enemy],
        label_a="Player A",
        label_b="Player B",
    )

    monkeypatch.setattr(battle_logic.random, "random", lambda: 0.1)
    action = controller.choose_action(observation)

    assert action.kind == "skill"
    assert action.skill_slot == "s1"
    assert action.target_tag == actor.tag


@pytest.mark.integration
def test_battle_core_accepts_a_controller_and_reports_control_mode():
    hero_a = _board_hero("Alpha", range_mode="ranged", target_num=1)
    hero_b = _board_hero("Bravo", range_mode="melee", target_num=1)

    result = battle_logic.run_auto_duel(
        hero_a,
        hero_b,
        label_a="Alpha",
        label_b="Bravo",
        controller=battle_logic.ProgramBattleController(),
    )

    assert result["controlMode"] == "program"
    assert result["winner"] in {"Alpha", "Bravo", "Tie"}


@pytest.mark.integration
def test_battle_route_echoes_requested_control_mode(monkeypatch):
    import importlib

    backend_main = importlib.import_module("main")
    monkeypatch.setattr(backend_main, "current_user", lambda: {"id": "integration-user"})
    monkeypatch.setattr(backend_main, "save_battle_history", lambda *args, **kwargs: None)

    client = backend_main.app.test_client()
    hero_a = _board_hero("Alpha", range_mode="ranged", target_num=1)
    hero_b = _board_hero("Bravo", range_mode="melee", target_num=1)

    response = client.post(
        "/api/battle",
        json={"heroA": hero_a, "heroB": hero_b, "controlMode": "ai"},
    )
    assert response.status_code == 200, response.get_data(as_text=True)
    payload = response.get_json()

    assert payload["controlMode"] == "ai"


@pytest.mark.integration
def test_battle_team_arena_2x3_returns_six_slot_board(harness):
    headers = harness.login("integration-train-2x3@example.com")
    team_a = [_board_hero(f"Forger {index + 1}", speed=35 + index) for index in range(6)]
    team_b = [_board_hero(f"Rival {index + 1}", speed=30 + index) for index in range(6)]

    payload = harness.battle_team(headers, team_a, team_b, size="arena_2x3")

    assert payload["winnerLabel"] in {"Top", "Bottom", "Tie"}
    assert payload["controlMode"] == "program"
    assert len(payload["board"]["bottom"]) == 6
    assert len(payload["board"]["top"]) == 6
    assert payload["board"]["bottom"][5]["name"] == "Forger 6"
    assert payload["board"]["top"][5]["name"] == "Rival 6"


@pytest.mark.integration
def test_create_battle_session_returns_public_snapshot_only():
    import battle_sessions

    hero_a = _board_hero("Alpha", range_mode="ranged", target_num=1)
    hero_b = _board_hero("Bravo", range_mode="melee", target_num=1)

    session = battle_sessions.create_battle_session(
        battle_mode="1v1",
        control_mode="rest",
        label_a="Alpha",
        label_b="Bravo",
        team_a=[hero_a],
        team_b=[hero_b],
        wait_seconds=30,
    )

    snapshot = session.public_snapshot()

    assert session.session_id
    assert snapshot["sessionId"] == session.session_id
    assert snapshot["battleMode"] == "1v1"
    assert snapshot["controlMode"] == "rest"
    assert snapshot["status"] == "awaiting_action"
    assert snapshot["waitingUntil"] > 0
    assert snapshot["observation"]["actor"]["tag"].startswith(("A", "B"))
    assert "internal_turn_queue" not in snapshot


@pytest.mark.integration
def test_create_arena_2x3_battle_session_exposes_six_slots():
    import battle_sessions

    team_a = [_board_hero(f"Forger {index + 1}", speed=40 + index) for index in range(6)]
    team_b = [_board_hero(f"Rival {index + 1}", speed=30 + index) for index in range(6)]

    session = battle_sessions.create_battle_session(
        battle_mode="arena_2x3",
        control_mode="rest",
        label_a="Forger",
        label_b="Rival",
        team_a=team_a,
        team_b=team_b,
        wait_seconds=30,
    )

    snapshot = session.public_snapshot()

    assert snapshot["battleMode"] == "arena_2x3"
    assert snapshot["status"] == "awaiting_action"
    assert len(session.team_a_units) == 6
    assert len(session.team_b_units) == 6
    assert snapshot["observation"]["actor"]["tag"] in {f"A{index}" for index in range(1, 7)} | {f"B{index}" for index in range(1, 7)}


@pytest.mark.integration
def test_battle_session_route_create_and_submit_action(monkeypatch):
    import importlib

    backend_main = importlib.import_module("main")
    monkeypatch.setattr(backend_main, "current_user", lambda: {"id": "integration-user"})
    monkeypatch.setattr(backend_main, "save_battle_history", lambda *args, **kwargs: None)

    client = backend_main.app.test_client()
    hero_a = _board_hero("Alpha", range_mode="ranged", target_num=1)
    hero_b = _board_hero("Bravo", range_mode="melee", target_num=1)

    create_response = client.post(
        "/api/battle/sessions",
        json={
            "battleMode": "1v1",
            "controlMode": "rest",
            "labelA": "Alpha",
            "labelB": "Bravo",
            "teamA": [hero_a],
            "teamB": [hero_b],
        },
    )
    assert create_response.status_code == 201, create_response.get_data(as_text=True)
    create_payload = create_response.get_json()["data"]
    session_id = create_payload["sessionId"]
    actor_tag = create_payload["activeActorTag"]
    target_tag = "B1" if actor_tag.startswith("A") else "A1"

    step_response = client.post(
        f"/api/battle/sessions/{session_id}/actions",
        json={"action": {"actorTag": actor_tag, "kind": "attack", "targetTag": target_tag}},
    )
    assert step_response.status_code == 200, step_response.get_data(as_text=True)
    step_payload = step_response.get_json()["data"]

    assert step_payload["lastActionSource"] == "rest"
    assert step_payload["activeActorTag"]
    assert step_payload["activeActorTag"] != actor_tag


@pytest.mark.integration
def test_battle_session_timeout_falls_back_to_program():
    import battle_sessions

    hero_a = _board_hero("Alpha", range_mode="ranged", target_num=1)
    hero_b = _board_hero("Bravo", range_mode="melee", target_num=1)

    session = battle_sessions.create_battle_session(
        battle_mode="1v1",
        control_mode="rest",
        label_a="Alpha",
        label_b="Bravo",
        team_a=[hero_a],
        team_b=[hero_b],
        wait_seconds=1,
    )

    initial_actor_tag = session.active_actor_tag
    assert session.waiting_until_ms is not None

    assert session.auto_advance_due(now_ms=session.waiting_until_ms - 1) is False
    assert session.last_action_source is None

    assert session.auto_advance_due(now_ms=session.waiting_until_ms + 1) is True
    snapshot = session.public_snapshot()

    assert snapshot["lastActionSource"] == "program"
    assert snapshot["activeActorTag"] != initial_actor_tag


@pytest.mark.integration
def test_battle_session_rejects_locked_target_outside_legal_range():
    import battle_sessions

    attacker = _board_hero("Spearman", range_mode="melee", target_num=1, speed=90, accuracy=100, evasion=0)
    front_target = _board_hero("Front Guard", range_mode="melee", target_num=1, speed=10, accuracy=100, evasion=0)
    back_target = _board_hero("Back Guard", range_mode="melee", target_num=1, speed=9, accuracy=100, evasion=0)

    session = battle_sessions.create_battle_session(
        battle_mode="4v4",
        control_mode="rest",
        label_a="Forger",
        label_b="Rival",
        team_a=[attacker],
        team_b=[front_target, back_target],
        wait_seconds=30,
    )

    assert session.active_actor_tag == "A1"

    with pytest.raises(battle_sessions.BattleSessionError, match="targetTag is not legal"):
        session.submit_action({"actorTag": "A1", "kind": "attack", "targetTag": "B2"})

    snapshot = session.public_snapshot()
    assert snapshot["status"] == "awaiting_action"
    assert snapshot["activeActorTag"] == "A1"
    assert session.team_b_units[1].hp == session.team_b_units[1].max_hp


@pytest.mark.integration
def test_battle_session_program_flow_resolves_with_board_history(monkeypatch):
    import battle_sessions

    monkeypatch.setattr(battle_sessions.random, "shuffle", lambda seq: None)
    monkeypatch.setattr(battle_sessions.random, "random", lambda: 0.1)

    hero_a = _board_hero("Executioner", range_mode="melee", target_num=1, hp=160, atk=120, defense=0, speed=80, accuracy=100, evasion=0)
    hero_b = _board_hero("Sentinel", range_mode="melee", target_num=1, hp=80, atk=20, defense=0, speed=10, accuracy=100, evasion=0)

    session = battle_sessions.create_battle_session(
        battle_mode="1v1",
        control_mode="rest",
        label_a="Forger",
        label_b="Rival",
        team_a=[hero_a],
        team_b=[hero_b],
        wait_seconds=1,
    )

    guard = 0
    while session.status != "resolved" and guard < 20:
        assert session.auto_advance_due(now_ms=(session.waiting_until_ms or 0) + 1)
        guard += 1

    snapshot = session.public_snapshot()
    assert snapshot["status"] == "resolved"
    assert snapshot["result"]["winnerLabel"] == "Forger"
    assert snapshot["result"]["finalHpB"] == 0
    assert snapshot["result"]["board"]["top"][0]["alive"] is False
    assert snapshot["result"]["boardHistory"]
    assert snapshot["result"]["events"][0]["damage"] >= 1


@pytest.mark.integration
def test_battle_session_program_fallback_does_not_lock_illegal_target(monkeypatch):
    import battle_sessions

    monkeypatch.setattr(battle_sessions.random, "shuffle", lambda seq: None)

    attacker = _board_hero("Spearman", range_mode="melee", target_num=1, speed=90, accuracy=100, evasion=0)
    dead_front = _board_hero("Fallen Guard", range_mode="melee", target_num=1, hp=40, speed=10, accuracy=100, evasion=0)
    far_back = _board_hero("Back Guard", range_mode="melee", target_num=1, hp=100, speed=9, accuracy=100, evasion=0)

    class IllegalTargetController:
        def choose_action(self, observation):
            return battle_logic.BattleAction(kind="skill", skill_slot="s1", target_tag="B2")

    monkeypatch.setattr(battle_sessions.battle_logic, "ProgramBattleController", IllegalTargetController)

    session = battle_sessions.create_battle_session(
        battle_mode="4v4",
        control_mode="rest",
        label_a="Forger",
        label_b="Rival",
        team_a=[attacker],
        team_b=[dead_front, far_back],
        wait_seconds=1,
    )
    assert session.active_actor_tag == "A1"
    session.team_b_units[0].hp = 0
    session._refresh_observation()

    assert session.auto_advance_due(now_ms=(session.waiting_until_ms or 0) + 1) is True
    snapshot = session.public_snapshot()

    assert snapshot["lastActionSource"] == "program"
    assert snapshot["lastAction"]["targetTag"] is None
    assert session.team_b_units[1].hp == session.team_b_units[1].max_hp


@pytest.mark.integration
def test_battle_session_program_fallback_preserves_valid_skill_target(monkeypatch):
    import battle_sessions

    monkeypatch.setattr(battle_sessions.random, "shuffle", lambda seq: None)
    monkeypatch.setattr(battle_sessions.random, "random", lambda: 0.1)

    hero_a = _board_hero("Chaplain", range_mode="melee", target_num=1, hp=500, atk=90, speed=80, accuracy=100, evasion=0)
    hero_b = _board_hero("Target", range_mode="melee", target_num=1, hp=500, atk=20, speed=10, accuracy=100, evasion=0)
    hero_a["skill"]["s1"]["MP_COST"] = 9999
    hero_a["skill"]["s2"]["TARGET"] = "Self"
    hero_a["skill"]["s2"]["ROLE"] = "buff"
    hero_a["skill"]["s2"]["DMG"] = 0
    hero_a["skill"]["s2"]["BUFF_NAME"] = "pray"
    hero_a["skill"]["s2"]["BUFF_DMG"] = 12
    hero_a["skill"]["s2"]["BUFF_TIME"] = 2
    hero_a["skill"]["s2"]["MP_COST"] = 0

    session = battle_sessions.create_battle_session(
        battle_mode="1v1",
        control_mode="rest",
        label_a="Forger",
        label_b="Rival",
        team_a=[hero_a],
        team_b=[hero_b],
        wait_seconds=1,
    )

    assert session.auto_advance_due(now_ms=(session.waiting_until_ms or 0) + 1) is True
    snapshot = session.public_snapshot()

    assert snapshot["lastActionSource"] == "program"
    assert snapshot["lastAction"]["kind"] == "skill"
    assert snapshot["lastAction"]["skillSlot"] == "s2"
    assert snapshot["lastAction"]["targetTag"] == "A1"
    assert any(buff["name"] == "pray" and buff["value"] == 12 for buff in session.team_a_units[0].buffs)


@pytest.mark.integration
def test_battle_session_self_buff_skill_does_not_damage_the_actor(monkeypatch):
    import battle_sessions

    monkeypatch.setattr(battle_sessions.random, "shuffle", lambda seq: None)
    monkeypatch.setattr(battle_sessions.random, "random", lambda: 0.0)

    hero_a = _board_hero("Chaplain", range_mode="melee", target_num=1, hp=500, atk=90, speed=80, accuracy=100, evasion=0)
    hero_b = _board_hero("Target", range_mode="melee", target_num=1, hp=500, atk=20, speed=10, accuracy=100, evasion=0)
    hero_a["skill"]["s2"]["TARGET"] = "Self"
    hero_a["skill"]["s2"]["ROLE"] = "buff"
    hero_a["skill"]["s2"]["DMG"] = 0
    hero_a["skill"]["s2"]["BUFF_NAME"] = "pray"
    hero_a["skill"]["s2"]["BUFF_DMG"] = 12
    hero_a["skill"]["s2"]["BUFF_TIME"] = 2
    hero_a["skill"]["s2"]["MP_COST"] = 0

    session = battle_sessions.create_battle_session(
        battle_mode="1v1",
        control_mode="rest",
        label_a="Forger",
        label_b="Rival",
        team_a=[hero_a],
        team_b=[hero_b],
        wait_seconds=30,
    )

    snapshot = session.submit_action({"actorTag": "A1", "kind": "skill", "skillSlot": "s2"})

    assert session.team_a_units[0].hp == session.team_a_units[0].max_hp
    assert session.team_b_units[0].hp == session.team_b_units[0].max_hp
    assert any(buff["name"] == "pray" and buff["value"] == 12 for buff in session.team_a_units[0].buffs)
    assert snapshot["lastAction"]["kind"] == "skill"
    assert session.events[-1]["damage"] == 0
    assert session.events[-1]["defender"] == "A1"


@pytest.mark.integration
def test_canonical_buffs_have_visual_names_and_gameplay_effects():
    import battle_logic

    unit = battle_logic.Battler(_board_hero("Buffed", hp=120, atk=80, defense=40, speed=30, accuracy=25, evasion=20), "A")
    unit.base_cc = 18
    logs = []

    assert battle_logic.CANONICAL_BUFF_NAMES == (
        "stun",
        "frozen",
        "poison",
        "wound",
        "burn",
        "curse",
        "heal",
        "pray",
    )

    # Legacy negative statuses merge into curse (attack and defense down).
    unit.add_buff("weakness", 2, 7, logs)
    assert unit.buffs[-1]["name"] == "curse"
    assert unit.atk == 73
    assert unit.def_val == 33

    # Legacy positive statuses merge into pray (attack, defense and speed up).
    unit.add_buff("bless", 2, 5, logs)
    assert unit.buffs[-1]["name"] == "pray"
    assert unit.atk == 78
    assert unit.def_val == 38

    unit.add_buff("curse", 2, 6, logs)
    assert unit.atk == 72
    assert unit.def_val == 32

    unit.add_buff("vulnerable", 2, 5, logs)
    assert unit.atk == 67
    assert unit.def_val == 27

    unit.add_buff("pray", 2, 4, logs)
    assert unit.atk == 71
    assert unit.def_val == 31
    assert unit.spd == 39

    unit.add_buff("haste", 2, 8, logs)
    assert unit.spd == 47
    assert unit.ac == 25
    assert unit.cc == 18

    unit.add_buff("frozen", 2, 3, logs)
    assert unit.is_stunned is False
    assert unit.spd == 32
    assert unit.ac == 22
    assert unit.ev == 0

    unit.add_buff("stun", 1, 0, logs)
    assert unit.is_stunned is True

    wounded = battle_logic.Battler(_board_hero("Wounded", hp=120, atk=20), "A")
    wounded_events = []
    wounded.add_buff("wound", 2, 9, [])
    wounded.add_buff("poison", 2, 4, [])
    wounded.add_buff("burn", 2, 3, [])
    assert {buff["name"] for buff in wounded.buffs} == {"wound", "poison", "burn"}
    wounded.tick_buffs(1, lambda *args, **kwargs: wounded_events.append((args, kwargs)))
    assert wounded.hp == wounded.max_hp - 16
    assert [event[0][2] for event in wounded_events] == ["dot_damage", "dot_damage", "dot_damage"]
    assert [event[0][7] for event in wounded_events] == ["wound", "poison", "burn"]

    healed = battle_logic.Battler(_board_hero("Healed", hp=120, atk=20), "A")
    healed.hp = 80
    healed_events = []
    healed.add_buff("heal", 2, 11, [])
    healed.tick_buffs(1, lambda *args, **kwargs: healed_events.append((args, kwargs)))
    assert healed.hp == 91
    assert healed_events[0][0][2] == "heal"


@pytest.mark.integration
def test_battle_session_reads_skill_slot_from_card_payload(monkeypatch):
    import battle_sessions

    monkeypatch.setattr(battle_sessions.random, "shuffle", lambda seq: None)
    monkeypatch.setattr(battle_sessions.random, "random", lambda: 0.0)

    hero_a = _board_hero("Invoker", range_mode="melee", target_num=1, hp=500, mp=30, atk=50, speed=80, accuracy=100, evasion=0)
    hero_b = _board_hero("Target", range_mode="melee", target_num=1, hp=500, atk=20, speed=10, accuracy=100, evasion=0)
    hero_a["skill"]["s1"]["name"] = "Named Card Skill"
    hero_a["skill"]["s1"]["DMG"] = 33
    hero_a["skill"]["s1"]["MP_COST"] = 7

    session = battle_sessions.create_battle_session(
        battle_mode="1v1",
        control_mode="rest",
        label_a="Forger",
        label_b="Rival",
        team_a=[{"id": "card-1", "character": hero_a}],
        team_b=[{"id": "card-2", "character": hero_b}],
        wait_seconds=30,
    )

    assert session.observation["actor"]["skills"]["s1"]["name"] == "Named Card Skill"
    session.submit_action({"actorTag": "A1", "kind": "skill", "skillSlot": "s1"})

    event = session.events[-1]
    assert event["skillName"] == "Named Card Skill"
    assert event["mpCostApplied"] == 7
    assert session.team_a_units[0].mp == 23


@pytest.mark.integration
def test_battle_session_exposes_visual_type_contract_on_units_skills_and_events(monkeypatch):
    import battle_sessions

    monkeypatch.setattr(battle_sessions.random, "shuffle", lambda seq: None)
    monkeypatch.setattr(battle_sessions.random, "random", lambda: 0.0)

    hero_a = _board_hero("Ripper", range_mode="melee", target_num=1, hp=500, mp=30, atk=50, speed=80, accuracy=100, evasion=0)
    hero_b = _board_hero("Target", range_mode="melee", target_num=1, hp=500, atk=20, speed=10, accuracy=100, evasion=0)
    hero_a["state"]["type_catalog"] = "instant"
    hero_a["state"]["type_effect"] = "slash"
    hero_a["skill"]["s1"]["type_catalog"] = "instant"
    hero_a["skill"]["s1"]["type_effect"] = "claw"
    hero_a["skill"]["s1"]["buff_type_effect"] = "flesh"
    hero_a["skill"]["s1"]["DMG"] = 31
    hero_a["skill"]["s1"]["MP_COST"] = 0

    session = battle_sessions.create_battle_session(
        battle_mode="1v1",
        control_mode="rest",
        label_a="Forger",
        label_b="Rival",
        team_a=[{"id": "card-1", "character": hero_a}],
        team_b=[{"id": "card-2", "character": hero_b}],
        wait_seconds=30,
    )

    actor = session.observation["actor"]
    assert actor["state"]["type_catalog"] == "instant"
    assert actor["state"]["type_effect"] == "slash"
    assert actor["skills"]["s1"]["type_catalog"] == "instant"
    assert actor["skills"]["s1"]["type_effect"] == "claw"
    assert actor["skills"]["s1"]["buff_type_effect"] == "flesh"

    session.submit_action({"actorTag": "A1", "kind": "skill", "skillSlot": "s1"})
    event = session.events[-1]

    assert event["attackType"] == "weapon"
    assert event["typeCatalog"] == "instant"
    assert event["typeEffect"] == "claw"
    assert event["buffTypeEffect"] == "flesh"
    assert event["type_catalog"] == "instant"
    assert event["type_effect"] == "claw"
    assert event["buff_type_effect"] == "flesh"


@pytest.mark.integration
def test_legacy_auto_duel_self_buff_skill_does_not_damage_the_actor(monkeypatch):
    import battle_logic

    class SelfBuffController:
        def choose_action(self, observation):
            actor_tag = observation["actor"]["tag"]
            if actor_tag == "A":
                return battle_logic.BattleAction(kind="skill", skill_slot="s2", target_tag="A")
            return battle_logic.BattleAction(kind="attack", target_tag="A")

    monkeypatch.setattr(battle_logic.random, "random", lambda: 0.0)

    hero_a = _board_hero("Chaplain", range_mode="melee", target_num=1, hp=500, atk=90, speed=80, accuracy=100, evasion=0)
    hero_b = _board_hero("Target", range_mode="melee", target_num=1, hp=500, atk=20, speed=10, accuracy=100, evasion=0)
    hero_a["skill"]["s2"]["TARGET"] = "Self"
    hero_a["skill"]["s2"]["ROLE"] = "buff"
    hero_a["skill"]["s2"]["DMG"] = 0
    hero_a["skill"]["s2"]["BUFF_NAME"] = "bless"
    hero_a["skill"]["s2"]["BUFF_DMG"] = 12
    hero_a["skill"]["s2"]["BUFF_TIME"] = 2
    hero_a["skill"]["s2"]["MP_COST"] = 0

    result = battle_logic.run_auto_duel(hero_a, hero_b, label_a="Forger", label_b="Rival", controller=SelfBuffController())
    first_event = result["events"][0]

    assert first_event["actionType"] == "skill"
    assert first_event["defender"] == "A"
    assert first_event["damage"] == 0
    assert first_event["hpA"] == result["maxHpA"]
    # Legacy bless resolves through the merged aliases and is stored as pray.
    assert any(buff["name"] == "pray" and buff["value"] == 12 for buff in first_event["buffsA"])
