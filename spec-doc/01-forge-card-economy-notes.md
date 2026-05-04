# Forge, Card, Relic, and Dust Economy Notes

> Status: Draft notes v0.1
> Date: 2026-05-04
> Scope: Current design considerations for card generation, card presentation, relic influence, card death, revival, decomposition, and economy loops.

## 1. Purpose

This document records the current design discussion around Hero Forge's card system and economy. It is a working design note, not a final implementation plan.

The goal is to preserve the current assumptions before they are turned into full specs for:

- Forge generation rules.
- Card visual design.
- Relic acquisition and trading.
- Dust economy.
- PvE and PvP death handling.
- Card revival and decomposition.

## 2. Card Generation Paradigm

The current generation model is strong because it separates:

- LLM stage: identity, theme, archetype, role flavor, skill intent.
- Rule stage: final stats, skill numbers, battle constraints, economy impact.

This should remain the foundation.

However, the generation paradigm still needs richer fantasy archetypes. The product should avoid exposing generic functional roles such as "frontliner", "burst", "control", "healer", or "support" as the main player-facing classification. Those are useful internal tags, but they feel too mechanical for a fantasy card battler.

## 3. Player-Facing Archetypes

Card identity should use fantasy-colored archetypes.

Initial player-facing archetype candidates:

- Warrior: melee combat, armor, pressure, physical skills.
- Knight: defense, guard, formation protection.
- Paladin: protection, blessing, recovery, light-based power.
- Berserker: high damage, risk, low defense, self-damage or rage.
- Mage: spell damage, area effects, elemental control.
- Sorcerer: unstable magic, curses, burst, rare effects.
- Assassin: single-target elimination, evasion, back-row threat.
- Rogue: speed, evasion, disruption, opportunistic attacks.
- Ranger: ranged attacks, accuracy, lane pressure.
- Gunner: firearms, burst shots, armor penetration, back-line damage.
- Cleric: healing, blessing, cleansing, anti-curse tools.
- Necromancer: summons, drain, death interaction, curse.
- Summoner: creates temporary units, tokens, or battlefield pressure.
- Guardian: high durability, taunt, ally protection.
- Alchemist: relic interaction, poison, transformation, utility.

These archetypes can map internally to battle functions:

- defense,
- burst,
- control,
- healing,
- summon,
- damage over time,
- buff,
- debuff,
- ranged pressure,
- formation protection.

The player sees the fantasy archetype. The system uses hidden functional tags for balance and battle logic.

## 4. Card Face Design

Cards should be visually desirable game assets, not only stat panels.

Each card should include:

- Hero name.
- Hero artwork or original forged image.
- Rarity.
- Battle Power.
- Archetype.
- Element or damage type.
- Formation preference.
- HP, ATK, DEF, SPEED as primary visible stats.
- Secondary stats in expanded view.
- Two primary skills.
- Relic infusion markers.
- Life state: alive, PvE injured, PvP dead, revival required.
- Source marker: image-forged, relic-forged, event-forged, limited-forged.
- Mode eligibility: Chronicle ready, Arena ready, ladder eligible, revival required.

Card visuals should support status changes:

- Alive: normal full-color card.
- PvE injured: cracked or dimmed treatment, still owned and recoverable.
- PvP dead: stronger dead-state treatment, requires Dust revival before PvP use.
- Relic infused: visible relic symbol, border accent, or surface pattern.
- Flash card: special foil or animated treatment.

## 5. Flash Card Mechanism

Relic forging can produce flash cards.

This is inspired by common premium-card patterns in games such as Hearthstone and Gwent, where a card can have a visually special version without necessarily changing its core gameplay identity.

Initial direction:

- A card forged with relics has a chance to become a flash card.
- Higher-tier or rarer relics can increase flash probability.
- Limited relics can create limited flash treatments.
- Flash should primarily be visual prestige, not raw power.
- Flash status should be persistent and visible in Vault, Arena, and card detail views.

Possible flash visual treatments:

- animated border,
- moving foil texture,
- relic-colored glow,
- alternate frame,
- special forge stamp,
- limited edition marker.

