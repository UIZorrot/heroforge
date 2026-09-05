from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Sequence
from urllib.parse import quote


TIER_BASE_PRICE = {
    "common": 140,
    "rare": 680,
    "epic": 1680,
    "legendary": 3200,
    "limited": 4200,
}

# Always-available equipment relics (small stock shelf — not the full catalog).
STOCK_RELIC_TYPES = (
    "named_echo_heart",
    "named_oath_lantern",
    "named_thorn_votive",
    "named_sable_talisman",
)

# Weekly specials rotate through this pool (ISO week). Includes limited + mid/high named relics.
WEEKLY_SPECIAL_POOL = (
    "limited_eclipse_medal",
    "limited_blood_moon_seal",
    "limited_frozen_cathedral_token",
    "limited_red_comet_fragment",
    "named_ashen_crown",
    "named_storm_choir_bell",
    "named_mirror_of_the_first_duel",
    "named_frostbound_reliquary",
    "named_grave_key_of_auralis",
    "named_sunless_seal",
    "named_harrow_glass",
    "named_lantern_of_the_ninth_bell",
    "named_hollow_choir",
    "named_crownless_scepter",
)

WEEKLY_SPECIAL_COUNT = 3


def build_relic_icon_path(display_name: str | None) -> str | None:
    if not display_name:
        return None
    return f"/relics/{quote(display_name)}.png"


def infer_relic_category(definition: Dict[str, Any]) -> str:
    text = f"{definition.get('display_name') or ''} {definition.get('family') or ''}".lower()
    if "fang" in text or "scepter" in text or "key" in text:
        return "weapon"
    if "crown" in text or "reliquary" in text or "banner" in text:
        return "armor"
    if (
        "heart" in text
        or "lantern" in text
        or "rosary" in text
        or "talisman" in text
        or "medal" in text
        or "token" in text
        or "seal" in text
        or "votive" in text
        or "glass" in text
    ):
        return "accessory"
    return "artifact"


def rarity_from_bp(bp: int) -> str:
    if bp >= 3000:
        return "mythic"
    if bp >= 1800:
        return "epic"
    if bp >= 900:
        return "rare"
    return "common"


def normalize_offer_type(type_str: str | None) -> str:
    lower = str(type_str or "").lower()
    if "mage" in lower or "wizard" in lower or "sorcerer" in lower or "cleric" in lower:
        return "MAGE"
    if "rogue" in lower or "assassin" in lower or "thief" in lower:
        return "ROGUE"
    if "tank" in lower or "guard" in lower or "shield" in lower:
        return "TANK"
    if "support" in lower or "healer" in lower or "priest" in lower:
        return "SUPPORT"
    return "WARRIOR"


def listing_kind(definition: Dict[str, Any]) -> str:
    explicit = definition.get("kind")
    if explicit in {"shard", "relic"}:
        return str(explicit)
    return "shard" if str(definition.get("relic_type") or "").startswith("low_") else "relic"


def current_iso_week_key(now: datetime | None = None) -> str:
    moment = now or datetime.now(timezone.utc)
    iso = moment.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def weekly_special_relic_types(now: datetime | None = None) -> List[str]:
    """Deterministic weekly rotation over the special pool."""
    moment = now or datetime.now(timezone.utc)
    iso = moment.isocalendar()
    offset = (iso.year * 53 + iso.week) % len(WEEKLY_SPECIAL_POOL)
    selected: List[str] = []
    for step in range(WEEKLY_SPECIAL_COUNT):
        relic_type = WEEKLY_SPECIAL_POOL[(offset + step) % len(WEEKLY_SPECIAL_POOL)]
        if relic_type not in selected and relic_type not in STOCK_RELIC_TYPES:
            selected.append(relic_type)
    # Fill if pool collisions with stock shelf.
    cursor = offset + WEEKLY_SPECIAL_COUNT
    while len(selected) < WEEKLY_SPECIAL_COUNT and cursor < offset + len(WEEKLY_SPECIAL_POOL) * 2:
        relic_type = WEEKLY_SPECIAL_POOL[cursor % len(WEEKLY_SPECIAL_POOL)]
        cursor += 1
        if relic_type not in selected and relic_type not in STOCK_RELIC_TYPES:
            selected.append(relic_type)
    return selected


