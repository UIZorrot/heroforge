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


def build_relic_market_listing(definition: Dict[str, Any], index: int, owned_amount: int = 0) -> Dict[str, Any]:
    tier = str(definition.get("tier") or "common")
    is_limited = bool(definition.get("is_limited"))
    tier_price = int(TIER_BASE_PRICE.get(tier, TIER_BASE_PRICE["common"]))
    demand_scalar = 1.55 if is_limited else 1.24 if tier == "epic" else 1.08 if tier == "rare" else 1.0
    ask_price = round(tier_price * demand_scalar + index * 17)
    spread = max(18, round(ask_price * (0.16 if is_limited else 0.12 if tier == "epic" else 0.11)))
    bid_price = max(1, ask_price - spread)

    if is_limited:
        market_depth = 1
        trend = "hot"
        settlement = "Escrow window 12h"
    elif tier == "legendary":
        market_depth = 2
        trend = "firm"
        settlement = "Broker release 4h"
    elif tier == "epic":
        market_depth = 4 + (index % 2)
        trend = "firm"
        settlement = "Broker release 4h"
    elif tier == "rare":
        market_depth = 8 + (index % 3)
        trend = "firm"
        settlement = "Instant settlement"
    else:
        market_depth = 12 + (index % 5)
        trend = "soft" if index % 3 == 0 else "firm"
        settlement = "Instant settlement"

    return {
        "relic_type": definition.get("relic_type"),
        "display_name": definition.get("display_name"),
        "family": definition.get("family"),
        "tier": tier,
        "rarity": "mythic" if tier in {"legendary", "limited"} else tier,
        "category": infer_relic_category(definition),
        "icon_path": build_relic_icon_path(str(definition.get("display_name") or "")),
        "lore_summary": definition.get("lore_summary"),
        "effect_profile": definition.get("effect_profile"),
        "forge_bias": definition.get("forge_bias"),
        "battle_bias": definition.get("battle_bias"),
        "is_limited": is_limited,
        "ask_price": int(ask_price),
        "bid_price": int(bid_price),
        "spread": int(spread),
        "market_depth": int(market_depth),
        "owned_amount": max(0, int(owned_amount)),
        "trend": trend,
        "settlement": settlement,
    }


def relic_market_quote(relic_type: str, catalog: List[Dict[str, Any]]) -> Dict[str, Any]:
    for index, definition in enumerate(catalog):
        if str(definition.get("relic_type")) == relic_type:
            return build_relic_market_listing(definition, index, 0)
    raise ValueError("Unknown relic type")


def build_broker_offer(row: Dict[str, Any], index: int) -> Dict[str, Any]:
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
    hero_rows: Sequence[Dict[str, Any]],
) -> Dict[str, Any]:
    relic_listings = [
        build_relic_market_listing(definition, index, int(owned_amounts.get(str(definition.get("relic_type")), 0)))
        for index, definition in enumerate(catalog)
    ]
    relic_listings.sort(key=lambda item: int(item["ask_price"]), reverse=True)
    featured_relics = [
        row for row in relic_listings if bool(row.get("is_limited")) or str(row.get("rarity")) == "mythic"
    ][:3]

    sorted_heroes = sorted(
        hero_rows,
        key=lambda row: max(0, int(float((row.get("hero_payload") or {}).get("BP") or 0))),
        reverse=True,
    )
    broker_offers = [build_broker_offer(row, index) for index, row in enumerate(sorted_heroes[:5])]

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "relic_listings": relic_listings,
        "featured_relics": featured_relics,
        "broker_offers": broker_offers,
        "order_tape": build_market_order_tape(transactions, relic_listings),
        "notes": [
            "Relic exchange settles directly against your internal dust balance.",
            "Card brokerage stays read-only until ownership transfer and listing rules are formalized.",
            "Equipped relic references are cosmetic right now, so only actual relic inventory counts can be traded.",
        ],
    }
