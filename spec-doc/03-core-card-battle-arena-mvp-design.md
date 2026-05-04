# Core Card, Battle, and Arena PvP MVP Design

> Status: Draft v0.1
> Date: 2026-05-04
> Scope: Minimum viable product design for card assets, battle rules, and the first playable Arena PvP mode.

## 1. Purpose

This document defines the first playable PvP target for Hero Forge.

The product should not wait for Chronicle, full economy depth, ladder seasons, or relic trading before it has a real game mode. Arena PvP should become the first mode that proves the loop:

```text
Forge a card -> build a team -> enter Arena -> fight another player -> receive result -> pay or earn resources -> improve roster
```

This document therefore focuses on three tightly coupled systems:

- Card asset model: what a playable card must contain.
- Battle model: how cards fight on a board.
- Arena PvP MVP: how players form teams, match, resolve fights, and see outcomes.

## 2. Design Priority

Arena PvP is not the lowest-level system, but it has high product priority because it creates an actual multiplayer game loop. Sandbox battle is useful for testing, but it is not enough as a core product experience.

Priority logic:

- Card and battle rules are foundational.
- Arena is the first public proof of play.
- Forge is already functional enough to feed Arena.
- Chronicle is important but lower-coupling and can be layered later.
- Ladder and Market should wait until Arena has stable match rules.

## 3. MVP Scope

### 3.1 In Scope

MVP includes:

- Card fields required for battle.
- Card life state required for PvP use.
- 2 by 3 battlefield per side.
- Up to 4 heroes per player.
- Manual formation placement.
- Total BP matching within 5%.
- Arena Dust entry cost.
- Winner-takes-all Dust settlement.
- Queue, cancel, waiting, matched, resolved states.
- Automated battle resolution.
- Battle result visualization.
- PvP card death state.
- Dust revival requirement.
- Small low-tier relic drop chance.
- Backend persistence for match, participants, board result, and resource transactions.

### 3.2 Out of Scope for MVP

MVP does not include:

- Full ladder seasons.
- Player-to-player relic trading.
- Limited relic shop.
- Full Chronicle PvE.
- Manual combat input.
- Live synchronous PvP.
- Card leveling.
- Relic extraction.
- Complex equipment.
- Guilds, chat, friends, spectator mode.
- Full monetization flow.

These can be designed later after Arena produces real usage feedback.

## 4. Player-Facing Arena Fantasy

Arena is a formal proving ground. The player is not merely testing a generated card. They are deploying a roster into a ranked-feeling battlefield with real consequences.

Player-facing promise:

> Bring up to four forged heroes, place them on a tactical formation board, match against a fair Battle Power opponent, and watch the fight resolve with rewards, losses, and card consequences.

The UI should feel like entering a battle chamber, not submitting a backend job.

## 5. Core Card MVP Model

### 5.1 Required Card Fields

Each playable card must have:

- `id`: unique hero/card id.
- `owner_user_id`: owning player.
- `name`: player-facing hero name.
- `description`: short fantasy identity.
- `source_image`: original or stored image reference.
- `created_at`: forge time.
- `bp`: Battle Power.
- `rarity`: common, rare, epic, mythic, or final names later.
- `archetype`: fantasy class such as Warrior, Mage, Assassin, Gunner.
- `element`: fire, frost, light, void, storm, weapon, gun, nature, water, dark, magic, flesh.
- `stats`: HP, MP, ATK, DEF, SPEED, CC, CA, PI, EV, AC.
- `skills`: two active or passive skills.
- `life_state`: active, pve_injured, pvp_dead.
- `lock_state`: unlocked or locked.
- `visual_state`: normal or flash.
- `relic_infusion`: list of relic influences used during forge.
- `source_type`: image_forge, relic_forge, event_forge, limited_forge.

### 5.2 MVP Card States

MVP needs only a small state set:

