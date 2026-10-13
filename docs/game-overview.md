# Hero Forge Game Overview

Current executable combat rules and planned gaps are tracked in [battle-feature-contract.md](battle-feature-contract.md); ongoing changes are recorded in [CHANGELOG.md](../CHANGELOG.md). Relic/enchantment combat bonuses and the Chronicle campaign are still planned features, even though inventory and lifecycle APIs already exist.

## One-line pitch

Hero Forge is a dark tactical hero-card battler where users forge heroes from images, tune builds through a rule-based numeric engine, test them in a sandbox train mode, and fight ranked PvP matches with dust stakes.

## Core fantasy

The player is not just collecting cards. They are running a command console for a living battle archive:

- turn an image into a hero
- shape the build through templates and stat bias
- test strength in a private training ground
- enter a formal PvP arena with matchmaking constraints
- spend dust and relics to sustain the progression loop

## Main game loop

1. Upload an image to Forge.
2. The LLM writes the hero concept, name, description, template, and skill structure.
3. A non-AI numeric generator turns that structure into final stats.
4. The hero is saved into the vault.
5. The player tests the hero in Train, either 1v1 or 4v4.
6. The player enters Arena for formal PvP matchmaking.
7. Dust is spent on creation, repair, and PvP participation; the first PvE campaign draft proposes free entry.
8. Relics are the only item type. They can be equipped for battle and consumed separately to enchant an existing card.

## Game modes

### Forge

The hero creation mode.

- image input
- AI-assisted hero concepting
- rule-based final stat generation
- persistent hero storage
- no relic selection during generation; relic enchantment happens afterward in Relic Chamber

### Train

The sandbox battle mode.

- private experimentation
- 1v1 and 4v4 formats
- no matchmaking pressure
- used to validate builds and compare team compositions

### Arena

The formal PvP mode.

- queue-based matchmaking
- only players within a 10% BP gap can fight
- dust is used as the stake
- winners claim the pool

### PvE

First campaign design: [Void Labyrinth](pve-void-labyrinth-v1.md), currently planned, not playable as a campaign.

- Three fixed challenges for deployed team BP totals of 1000, 5000 and 10000; shared theme, different enemy compositions and boss mechanics. Enemy budgets do not rescale with the entering team.
- Ten visited nodes: six normal encounters, two camps, one elite and one boss; two branch choices reconnect. Draft data defines 30 encounters across the three tiers.
- Phase one proposes free entry/retries, carried HP/MP, durable checkpoints and finite first-clear rewards. Dust entry fees are deferred; no ranked stakes or permanent card death.
- Existing pve_4v6 battle/session support handles up to four players and six enemies. Campaign progression, NPC scripts, intent UI, persistence and rewards still require implementation.

## Economy

The game has two user resources:

- Dust: the universal spendable currency
  - forge cost
  - repair cost
  - PvE entry cost (deferred; phase-one campaign draft is free)
  - PvP stake
- Relics: typed inventory resources
  - collected by type
  - used for future progression systems

Every resource change should be traceable through a transaction ledger.

## Data model philosophy

The backend is built like a real production game service:

- users and sessions for authentication
- heroes for final playable cards
- hero generations for provenance and debugging
- battles and PvP records for history
- resource ledgers for economy safety
- PvE run tables for future progression content

## Visual direction for the landing page

The landing page should feel like a game key art screen, not a SaaS dashboard.

Recommended direction:

- dark ritual-metal palette with gold accents
- large cinematic headline
- three clear action paths: Forge, Train, Arena
- visible economy and progression hooks
- floating hero cards or a hero fan composition
- subtle motion, glow, scanline, and parallax layers

The page should immediately communicate:

- this is a tactical game
- heroes are forged, not merely created
- training is separate from ranked PvP
- dust and relics matter
- the experience is premium and dramatic
