# Hero Forge Master Design

> Status: Draft v0.1
> Date: 2026-05-04
> Scope: Mother document for product, game mode, UX, economy, ranking, and implementation follow-up specs.

## 1. Purpose

Hero Forge is a generative hero battler where a player turns images into persistent hero assets, validates those assets through battle, and spends resources to continue the creation and competition loop.

This document is the root design reference for the next stage. It does not replace detailed mode specs. It defines the shared product direction, gameplay boundaries, terminology, and immediate design priorities so that later PvE, PvP, ladder, UX, and architecture documents do not drift apart.

## 2. Product Positioning

Hero Forge should be treated as a game first and an AI feature second.

The core value is not "generate a character from an image." The core value is:

> Upload an image, forge it into a playable hero, test it, improve your roster, and compete under battle-power constraints.

The product promise has four parts:

- Forge: image input becomes a structured, playable hero.
- Vault: forged heroes become long-term player assets.
- Battle: heroes can be tested and compared through rule-based combat.
- Progression: Dust, relics, PvE, PvP, and ranking give the roster long-term purpose.

## 3. Current Product Foundation

The current codebase already supports a meaningful vertical slice:

- Email-code login and session authentication.
- Image-based hero generation.
- LLM structural generation separated from rule-based numeric generation.
- Persistent hero storage.
- Battle simulation for 1v1 and team formats.
- PvP queue and battle-power matching.
- Dust wallet, relic inventory, and transaction ledger.
- Early PvE run data structures.

This means the next design stage should not restart the project. It should refine and professionalize the existing loop.

## 4. Design Principles

### 4.1 AI Generates Identity, Rules Generate Fairness

The LLM should continue to provide character concept, name, description, archetype, and skill intent. Final stats, skill magnitudes, entry costs, rewards, matchmaking eligibility, and ranking outcomes should be governed by deterministic or auditable game rules.

### 4.2 Every Hero Should Have a Use Case

A forged hero should be more than a collectible card. Each hero should be useful in at least one of these contexts:

- PvE exploration.
- PvP composition.
- Resource farming.
- Ladder specialization.
- Future crafting or fusion systems.

### 4.3 Battle Power Is a Gate, Not the Whole Game

Battle Power should limit unfair matchups and PvE entry bands, but should not fully determine winners. Formation, range, role composition, skill type, status effects, and target priority should matter.

### 4.4 PvE Teaches, PvP Tests

PvE should teach roster building and battle-system literacy. PvP should test optimized rosters against other players under strict fairness constraints.

### 4.5 Economy Must Be Traceable

Every Dust or relic change should have a reason, reference, and visible player-facing explanation. Economy changes must be auditable in backend data and understandable in UI.

## 5. Core Game Loop

The intended main loop is:

1. Player logs in.
2. Player uploads an image and forges a hero.
3. Hero enters Vault as a persistent asset.
4. Player tests heroes in PvE or sandbox battle.
5. Player forms PvP teams under Battle Power limits.
6. Player enters ranked or casual PvP.
7. Player earns or spends Dust, relics, rating, and progression rewards.
8. Player returns to Forge with clearer goals for the next hero.

The next stage should make this loop more explicit in UX. New players should understand why they are forging, what a good hero is, and where to use that hero after creation.

## 6. Mode Map

Hero Forge should organize around five major modes:

- Forge: create heroes from images and optional materials.
- Vault: manage, inspect, compare, and select heroes.
- Chronicle PvE: maze/tower battles against monsters.
- Arena PvP: formation-based player combat.
- Ladder: ranked progression, seasons, rewards, and rating.

The old `Duel` concept should be removed as a primary product mode. Its useful parts can be absorbed into Arena as internal battle resolution or into a future practice tool.

## 7. Chronicle PvE Design Direction

### 7.1 Mode Fantasy

Chronicle is a dungeon-like PvE mode where the player sends a small party into a shifting maze tower. The player does not navigate a full spatial map. Instead, each run is a sequence of floor choices, monster encounters, risk events, and rewards.