- `active`: card can enter all eligible modes.
- `pvp_dead`: card cannot enter Arena until revived.
- `pve_injured`: reserved for later Chronicle, not blocking Arena in MVP unless configured.
- `locked`: cannot be decomposed or traded, but can still fight.
- `in_pvp_queue`: card is reserved in an active Arena entry.

### 5.3 Card Eligibility Rules

A card can enter Arena if:

- owner is current user,
- card is not pvp_dead,
- card is not decomposed,
- card is not already in another active queue,
- card has valid battle stats,
- card has valid skills,
- card is not blocked by admin/system state.

The UI should explain ineligibility directly on the card.

### 5.4 Card Face MVP Requirements

Card face must show:

- name,
- artwork,
- rarity,
- BP,
- archetype,
- element,
- HP / ATK / DEF / SPEED,
- skill names,
- PvP state,
- flash marker,
- selected/placed state.

For MVP, deeper fields can live in the card detail panel.

## 6. Skill MVP Model

Each card has two skills.

Required skill fields:

- `name`
- `description`
- `role`: attack, buff, defense, summon, passive
- `target`: self, ally, enemy
- `target_num`
- `range`: melee, ranged, self, ally, enemy
- `damage`
- `mp_cost`
- `buff_name`
- `buff_time`
- `buff_values`
- `is_passive`
- `is_stun`

MVP can use automated skill selection:

- Skill 1 is primary and used most turns.
- Skill 2 is used on defined rhythm, such as every fourth round, if enough MP exists.
- Passive behavior can be stored but may be ignored in the first MVP if not implemented.

## 7. Battlefield Model

### 7.1 Board Shape

Each player has a 2 by 3 board:

```text
Back Row:  [B1] [B2] [B3]
Front Row: [F1] [F2] [F3]
```

The full battle has two mirrored boards:

```text
Opponent Back:  [OB1] [OB2] [OB3]
Opponent Front: [OF1] [OF2] [OF3]
---------------------------------
Player Front:   [PF1] [PF2] [PF3]
Player Back:    [PB1] [PB2] [PB3]
```

### 7.2 Coordinate Model

Use coordinates:

- `row`: front or back.
- `lane`: 1, 2, or 3.

Backend coordinate examples:

```json
{ "row": "front", "lane": 1 }
{ "row": "back", "lane": 3 }
```

Each team has six available positions but only up to four cards.

### 7.3 Formation Rules

Rules:

- Player may deploy 1 to 4 cards.
- Empty slots are allowed.
- More cards is not always better because BP budget is shared.
- Front row is usually safer for protecting back row but receives attacks first.
- Back row is better for ranged and fragile cards.
- Same lane matters for melee and targeting priority.

### 7.4 Manual Placement

MVP should support manual placement.

Player actions:

- select card from roster,
- click empty board slot,
- card appears in slot,
- click placed card to remove or replace,
- drag-and-drop can come later.

Auto-arrange is useful but can be P1 after MVP.

## 8. Distance and Targeting MVP

### 8.1 Distance Formula

Use simple grid distance:

```text
row_distance = 0 if same row relationship allows direct target, otherwise 1
lane_distance = abs(attacker_lane - target_lane)
distance = row_distance + lane_distance
```

Because opposing boards are mirrored, front-to-front distance is closest.

Recommended base distances:

- front attacker to enemy front same lane: 1
- front attacker to enemy front adjacent lane: 2
- front attacker to enemy back same lane: 2
- back attacker to enemy front same lane: 2
- back attacker to enemy back same lane: 3

Exact formula can be tuned, but the user-facing rule should stay simple:

> Front row reaches front row more easily. Ranged heroes can pressure deeper positions.

### 8.2 Melee Targeting

Melee skills:

- prefer enemy front row,
- prefer same lane,
- then adjacent lane,
- cannot target back row if any living enemy front-row unit blocks the same or adjacent lane, unless skill has penetration.

### 8.3 Ranged Targeting

Ranged skills:

- can target front or back row,
- prefer same lane,
- can hit adjacent lanes,
- may receive accuracy penalty at longer distance.

### 8.4 Support Targeting

Ally skills:

- self-target if target is self,
- otherwise lowest HP ally,
- prefer same row or same lane when tied.

### 8.5 Area Effects

MVP can include limited area effects:

- same lane,
- front row,
- adjacent cluster.

Full complex AoE shape design can wait.

## 9. Battle Resolution MVP

### 9.1 Battle Type

Arena MVP uses automated asynchronous resolution.

Player does not manually control turns. The backend resolves the match once a valid opponent is found.

### 9.2 Turn Order

Turn order:

- living units are ordered by SPEED,
- ties can be randomized,
- stunned units skip their action,
- defeated units do not act.

### 9.3 Round Limit

MVP round limit:

- 30 rounds.

If both teams survive:

- winner is the side with higher remaining total HP ratio,
- if equal, result is tie.

### 9.4 Damage Formula

MVP should preserve the existing formula direction:

- ATK plus skill damage,
- crit chance from CC,
- crit multiplier from CA,
- mitigation from DEF,
- armor penetration from PI,
- hit chance from AC versus EV.

The exact numbers can continue to live in backend battle logic.

### 9.5 Status Effects

MVP status set:

- stun: skips turn.
- wound: damage over time.
- curse: lowers defense.
- weakness: lowers attack.
- bless: increases attack.
- heal: restores HP.
- frozen: lowers accuracy or evasion.
- haste: increases speed or accuracy.

These already align with current backend concepts.

### 9.6 Battle Output

Every Arena battle must return:

- match id,
- winner side,
- winner user id or tie,
- final board state,
- board history,
- event list,
- battle logs,
- final HP/MP,
- dead cards,
- reward result,
- Dust changes,
- replay data.

## 10. Arena Matchmaking MVP

### 10.1 Queue Requirements

Player can enter queue if:

- authenticated,
- selected 1 to 4 cards,
- all selected cards are Arena eligible,
- each card has unique id,
- all selected cards have formation positions,
- total BP is greater than 0,
- player can pay entry or stake cost if required.

### 10.2 BP Matching Rule

Target rule:

```text
gap_pct = abs(team_bp_a - team_bp_b) / min(team_bp_a, team_bp_b) * 100
eligible = gap_pct <= 5
```

This should replace the current 10% tolerance.

### 10.3 Team Size Difference

Team sizes do not need to match.

Valid examples:

- 1 card vs 1 card.
- 1 card vs 4 cards.
- 2 cards vs 3 cards.
- 4 cards vs 4 cards.

Only total BP and validity matter.

### 10.4 Queue States

Queue entry states:

- `waiting`: looking for opponent.
- `matched`: valid opponent found.
- `resolving`: battle is being resolved.
- `resolved`: result is available.
- `cancelled`: player cancelled before match.
- `expired`: no match found within TTL.
- `failed`: backend error occurred and refund logic should run.

Current backend states can be expanded later. MVP UI can still display existing states while backend evolves.

### 10.5 Queue TTL

MVP queue TTL:

- 10 minutes by default.

On expiration:

- queue entry becomes expired,
- stake or entry cost is refunded if it was charged,
- selected cards are released from `in_pvp_queue`.

## 11. Arena Frontend Screen

### 11.1 Screen Zones

Arena screen should contain:

- Formation board.
- Roster selector.
- Team summary.
- BP eligibility panel.
- Match controls.
- Queue status panel.
- Result/replay panel.
- Dead card and revival panel after match.

### 11.2 Formation Board UI

Board shows:

- six slots,
- row labels: Front, Back,
- lane labels: 1, 2, 3,
- placed card mini faces,
- empty slots,
- invalid placement hints.

Slot states:

- empty,
- occupied,
- selected,
- invalid,
- locked while queued,
- dead after match.

### 11.3 Roster Selector UI

