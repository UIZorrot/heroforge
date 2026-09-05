from datetime import datetime, timezone

from market_logic import (
    STOCK_RELIC_TYPES,
    build_market_board_snapshot,
    is_market_purchasable,
    weekly_special_relic_types,
)
from relic_catalog import get_relic_catalog


def test_weekly_specials_are_deterministic_and_exclude_stock_shelf():
    week_a = datetime(2026, 8, 17, tzinfo=timezone.utc)
    week_b = datetime(2026, 8, 24, tzinfo=timezone.utc)
    specials_a = weekly_special_relic_types(week_a)
    specials_b = weekly_special_relic_types(week_b)

    assert len(specials_a) == 3
    assert len(set(specials_a)) == 3
    assert not set(specials_a) & set(STOCK_RELIC_TYPES)
    assert specials_a == weekly_special_relic_types(week_a)
    assert specials_a != specials_b


def test_market_board_splits_shards_and_limited_relic_shop():
    catalog = get_relic_catalog()
    board = build_market_board_snapshot(
        catalog=catalog,
        owned_amounts={},
        transactions=[],
        now=datetime(2026, 8, 17, tzinfo=timezone.utc),
    )

    assert board["broker_offers"] == []
    assert all(row["kind"] == "shard" for row in board["shard_listings"])
    assert all(row["purchasable"] for row in board["shard_listings"])
    assert len(board["shard_listings"]) == sum(1 for row in catalog if row["kind"] == "shard")

    assert all(row["kind"] == "relic" for row in board["relic_listings"])
    assert all(row["purchasable"] for row in board["relic_listings"])
    assert all(row["purchase_window"] in {"stock", "weekly"} for row in board["relic_listings"])
    assert {row["relic_type"] for row in board["featured_relics"]} == set(board["weekly_special_types"])

    assert is_market_purchasable("low_ember_shard", catalog)
    assert is_market_purchasable("named_echo_heart", catalog)
    assert not is_market_purchasable("named_kingless_banner", catalog)
    assert not is_market_purchasable("named_bone_rosary_of_the_silent_march", catalog)