This gives the feeling of a maze without requiring a full map system in the first version.

### 7.2 Entry Rules

Initial detailed example:

- Party size: 1 to 3 heroes.
- Total party Battle Power target: around 1000.
- Recommended eligibility band: 900 to 1100 total BP for the first Chronicle tier.
- Entry cost: Dust.
- Run type: tower climb with branching choices, not free-map movement.
- Failure state: run ends when all party members are defeated or the player retreats.
- Reward state: rewards are granted after clearing defined floors or ending at safe checkpoints.

The 1000 BP target should be treated as a tier rule, not a global PvE rule. Later tiers can define higher BP bands.

### 7.3 Run Structure

A Chronicle run should be composed of floors:

- Floor 1: entry encounter.
- Floor 2: choice between two risk profiles.
- Floor 3: elite monster or event.
- Floor 4: rest, shrine, or resource decision.
- Floor 5: boss encounter.

The first implementation can use a 5-floor run. Later versions can expand to 10, 20, or seasonal towers.

### 7.4 Maze Without a Map

The mode should communicate maze traversal through node choices:

- Left Path: safer fight, lower reward.
- Deep Path: harder fight, higher reward.
- Strange Door: event with uncertain outcome.
- Sealed Chamber: requires a relic type or hero role.

This avoids the cost of designing a full tile map while preserving exploration, uncertainty, and route choice.

### 7.5 Monster Design

PvE enemies should be generated from controlled monster templates, not arbitrary LLM output.

Initial monster families:

- Beast: high HP, low control.
- Cultist: buffs and curses.
- Construct: high defense, low speed.
- Wraith: evasion and debuffs.
- Boss: one signature mechanic per tier.

Each monster should have predictable counters so that PvE teaches team-building.

### 7.6 Chronicle Rewards

Rewards should support the broader loop:

- Dust refund or Dust gain for successful clears.
- Relics by type.
- Temporary run modifiers.
- Future crafting materials.
- Ladder-independent achievements.

The early version should avoid permanent stat growth until the balance model is clearer. Materials and relics are safer than direct hero stat upgrades.

## 8. Arena PvP Design Direction

### 8.1 Remove Duel as a Top-Level Mode

The product should stop presenting `Duel` as a main navigation item. PvP should be consolidated under Arena.

The old duel-like behavior can remain internally as:

- battle simulation logic,
- practice-only testing,
- debug tooling,
- or match replay resolution.

### 8.2 Battlefield Layout

Arena should use a 2 by 3 battlefield for each side.

That means each player has six possible positions:

- Front row: three slots.
- Back row: three slots.

The two sides face each other across the battlefield. This creates familiar formation decisions:

- front-line protection,
- back-line ranged damage,
- position-based targeting,
- lane pressure,
- range and distance calculation.

### 8.3 Team Size

Arena allows up to 4 heroes per player.

Rules:

- Minimum team size: 1 hero.
- Maximum team size: 4 heroes.
- Available positions: 6 slots per side.
- Empty slots are allowed.
- The two players do not need similar team sizes.
- A 1-hero team can fight a 4-hero team if total Battle Power stays within the allowed range.

This creates meaningful composition tradeoffs: one powerful hero, two elite heroes, or a wider four-hero lineup.

### 8.4 Match Eligibility

Arena matching should use total team Battle Power.

Initial rule:

- A match can start only if the two teams' total Battle Power difference is within 5%.

Formula:

```text
gap_pct = abs(team_bp_a - team_bp_b) / min(team_bp_a, team_bp_b) * 100
eligible = gap_pct <= 5
```

Using the lower BP as denominator makes the rule stricter and easier to explain: the stronger team cannot exceed the weaker team by more than 5%.

### 8.5 Distance and Targeting

Arena battle should calculate distance from grid position.

Recommended first rule set:

- Melee attacks prefer the closest enemy in the same lane.
- Ranged attacks can target back-row or adjacent-lane enemies with less penalty.
- Support skills prefer allies in the same row or lowest HP ally.
- Area skills can affect a lane, row, or nearby cluster.
- Taunt or guard effects can redirect attacks from back row to front row.