Roster selector shows:

- eligible cards first,
- ineligible cards dimmed,
- search,
- filter by archetype,
- filter by element,
- filter by BP,
- filter by life state.

Card click behavior:

- if no slot selected: select card for placement,
- if slot selected: place card into slot,
- if card is ineligible: show reason.

### 11.4 Team Summary UI

Summary shows:

- selected count out of 4,
- total BP,
- allowed opponent BP range,
- average BP,
- highest BP card,
- entry/stake cost,
- revival warning if any card is dead.

### 11.5 Match Control Buttons

`Find Match`

- primary action.
- disabled until formation is valid.
- calls queue join endpoint.

`Cancel Queue`

- visible while waiting.
- calls cancel endpoint.

`Clear Formation`

- clears selected cards and positions.
- disabled while queued.

`Auto Arrange`

- optional P1 button.
- places cards based on archetype.

`View Replay`

- visible after resolved match.

`Revive Cards`

- visible if any deployed card is pvp_dead after match.

`Return to Vault`

- routes back to collection.

### 11.6 Arena UI Error Messages

Required messages:

- "Choose at least one hero."
- "Arena supports up to four heroes."
- "Place each selected hero on the board."
- "This hero is dead and must be revived."
- "This hero is already in another queue."
- "Insufficient Dust."
- "No opponent found yet."
- "Queue expired. Dust was returned."
- "Match resolved."
- "Battle failed. Entry was refunded."
- "This card needs 200 Dust to revive."

## 12. Arena Backend MVP

### 12.1 Existing Endpoint Baseline

Current useful endpoints:

- `POST /api/pvp/join`
- `GET /api/pvp/entries/<entry_id>`
- `POST /api/pvp/cancel`

These should remain conceptually, even if request/response shapes evolve.

### 12.2 Target Join Request

Target request:

```json
{
  "queueKey": "ranked",
  "battleMode": "arena_2x3",
  "team": [
    { "heroId": "uuid", "position": { "row": "front", "lane": 1 } },
    { "heroId": "uuid", "position": { "row": "back", "lane": 2 } }
  ]
}
```

### 12.3 Target Join Response

Waiting response:

```json
{
  "status": "waiting",
  "entry": {},
  "economy": {},
  "reservedCards": []
}
```

Matched response:

```json
{
  "status": "resolved",
  "entry": {},
  "match": {},
  "battle": {},
  "economy": {},
  "cardStateChanges": [],
  "rewards": {}
}
```

### 12.4 Backend Validation

Backend must validate:

- user owns all heroes,
- hero IDs are unique,
- team size is 1 to 4,
- positions are unique,
- positions fit 2 by 3 board,
- cards are not pvp_dead,
- cards are not decomposed,
- cards are not already queued,
- total BP is valid,
- wallet has required Dust.

### 12.5 Match Resolution

When opponent found:

1. Create match row.
2. Mark both entries matched or resolving.
3. Build battle payload with formation.
4. Run battle.
5. Save battle record.
6. Save battle participants.
7. Save board history and result.
8. Apply reward and death rules.
9. Release queued cards.
10. Return match result.

## 13. PvP Death MVP

### 13.1 Death Trigger

MVP rule:

- A card that reaches 0 HP in a resolved Arena match becomes `pvp_dead`.

This applies to both winner and loser. If a winning team has one card reduced to 0 HP, that card still requires revival before it can enter Arena again.

This makes death clear, creates a meaningful Dust sink, and prevents the winner-takes-all reward from becoming risk-free.

Alternative rule for later:

- only cards on losing side die,
- only full-team defeat causes death,
- cards have durability instead of binary death.

MVP should use the simplest visible rule unless playtesting shows it is too punishing.

### 13.2 PvP Dead State

PvP dead card:

- remains in Vault,
- cannot enter Arena,
- can still be inspected,
- can be revived with Dust,
- can be decomposed if not locked,
- may still be allowed in Chronicle if design chooses mode separation.