def purchasable_relic_types(now: datetime | None = None) -> set[str]:
    return set(STOCK_RELIC_TYPES) | set(weekly_special_relic_types(now))


def resolve_purchase_window(definition: Dict[str, Any], now: datetime | None = None) -> str | None:
    """Return purchase window tag, or None if not buyable from the shop."""
    kind = listing_kind(definition)
    relic_type = str(definition.get("relic_type") or "")
    if kind == "shard":
        return "open"
    if relic_type in STOCK_RELIC_TYPES:
        return "stock"
    if relic_type in weekly_special_relic_types(now):
        return "weekly"
    return None


def is_market_purchasable(relic_type: str, catalog: Sequence[Dict[str, Any]], now: datetime | None = None) -> bool:
    for definition in catalog:
        if str(definition.get("relic_type")) == relic_type:
            return resolve_purchase_window(definition, now) is not None
    return False


def build_relic_market_listing(
    definition: Dict[str, Any],
    index: int,
    owned_amount: int = 0,
    now: datetime | None = None,
) -> Dict[str, Any]:
    tier = str(definition.get("tier") or "common")
    is_limited = bool(definition.get("is_limited"))
    kind = listing_kind(definition)
    purchase_window = resolve_purchase_window(definition, now)
    purchasable = purchase_window is not None

    tier_price = int(TIER_BASE_PRICE.get(tier, TIER_BASE_PRICE["common"]))
    demand_scalar = 1.55 if is_limited else 1.24 if tier == "epic" else 1.08 if tier == "rare" else 1.0
    ask_price = round(tier_price * demand_scalar + index * 17)
    spread = max(18, round(ask_price * (0.16 if is_limited else 0.12 if tier == "epic" else 0.11)))
    bid_price = max(1, ask_price - spread)

    if purchase_window == "weekly" or is_limited:
        market_depth = 1
        trend = "hot"
        settlement = "Weekly window · limited stock"
    elif purchase_window == "stock":
        market_depth = 4 + (index % 2)
        trend = "firm"
        settlement = "Always in stock"
    elif kind == "shard":
        market_depth = 12 + (index % 5)
        trend = "soft" if index % 3 == 0 else "firm"
        settlement = "Instant settlement"
    elif tier == "legendary":
        market_depth = 2
        trend = "firm"
        settlement = "Not currently listed"
    elif tier == "epic":
        market_depth = 4 + (index % 2)
        trend = "firm"
        settlement = "Not currently listed"
    elif tier == "rare":
        market_depth = 8 + (index % 3)
        trend = "firm"
        settlement = "Not currently listed"
    else:
        market_depth = 12 + (index % 5)
        trend = "soft" if index % 3 == 0 else "firm"
        settlement = "Not currently listed"

    return {
        "relic_type": definition.get("relic_type"),
        "display_name": definition.get("display_name"),
        "family": definition.get("family"),
        "kind": kind,
        "tier": tier,
        "rarity": "mythic" if tier in {"legendary", "limited"} else tier,
        "category": infer_relic_category(definition),
        "icon_path": build_relic_icon_path(str(definition.get("display_name") or "")),
        "lore_summary": definition.get("lore_summary"),
        "effect_profile": definition.get("effect_profile"),
        "forge_bias": definition.get("forge_bias"),
        "battle_bias": definition.get("battle_bias"),
        "is_limited": is_limited,
        "purchasable": purchasable,
        "purchase_window": purchase_window,
        "ask_price": int(ask_price),
        "bid_price": int(bid_price),
        "spread": int(spread),
        "market_depth": int(market_depth),
        "owned_amount": max(0, int(owned_amount)),
        "trend": trend,
        "settlement": settlement,
    }


def relic_market_quote(relic_type: str, catalog: List[Dict[str, Any]], now: datetime | None = None) -> Dict[str, Any]:
    for index, definition in enumerate(catalog):
        if str(definition.get("relic_type")) == relic_type:
            return build_relic_market_listing(definition, index, 0, now=now)
    raise ValueError("Unknown relic type")