Open balance question:

- Flash cards may eventually have small economy bonuses, such as higher decomposition Dust return or higher marketplace desirability, but they should not directly break combat balance.

## 6. Relic Acquisition

Relics should be one of the main reasons to play PvE.

Primary acquisition sources:

- Chronicle floor rewards.
- Chronicle elite encounters.
- Chronicle boss clears.
- High-risk maze nodes.
- Seasonal ladder rewards.
- Limited shop sales.
- Special events.
- Player-to-player trading.

PvP should also create Dust rewards through winner-takes-all pool settlement, and it can grant some low-tier relics.

PvP reward direction:

- Arena entry costs 30 Dust per player and forms a match pool.
- Winning grants the Dust pool.
- Losing grants no Dust in the first MVP.
- Tie refunds each player's own 30 Dust entry.
- Low-tier relics can drop from PvP, especially as daily, weekly, or ladder rewards.
- PvP should not be the best source of rare relics at the start, because Chronicle needs a strong identity as the main relic source.

## 7. Relic Effects on Card Generation

Relics should influence card generation direction, not directly add raw stats.

Relics can affect:

- archetype probability,
- element probability,
- skill pool,
- visual style,
- flash card chance,
- rarity probability,
- special tags,
- limited frame or edition marker.

Example directions:

- Fire relic: increases chance of Mage, Berserker, Gunner, burn effects, damage over time, red-gold visual effects.
- Frost relic: increases chance of Knight, Guardian, Mage, slow effects, defensive skills, blue-white visual effects.
- Light relic: increases chance of Paladin, Cleric, Guardian, blessing, healing, protection, radiant visual effects.
- Void relic: increases chance of Sorcerer, Assassin, Necromancer, curse, penetration, disruption, dark visual effects.
- Storm relic: increases chance of Ranger, Gunner, Rogue, speed, accuracy, multi-hit, lightning visual effects.
- Beast relic: increases chance of Warrior, Berserker, Ranger, HP, bleed, physical pressure, primal visual effects.

The rule should be:

> Relics shape what kind of card is born. They should not simply make every card stronger.

## 8. Relic Trading and Monetization

Relics can be player-tradable.

Design implications:

- Relics become a player economy asset.
- Scarcity and edition history matter.
- Limited relic sales can create events and monetization beats.
- Relic provenance should be trackable.
- The system needs guardrails against abuse and duplication.

Dust should not be freely tradable.

Dust direction:

- Dust is account-bound.
- Dust can be earned through gameplay.
- Dust can be obtained through card decomposition.
- Dust can be purchased from the operator.
- Dust is used for forging, revival, repair, entry costs, and other account actions.

This creates a controlled hard currency or soft-premium currency loop, while relics provide a tradable collectible layer.

## 9. Card Creation and Dust

Forging a new card should require Dust.

Dust cost gives card creation weight and prevents unlimited rerolling.

Initial principles:

- Every new forge consumes Dust.
- Default new-card forge cost: 100 Dust.
- Relic-assisted forging may consume both Dust and relics.
- Failed forge attempts should either refund Dust or produce a traceable failed-generation record with an explicit refund rule.
- Premium or limited forge events may require special relics or higher Dust costs.

## 10. Card Decomposition

Players should be able to decompose unwanted cards to recover Dust.

Design goals:

- Clean up useless cards.
- Reduce frustration from bad generation results.
- Create a recycling path back into Forge.
- Give low-value cards a purpose.

Initial decomposition factors:

- card rarity,
- Battle Power band,
- flash status,
- relic infusion,
- limited edition status,
- card age or source,
- whether the card is currently dead, locked, listed for trade, or in a party.

Suggested rule direction:

- Normal cards return a portion of their forge cost.
- Higher-rarity cards return more Dust.
- Flash cards return more Dust or require confirmation before decomposition.
- Relic-infused cards may return Dust but usually should not return the original relic unless a special extraction feature exists.

## 11. Death, Injury, and Revival

PvE and PvP death should be handled separately.