### 13.3 Revival

Revival button appears:

- on card detail,
- in Vault filters,
- after Arena result if deployed cards died.

Revival cost MVP:

- Fixed cost: 200 Dust.

The fixed price makes the first version easier to understand, easier to balance, and easier to communicate in UI. BP-scaling revival can be revisited after there is enough match data.

### 13.4 Revival Backend Action

Needed endpoint:

- `POST /api/cards/<card_id>/revive`

Request:

```json
{
  "reason": "pvp_dead"
}
```

Response:

```json
{
  "ok": true,
  "card": {},
  "economy": {},
  "transaction": {}
}
```

## 14. Arena Rewards MVP

### 14.1 Reward Goals

PvP should not only punish with death. It should provide positive incentives:

- Dust for victory.
- Low-tier relic chance.
- match history progress.
- later ladder rating.

### 14.2 MVP Reward Direction

MVP rule:

- Arena charges Dust entry from both players.
- Winner takes the Arena Dust pool.
- Loser receives no Dust from the match.
- Tie refunds both players or splits the pool evenly; this should be selected before implementation.
- Low-tier relic drop chance for winner.

### 14.3 Anti-Abuse Constraints

PvP rewards need basic protection:

- no rewards for repeated same-opponent farming beyond limit,
- no rewards if match is cancelled,
- no rewards if match fails,
- reward only after valid battle result,
- suspicious matches can be logged.

MVP can start conservative: winner Dust plus small relic chance.

### 14.4 Entry Cost

Arena MVP entry cost:

- Each player pays Dust to enter the Arena queue.
- The entry cost goes into the match pool when a match is found.
- If the queue expires or is cancelled before matching, entry Dust is refunded.
- If the match resolves, the winner receives the pool.

Suggested first value:

- 30 Dust per Arena entry.

This value can use the existing backend setting and be tuned later.

## 15. Card Decomposition MVP

Arena MVP does not require decomposition to function, but decomposition helps the Dust loop.

If included in MVP:

- card can be decomposed from Vault,
- locked cards cannot be decomposed,
- queued cards cannot be decomposed,
- decomposed cards disappear from usable collection,
- Dust returned by rarity/BP formula,
- relics are not returned by default.

Needed endpoint:

- `POST /api/cards/<card_id>/decompose`

This can be P1 if Arena needs to ship sooner.

## 16. Frontend State Requirements

Arena frontend should track:

- selected card id,
- selected board slot,
- formation map,
- queue entry,
- match record,
- battle result,
- countdown timer,
- error message,
- pending backend action,
- dead card result list,
- economy snapshot.

Persistent local storage can remember:

- last selected queue key,
- last formation draft,
- active queue entry id.

Authoritative state must come from backend after refresh.

## 17. Backend Data Requirements

### 17.1 Card Table Additions

Current `heroes` table stores hero payload. MVP likely needs either columns or JSON fields for:

- life state,
- lock state,
- visual state,
- relic infusion,
- decomposed state,
- active queue marker.

For MVP speed, these can be JSON payload fields, but long-term they should become queryable columns where needed.

### 17.2 PvP Queue Additions

Need:

- formation payload,
- battle mode `arena_2x3`,
- reserved hero IDs,
- queue expiry,
- status.

### 17.3 Match Additions

Need:

- formation payload for both sides,
- board history,
- card death results,
- reward payload,
- ladder payload later.

## 18. MVP User Flow

### 18.1 First Arena Use

1. Player forges at least one card.
2. Player opens Arena.
3. UI shows formation board and eligible cards.
4. Player places 1 to 4 cards.
5. UI shows total BP and matching window.
6. Player clicks `Find Match`.
7. System queues player.
8. If matched, backend resolves battle.
9. UI shows replay/result.
10. UI shows rewards and dead cards.
11. Player revives dead cards or returns to Forge/Vault.