def build_broker_offer(row: Dict[str, Any], index: int) -> Dict[str, Any]:
    """Legacy helper kept for compatibility; market no longer sells cards."""
    hero_payload = row.get("hero_payload") or {}
    source_payload = row.get("source_payload") or {}
    state = hero_payload.get("state") or {}
    skill = hero_payload.get("skill") or {}
    bp = max(0, int(float(hero_payload.get("BP") or 0)))
    rarity = rarity_from_bp(bp)
    ask_price = round(bp * (0.61 if rarity == "mythic" else 0.54 if rarity == "epic" else 0.46) + 220 + index * 35)

    return {
        "id": str(row.get("id") or ""),
        "name": str(hero_payload.get("name") or "Unnamed"),
        "image_url": source_payload.get("image_url"),
        "rarity": rarity,
        "ask_price": int(ask_price),
        "bp": int(bp),
        "type_label": normalize_offer_type(str(state.get("TYPE") or "")),
        "title": str(state.get("TYPE") or ""),
        "primary_skill": str((skill.get("s1") or {}).get("name") or "Unbound Skill"),
        "secondary_skill": str((skill.get("s2") or {}).get("name") or "Unbound Skill"),
    }


def build_market_order_tape(transactions: Sequence[Dict[str, Any]], listings: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    market_transactions = [
        row for row in transactions if row.get("reason") in {"market_buy_relic", "market_sell_relic"}
    ][:6]
    if market_transactions:
        feed = []
        for row in market_transactions:
            metadata = row.get("metadata") or {}
            quantity = int(metadata.get("quantity") or abs(int(row.get("delta") or 0)))
            total_price = abs(int(metadata.get("total_price") or 0))
            feed.append(
                {
                    "id": str(row.get("id") or ""),
                    "label": str(metadata.get("relic_type") or row.get("resource_key") or "Relic"),
                    "action": "Bought from market" if row.get("reason") == "market_buy_relic" else "Sold to market",
                    "note": f"{quantity} unit / dust {total_price}",
                }
            )
        return feed

    feed = []
    for index, listing in enumerate(listings[:6]):
        feed.append(
            {
                "id": str(listing.get("relic_type") or index),
                "label": f"{listing.get('display_name')} / {listing.get('family')}",
                "action": "Bid stack forming" if index % 2 == 0 else "Offer stack refreshed",
                "note": (
                    f"Buy wall {listing.get('bid_price')}"
                    if index % 2 == 0
                    else f"Ask {listing.get('ask_price')} / depth {listing.get('market_depth')}"
                ),
            }
        )
    return feed


def build_market_board_snapshot(
    catalog: Sequence[Dict[str, Any]],
    owned_amounts: Dict[str, int],
    transactions: Sequence[Dict[str, Any]],
    hero_rows: Sequence[Dict[str, Any]] | None = None,
    now: datetime | None = None,
) -> Dict[str, Any]:
    del hero_rows  # Card brokerage removed from market.
    moment = now or datetime.now(timezone.utc)
    week_key = current_iso_week_key(moment)
    weekly_types = set(weekly_special_relic_types(moment))

    all_listings = [
        build_relic_market_listing(
            definition,
            index,
            int(owned_amounts.get(str(definition.get("relic_type")), 0)),
            now=moment,
        )
        for index, definition in enumerate(catalog)
    ]

    shard_listings = [row for row in all_listings if row.get("kind") == "shard"]
    shard_listings.sort(key=lambda item: int(item["ask_price"]))

    # Relic shop only shows stock shelf + weekly specials (purchasable equipment).
    relic_listings = [
        row
        for row in all_listings
        if row.get("kind") == "relic" and bool(row.get("purchasable"))
    ]
    relic_listings.sort(
        key=lambda item: (0 if item.get("purchase_window") == "weekly" else 1, -int(item["ask_price"]))
    )

    featured_relics = [row for row in relic_listings if row.get("purchase_window") == "weekly"]
    tape_source = shard_listings + relic_listings

    return {
        "generated_at": moment.isoformat(),
        "week_key": week_key,
        "shard_listings": shard_listings,
        # Backward-compatible alias: previously mixed; now equipment shop only.
        "relic_listings": relic_listings,
        "featured_relics": featured_relics,
        "weekly_special_types": sorted(weekly_types),
        "stock_relic_types": list(STOCK_RELIC_TYPES),
        "broker_offers": [],
        "order_tape": build_market_order_tape(transactions, tape_source),
        "notes": [
            "Shards are always available and settle instantly in dust.",
            "Equipment relics are limited to a small stock shelf plus weekly specials.",
            "Cards cannot be bought or sold on the market.",
            f"Weekly special window: {week_key}.",
        ],
    }