This is important because the emotional and economic meaning of death differs by mode.

### 11.1 PvE Death

PvE death should be run-scoped or light-persistent.

Initial direction:

- A hero defeated in Chronicle cannot continue in the current run unless revived by a run event, shrine, item, or special relic.
- After the run ends, PvE defeat may become an injury or fatigue state.
- PvE injury can recover naturally, through a small Dust payment, or through a Chronicle rest node.
- PvE death should not hard-lock a card from all game modes by default.

PvE should feel risky, but it should not punish experimentation as heavily as PvP.

### 11.2 PvP Death

PvP death should have stronger economic meaning.

Initial direction:

- A card that reaches 0 HP in formal PvP enters a PvP dead state, regardless of whether its team wins or loses.
- A PvP dead card cannot enter PvP again until revived.
- Revival costs Dust.
- PvP dead state should be visible on the card face and in Vault.
- PvP death should be tracked separately from PvE injury.

This makes Arena participation meaningful and creates a Dust sink.

### 11.3 Revival

Revival should be clear and predictable.

Potential revival rules:

- Arena MVP uses a fixed revival cost of 200 Dust.
- Later versions may scale revival cost by card BP, rarity, flash status, or card level.
- Flash cards may cost more to revive or may have cosmetic-only revival effects.
- Reviving a relic-infused card does not consume the relic again.
- Some relics or PvE rewards may discount revival.
- Revival should always create a transaction record.

## 12. Economy Loop

Current intended loop:

```text
Forge consumes Dust -> player receives a new card
PvE consumes entry cost -> player can earn Dust and relics
Relics influence Forge -> player can create more directed or flash cards
PvP consumes risk -> dead cards require Dust revival
Arena consumes 30 Dust entry -> winner takes the Dust pool, tie refunds entries
PvP can reward low-tier relics at a small chance
Unwanted cards decompose -> player recovers Dust
Daily sign-in and daily tasks provide reliable Dust income
Dust can also be purchased -> operator controls primary currency supply
Relics can be traded -> players create a secondary collectible market
Limited relics are sold periodically -> events and monetization beats
```

This loop gives every system a role:

- Forge creates demand for Dust and relics.
- PvE supplies Dust and relics.
- PvP consumes Dust through entry and death, then returns the entry pool to the winner.
- Decomposition recycles unwanted cards.
- Daily activity systems keep players from being stuck without Dust.
- Trading gives relics market value.
- Limited relic sales create live-ops moments.

## 13. Activity and Retention Dust Sources

The Dust economy needs reliable low-friction sources because Forge, Arena entry, and revival all consume Dust.

Initial activity sources:

- Daily sign-in grants Dust.
- Daily tasks grant Dust.
- PvP winner receives the Arena Dust pool.
- PvP winner has a small chance to receive a low-tier relic.
- PvE later becomes the main source of Dust and relics.

Example daily tasks:

- Forge one card.
- Enter Arena once.
- Win one Arena match.
- Decompose one card.
- Revive one card.
- Claim daily sign-in.

Daily rewards should be enough to keep a player active, but not enough to remove the value of PvE, decomposition, PvP wins, or Dust purchase.

## 14. Open Design Questions

These need later decisions:

- Should future PvP death stay as every 0 HP card, or become less punishing after playtesting?
- Should future PvP revival cost scale by BP, rarity, card level, or all three?
- Should PvE injury have a timer, a Dust cost, or both?
- Should relics be consumed on forge, attached to the card, or both depending on relic type?
- Should flash card chance be public or hidden?
- Should player-traded relics have transaction fees?
- Should Dust purchase be exposed early, or only after core gameplay feels stable?
- Should decomposed flash cards return more Dust, a shard, or a special cosmetic currency?

## 15. Next Conversion to Formal Specs

This note should later be split into formal specs:

- Forge generation spec.
- Card face and Vault UX spec.
- Relic acquisition and trading spec.
- Dust economy and monetization spec.
- Death, injury, revival, and decomposition spec.

For now, it records the current shared assumptions so future design work has a stable base.