### 18.2 Returning to Active Queue

1. Player reloads page.
2. App checks stored active queue id.
3. App calls queue status endpoint.
4. If waiting, show countdown.
5. If resolved, show result.
6. If expired, show refund message.

## 19. What Must Change From Current Implementation

Current implementation already has many useful pieces, but the product target requires changes:

- Rename top-level `Duel` to `Arena`.
- Change PvP tolerance from 10% to 5%.
- Replace current 4-lane board with 2 by 3 formation board.
- Store positions, not only ordered hero arrays.
- Add card life state.
- Add PvP death and revival.
- Show Arena as a primary mode, not secondary under duel.
- Keep battle visualizer but update it for 2 by 3 layout.
- Expand card display with archetype, life state, and flash marker.

## 20. Implementation Phases After Design

### Phase 1: Data and API Minimal Support

- Add card state fields.
- Add formation payload to PvP join.
- Validate formation.
- Use 5% BP matching.
- Store resolved result and board history.

### Phase 2: Frontend Arena Rework

- Replace lineup list with 2 by 3 board.
- Add roster placement.
- Add queue controls.
- Add match result panel.

### Phase 3: Death and Revival

- Mark dead cards after match.
- Block dead cards from Arena.
- Add revive endpoint and UI.
- Use fixed 200 Dust revive cost.

### Phase 4: Rewards

- Add winner Dust reward.
- Add low-tier relic chance.
- Record reward transactions.

### Phase 5: Replay Polish

- Update battle visualizer for 2 by 3 board.
- Add replay controls.

## 21. Acceptance Criteria

Arena MVP is successful when:

- A player can enter Arena with 1 to 4 cards.
- The player can place those cards on a 2 by 3 board.
- The system prevents invalid cards and invalid formations.
- The system matches only opponents within 5% total BP.
- The backend resolves the battle automatically.
- The frontend shows a readable result and board state.
- Cards that die in PvP become unusable for Arena until revived.
- Revival consumes 200 Dust and records a transaction.
- Arena charges Dust entry and winner receives the Dust pool.
- Winner has a small chance to receive a low-tier relic.
- Queue cancellation and expiration work correctly.

## 22. Open Decisions

These should be resolved before implementation planning:

- Should dead cards still be usable in Chronicle?
- Should flash cards have higher revive cost?
- Should battle result immediately apply card death, or require a result confirmation step?
- Should player manually place cards every queue or save default formation?

Already-decided MVP rules:

- Every 0 HP card in Arena becomes pvp_dead.
- Arena charges Dust entry.
- Winner takes the Dust pool.
- Loser receives no Dust from the match.
- Revive cost is fixed at 200 Dust.
- Forge cost defaults to 100 Dust.

## 23. Recommended Decisions for MVP

To keep scope controlled, use these defaults unless changed:

- Every 0 HP card in Arena becomes pvp_dead.
- PvP dead only blocks Arena, not future Chronicle.
- Arena has a Dust entry cost.
- Winner takes the Dust pool.
- Loser gets no Dust in first MVP.
- Low-tier relic drop only for winner.
- Revive cost is fixed at 200 Dust.
- Formation is manually placed and saved locally as draft.
- Queue is asynchronous and auto-resolved.

These defaults create a playable loop without waiting for full ladder, market, or PvE design.

## 24. Dust Sources Outside Arena

Arena should not be the only way to earn Dust. If PvP has entry costs and revival costs, the product needs daily non-PvP sources so players do not become stuck.

MVP activity systems:

- Daily sign-in reward grants Dust.
- Daily tasks grant Dust.
- Daily tasks can later grant low-tier relic shards or low-tier relics.

Initial daily task examples:

- Forge one card.
- Enter Arena once.
- Win one Arena match.
- Revive one card.
- Decompose one card.
- View or claim daily reward.

Daily rewards should be conservative but reliable. They are a retention mechanism and a safety valve for the Dust economy.