This makes formation more important than raw stats.

### 8.6 PvP Outcomes

Every PvP match should produce:

- winner or tie,
- battle log,
- board state history,
- rating change if ranked,
- Dust stake result if stake mode is active,
- replay-ready event data.

Battle logs are useful, but the product should eventually favor readable replay and board visualization over raw text.

## 9. Ladder Design Direction

### 9.1 Why Ladder Exists

The ladder gives PvP long-term purpose. Without a ladder, Arena is only a match queue. With a ladder, players have identity, goals, season pressure, and reasons to improve rosters.

### 9.2 Ladder Modes

Initial ladder should use one ranked queue:

- Ranked Arena.
- Formation: 2 by 3 per side.
- Team size: 1 to 4 heroes.
- BP gap: within 5%.
- Rating changes only after resolved matches.

Casual Arena can exist later, but the first design should focus on one ranked mode to avoid splitting a small player base.

### 9.3 Rating Model

Use a simple rating model first:

- Each player starts at 1000 rating.
- Win increases rating.
- Loss decreases rating.
- Tie causes small or no change.
- Rating delta is affected by opponent rating difference.

This can later be replaced by Elo, Glicko, or another model. The first version should optimize for clarity and implementation speed.

### 9.4 Rank Tiers

Initial visible tiers:

- Iron: below 900.
- Bronze: 900 to 1099.
- Silver: 1100 to 1299.
- Gold: 1300 to 1499.
- Platinum: 1500 to 1749.
- Mythic: 1750 and above.

The exact names can be refined later to match the game's tone. The important design point is that rating and tier are separate: rating is the number, tier is the player-facing identity.

### 9.5 Seasons

Ladder should be seasonal, but the first implementation can use a single open season.

Season data should eventually include:

- season id,
- start and end time,
- player rating,
- peak rating,
- wins,
- losses,
- ties,
- reward claim state.

### 9.6 Ladder Rewards

Rewards should be mostly cosmetic or resource-based at first:

- Dust payout by tier.
- Relic bundles.
- profile badges.
- season titles.

Avoid direct permanent combat power rewards from ladder until balance, anti-abuse, and matchmaking are stronger.

## 10. UX Direction

### 10.1 First-Time Player Flow

The first-time flow should answer:

- What is this game?
- What do I upload?
- What did I get?
- Where do I use this hero?
- Why should I forge again?

Recommended flow:

1. Login.
2. Forge first hero.
3. Show hero result with stats and role explanation.
4. Offer one clear next action: enter Chronicle beginner tier.
5. After first PvE clear, unlock or recommend Arena.

PvE should be the tutorial bridge between Forge and PvP.

### 10.2 Navigation

Primary navigation should be:

- Forge.
- Vault.
- Chronicle.
- Arena.
- Ladder.
- Profile.

Avoid presenting both `Duel` and `Arena`. The distinction is unclear to users and weakens the product map.

### 10.3 Mode Screens

Each mode screen should start with the playable surface, not marketing copy.

- Forge screen: upload, material choice, current Dust, generated result.
- Vault screen: roster, filters, comparison, action dispatch.
- Chronicle screen: party selection, BP tier, floor path, encounter result.
- Arena screen: formation board, team BP, matchmaking eligibility, queue state.
- Ladder screen: rank, rating, season record, recent matches, rewards.

## 11. Economy Direction

### 11.1 Dust

Dust remains the universal spendable resource.

Current uses:

- Forge cost.
- repair cost.
- PvE entry cost.
- PvP entry or stake.
- PvP revival.

Current MVP cost anchors:

- Forge a new card: 100 Dust.
- Enter Arena queue: 30 Dust.
- Revive a PvP-dead card: 200 Dust.

Future uses:

- Chronicle reroll.
- safe retreat fee.
- seasonal ladder entry variants.
- crafting support.

### 11.2 Relics

Relics should become typed progression resources.

Early safe uses:

