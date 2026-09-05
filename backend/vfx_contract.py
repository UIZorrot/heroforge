from __future__ import annotations

from typing import Any


CANONICAL_PROJECTILE_TYPE_EFFECTS = (
    "blood",
    "fire",
    "frost",
    "holy",
    "magic",
    "nature",
    "arrow",
    "lighting",
    "void",
    "water",
    "bullet",
    "rock",
)

PROJECTILE_TYPE_EFFECTS = frozenset(CANONICAL_PROJECTILE_TYPE_EFFECTS)

# Must match frontend canonicalBattleInstantTypeEffects (battleVfxCatalog.ts).
CANONICAL_INSTANT_TYPE_EFFECTS = (
    "magic",
    "thunder",
    "strike",
    "explode",
    "fire",
    "poison",
    "frost",
    "dark",
    "light",
    "nature",
    "water",
    "claw",
    "pierce",
    "blunt",
    "bullet_hit",
)

# Must match frontend canonicalBattleBuffTypeEffects (battleVfxCatalog.ts).
CANONICAL_BUFF_NAMES = (
    "stun",
    "frozen",
    "poison",
    "wound",
    "burn",
    "curse",
    "heal",
    "pray",
)

PROJECTILE_TYPE_EFFECT_ALIASES = {
    "blood": "blood",
    "flesh": "blood",
    "bleed": "blood",
    "hemomancy": "blood",
    "fire": "fire",
    "flame": "fire",
    "burn": "fire",
    "ember": "fire",
    "frost": "frost",
    "freeze": "frost",
    "frozen": "frost",
    "ice": "frost",
    "holy": "holy",
    "light": "holy",
    "radiant": "holy",
    "magic": "magic",
    "arcane": "magic",
    "spell": "magic",
    "nature": "nature",
    "poison": "nature",
    "venom": "nature",
    "thorn": "nature",
    "root": "nature",
    "arrow": "arrow",
    "weapon": "arrow",
    "bow": "arrow",
    "lighting": "lighting",
    "lightning": "lighting",
    "thunder": "lighting",
    "storm": "lighting",
    "shock": "lighting",
    "void": "void",
    "dark": "void",
    "shadow": "void",
    "water": "water",
    "tide": "water",
    "wave": "water",
    "bullet": "bullet",
    "gun": "bullet",
    "gunsmoke": "bullet",
    "shot": "bullet",
    "rock": "rock",
    "stone": "rock",
    "earth": "rock",
}


def visual_token(value: Any, fallback: str = "") -> str:
    text = str(value if value is not None else fallback).strip().lower().replace(" ", "_").replace("-", "_")
    return text or fallback


def normalize_projectile_type_effect(value: Any, fallback: Any = "magic") -> str:
    token = visual_token(value, visual_token(fallback, "magic"))
    if token in PROJECTILE_TYPE_EFFECTS:
        return token
    if token in PROJECTILE_TYPE_EFFECT_ALIASES:
        return PROJECTILE_TYPE_EFFECT_ALIASES[token]

    words = tuple(part for part in token.split("_") if part)
    for word in words:
        canonical = PROJECTILE_TYPE_EFFECT_ALIASES.get(word)
        if canonical:
            return canonical

    fallback_token = visual_token(fallback, "magic")
    if fallback_token != token:
        return normalize_projectile_type_effect(fallback_token, "magic")
    return "magic"