- unlock Chronicle paths,
- influence Forge style,
- purchase PvE run modifiers,
- exchange for cosmetics or non-power rewards.

Avoid making relics direct stat-upgrade currency in the near term.

### 11.3 Stake PvP

Arena MVP uses Dust entry and winner-takes-all settlement. Each player pays 30 Dust, and the winner receives the 60 Dust pool when the match resolves. If the match is a tie, both players receive their own 30 Dust entry refund.

Ranked ladder should still not depend entirely on stake. A player should be able to care about rank even when Dust rewards are small.

Recommended split:

- Ranked Arena: rating-focused, moderate Dust interaction, winner-takes-all Dust pool in MVP.
- Stake Arena: higher-risk future mode.

Daily sign-in and daily tasks should provide reliable Dust income so players can recover from Forge, entry, and revival costs without being forced into purchase immediately.

## 12. Data and Architecture Implications

This document is not an implementation plan, but several architecture implications are already clear:

- PvE needs run, floor, encounter, monster, reward, and party state.
- Arena needs explicit formation positions, not only hero arrays.
- PvP matchmaking needs 5% BP eligibility instead of the current broader tolerance.
- Ladder needs player rating, season records, match history, and reward state.
- Battle results should preserve board history for replay and debugging.
- Economy changes must continue using transaction records.

The next implementation plan should modify data models only after mode specs define exact fields and lifecycle states.

## 13. Documentation Structure

All new design documents should live in `spec-doc`.

Recommended document set:

- `00-hero-forge-master-design.md`: this mother document.
- `01-forge-card-economy-notes.md`: current Forge, card, relic, Dust, death, revival, and decomposition notes.
- `02-web-product-function-design.md`: detailed web product design for frontend and backend functions.
- `03-core-card-battle-arena-mvp-design.md`: first playable Arena MVP, including card state, 2 by 3 battle, PvP matching, death, and revival.
- `04-chronicle-pve-design.md`: detailed maze tower PvE mode.
- `05-arena-pvp-full-design.md`: full Arena PvP design after MVP rules are validated.
- `06-ladder-season-design.md`: rating, tiers, seasons, and rewards.
- `07-economy-progression-design.md`: Dust, relics, rewards, and sinks.
- `08-ux-information-architecture.md`: navigation, onboarding, mode screens.
- `09-technical-implementation-plan.md`: engineering plan after design approval.

## 14. Immediate Next Design Work

The next detailed mode document after Arena MVP should be `04-chronicle-pve-design.md`.

Reason:

- PvE can teach the game before exposing players to PvP pressure.
- Chronicle already has backend data structure beginnings.
- The 3-hero, around-1000-BP maze tower is concrete enough to become a complete mode spec.
- A good PvE spec will also clarify monster templates, reward types, and battle readability.

However, Arena MVP has higher immediate product priority than Chronicle because it provides the first real player-versus-player mode. The MVP Arena document should be used before full Chronicle work begins.

## 15. Open Decisions for Future Discussion

These are design questions that should be answered in child documents, not in this mother document:

- Exact Chronicle floor count for version 1.
- Whether Chronicle parties can change heroes mid-run.
- Whether Chronicle failure consumes full entry cost or grants partial refund.
- Exact monster templates and boss mechanics.
- Exact Arena grid coordinate system.
- Whether Arena has manual positioning or auto-placement suggestions.
- Whether ranked PvP includes Dust stake by default.
- Exact ladder rating formula.
- Exact season reset behavior.

## 16. Version 1 Design Target

The next major product version should aim for:

- A beginner Chronicle PvE mode with 1 to 3 heroes and a 900 to 1100 BP entry band.
- Arena PvP using a 2 by 3 formation field per side.
- PvP matchmaking based on total team BP within 5%.
- Removal of Duel as a top-level navigation mode.
- A basic ranked ladder with rating, tiers, and match records.
- UX that guides new players from Forge to Chronicle before serious PvP.

This target keeps the product coherent: Forge creates heroes, Chronicle teaches them, Arena tests them, Ladder gives them long-term meaning.
