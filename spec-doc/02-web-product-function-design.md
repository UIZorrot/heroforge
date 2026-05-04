# Hero Forge Web Product and Function Design

> Status: Draft v0.1
> Date: 2026-05-04
> Scope: Detailed web product design for frontend screens, buttons, player actions, backend features, API responsibilities, game mechanisms, and state handling.

## 1. Purpose

Hero Forge is currently planned as a web-first game without a separate native client. That means the browser experience is the product surface. The website is not only a landing page or a dashboard. It is the full game client.

This document describes the intended product behavior in detail:

- What pages and modes exist.
- What each screen shows.
- What every major button does.
- What backend function supports each action.
- What states, errors, and edge cases the UI must handle.
- What existing implementation should be preserved.
- What future design changes are required by the new PvE, PvP, relic, Dust, and card-life rules.

This is not an implementation plan. It is a product specification draft that future technical plans should reference.

## 2. Web Product Principles

### 2.1 The First Screen Should Become Playable Quickly

Because this is a web game, the site should reduce the distance between arrival and play. A new player should be guided toward forging a first hero, then using that hero in Chronicle PvE before entering serious PvP.

### 2.2 The Interface Should Feel Like a Game Client

The current visual direction already uses dark fantasy, gold accents, card surfaces, battle panels, and animated transitions. The next design should push this toward a professional game UI:

- strong card identity,
- clear resource display,
- readable battle states,
- fast mode switching,
- persistent player status,
- compact but dramatic screens,
- minimal marketing copy inside the actual game client.

### 2.3 Game Rules Must Be Visible

When a player cannot take an action, the UI should explain the reason:

- not enough Dust,
- no valid hero,
- hero is PvP dead,
- total BP is outside range,
- team has too many heroes,
- party exceeds Chronicle tier limit,
- card is locked, listed, injured, or already deployed.

### 2.4 Frontend and Backend Should Share the Same Mental Model

The frontend should not invent game state that the backend does not know about. Client-side state can support UI speed, but authoritative state should come from backend data:

- user session,
- wallet,
- relic inventory,
- hero list,
- card life state,
- PvE run state,
- PvP queue state,
- match result,
- ladder rating,
- transactions.

## 3. Top-Level Product Map

The target navigation should be:

- Forge
- Vault
- Chronicle
- Arena
- Ladder
- Market
- Profile

Current implementation has:

- Landing
- Login
- Dashboard shell
- Forge
- Vault
- Train
- Duel
- Chronicle placeholder
- PvP Arena under `duel`
- Profile concept but not fully surfaced

Target change:

- Remove `Duel` as a top-level nav item.
- Keep practice battle only if it becomes a tool inside Vault or Arena.
- Promote `Arena` as the PvP surface.
- Add `Ladder` as the ranked identity surface.
- Add `Market` or `Relic Exchange` for tradable relics.
- Expand `Chronicle` from placeholder to playable PvE.

## 4. Global Web Shell

### 4.1 Persistent Elements

Every authenticated game screen should have:

- App logo.
- Main navigation.
- Current Dust balance.
- Relic inventory shortcut.
- User identity.
- Session/logout control.
- Notification or transaction feedback area.
- Active mode title.
- Loading state when collections refresh.

### 4.2 Sidebar Navigation

Current UI uses a collapsible sidebar. This should remain because it fits a web game client.

Required sidebar controls:

- Collapse/expand button.
- Forge nav button.
- Vault nav button.
- Chronicle nav button.
- Arena nav button.
- Ladder nav button.
- Market nav button.
- Profile nav button.

Button behavior:

- Click navigates to mode.
- Active mode is visually highlighted.
- Disabled modes display locked state with reason.
- Hover shows full label when collapsed.
- Mobile version becomes bottom navigation or drawer.

### 4.3 Global Resource Bar

Required fields:

- Dust balance.
- Relic count summary.
- Pending PvP queue indicator.
- Dead card count.
- Injured card count.

Buttons:

- `Buy Dust`: opens purchase flow or placeholder commerce panel.
- `Relics`: opens relic inventory or Market.
- `Transactions`: opens recent economy ledger.

Rules:

- Dust is account-bound and not player-tradable.
- Relics can be traded.
- Limited relic sales should appear as event banners or Market modules, not as intrusive popups.

## 5. Landing Page

### 5.1 Purpose

The landing page should convert an unauthenticated visitor into a first forge attempt. It should not explain every system in depth.

### 5.2 Required Content

The page should communicate:

- Hero Forge is a web-based fantasy card battler.
- Images become playable heroes.
- Heroes are used in PvE, PvP, and ladder.
- Dust and relics drive creation and progression.
- The player can start immediately with email login.

### 5.3 Buttons

`Play Now`

- Primary CTA.
- If logged out: opens login page/panel.
- If logged in: enters dashboard, defaulting to Forge or last active mode.

`Forge First Hero`

- Secondary CTA on landing.
- If logged out: opens login, then routes to Forge.
- If logged in: routes to Forge.

`View Game Modes`

- Scrolls to concise product proof or opens a mode overview.
- Should not compete visually with the primary CTA.

### 5.4 Current Issues to Fix Later

- Current landing page still overuses cinematic explanation.
- It routes to `duel` in some places; target should route to `Arena`.
- `Discover Lore` currently points to Chronicle placeholder; that should become `Enter Chronicle` only after Chronicle has a real playable surface.

## 6. Login and Account

### 6.1 Current Flow

Backend supports email-code login:

- `POST /api/auth/request-code`
- `POST /api/auth/verify-code`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Frontend supports:

- email input,
- request code button,
- code input,
- verify button,
- resend cooldown,
- stored token session,
- boot-time session check.

### 6.2 Login Screen Elements

Fields:

- Email input.
- Code input, shown after code request or always visible but inactive until needed.

Buttons:

- `Send Code`
- `Verify`
- `Resend Code`
- `Back`
- `Logout` when already authenticated.

States:

- empty email,
- invalid email format,
- sending,
- code sent,
- cooldown active,
- verifying,
- verification failed,
- session expired,
- logged in.

### 6.3 Product Requirements

Login should be low-friction, but game state must be protected. Forge, Vault, Chronicle, Arena, Ladder, Market, and Profile require authentication.

Unauthenticated users can view landing content, but should not be able to forge, queue, trade, decompose, revive, or claim rewards.

## 7. Forge Mode

### 7.1 Purpose

Forge is the main creation screen. The player uploads an image, optionally selects relics, pays Dust, and receives a persistent hero card.

MVP cost:

- Default card forge cost is 100 Dust.

### 7.2 Current Frontend Features

Current UI includes:

- image drag-and-drop,
- file browse,
- image preview,
- clear preview,
- forging loading state,
- error feedback,
- material/relic picker,
- generated card preview,
- reset Forge button,
- local material inventory state.

### 7.3 Target Forge Layout

Forge should have four zones:

- Input zone: image upload and preview.
- Infusion zone: relic selection and Dust cost.
- Process zone: forge steps and generation progress.
- Result zone: final card, card actions, and next recommended action.

### 7.4 Required Buttons

`Upload Image`

- Opens file picker.
- Accepts image files.
- Rejects unsupported files.
- Shows preview after selection.

`Clear Image`

- Removes current preview.
- Resets forge result if no generated card is locked.

`Select Relic`

- Opens relic picker.
- Shows owned relics.
- Shows tradability, rarity, and forge effect.
- Disabled when forging is already in progress.

`Remove Relic`

- Clears selected relic.
- Recalculates cost and flash chance.

`Forge Hero`

- Requires image, enough Dust, valid session.
- Sends image and relic selection to backend.
- Locks input while request is pending.
- On success: shows generated card and updates Vault/economy.
- On failure: shows error and refund state if backend refunds.

`Forge Again`

- Clears generated result and keeps player in Forge.

`Send to Chronicle`

- Appears after first card is forged.
- Routes player to Chronicle party selection with this hero preselected.

`View in Vault`

- Opens the generated card detail in Vault.

### 7.5 Forge Backend Responsibilities

Current endpoint:

- `POST /api/forge`

Current backend behavior:

- requires auth,
- validates image exists,
- charges Forge Dust cost,
- runs image analysis,
- runs LLM structure generation,
- applies material directive,
- runs rule-based stat/skill generation,
- saves hero generation history,
- saves hero record,
- refunds Dust on failure after charge,
- returns final hero and economy snapshot.

Target additions:

- support relic IDs instead of client-only material keys,
- consume or attach relics according to relic rules,
- calculate flash card chance,
- store flash status,
- store card source and forge recipe,
- store card life state,
- store edition/limited metadata,
- return structured error codes.

### 7.6 Forge Error States

Required errors:

- not logged in,
- no image,
- unsupported image,
- image too large,
- insufficient Dust,
- relic not owned,
- relic already listed for trade,
- relic cannot be used for this forge,
- model generation failed,
- numeric generation failed,
- backend refund failed,
- network error.

## 8. Card Face and Card Detail

### 8.1 Card Face Purpose

The card face is the main collectible object. It must be attractive enough to make players care about ownership, flash variants, death state, and relic identity.

### 8.2 Current Card Features

Current `HeroCard` shows:

- artwork or name fallback,
- rarity,
- normalized type,
- BP,
- name,
- description,
- HP, ATK, DEF, SPEED,
- primary/secondary skill names in non-compact mode,
- infusion badges,
- selection state.

### 8.3 Required Card Face Elements

Every card should display:

- hero name,
- artwork,
- rarity,
- BP,
- fantasy archetype,
- element/damage type,
- primary stats,
- skill summary,
- relic infusion icon,
- flash marker if applicable,
- life state marker,
- mode eligibility marker.

### 8.4 Card Detail View

The card detail panel should include:

- full artwork,
- full description,
- source image thumbnail,
- archetype,
- element,
- rarity,
- BP,
- full stats,
- skill details,
- relic infusion history,
- card source,
- forge date,
- flash status,
- PvE injury state,
- PvP death state,
- recent usage,
- available actions.

### 8.5 Card Detail Buttons

`Use in Chronicle`

- Routes to Chronicle party selection.
- Disabled if card cannot enter PvE.

`Use in Arena`

- Routes to Arena formation selection.
- Disabled if PvP dead or ineligible.

`Revive`

- Visible if PvP dead or recoverable injury exists.
- Opens cost confirmation.
- Calls revival backend endpoint in future.
- Arena MVP revival cost is 200 Dust.

`Decompose`

- Opens destructive confirmation.
- Shows Dust return estimate.
- Disabled if card is in active PvE run, active queue, trade listing, or locked.

`Lock Card`

- Protects from accidental decomposition or trading.

`Unlock Card`

- Re-enables destructive actions after confirmation.

`Trade Relic`

- Appears for relic-related card interactions only if card contains detachable/tradable relic mechanics in future.

## 9. Vault Mode

### 9.1 Purpose

Vault is the player's collection, roster manager, and action hub for all owned heroes.

### 9.2 Current Frontend Features

Current Vault supports:

- saved hero list,
- selected hero detail,
- search by name,
- sort by date, BP, name,
- rarity filter,
- collection average BP,
- strongest hero metric,
- card click selection,
- action buttons that can route cards into training.

### 9.3 Target Vault Layout

Vault should include:

- collection overview,
- filters and sorting,
- card grid,
- selected card detail,
- batch actions,
- card state filters,
- mode eligibility filters.

### 9.4 Required Filters

- Search text.
- Sort by newest.
- Sort by BP.
- Sort by rarity.
- Sort by archetype.
- Filter by element.
- Filter by life state.
- Filter by flash card.
- Filter by relic infused.
- Filter by PvE eligible.
- Filter by Arena eligible.
- Filter by locked/unlocked.

### 9.5 Vault Buttons

`Search`

- Filters visible cards live.

`Sort`

- Opens or toggles sort options.

`Filter Rarity`

- Shows all/common/rare/epic/mythic or final rarity names.

`Select Card`

- Opens detail panel.

`Use in Chronicle`

- Adds card to Chronicle party draft.

`Use in Arena`

- Adds card to Arena formation draft.

`Revive`

- Starts Dust revival flow.

`Decompose`

- Starts decomposition flow.

`Lock`

- Prevents accidental decomposition.

`Compare`

- Adds card to comparison tray.

### 9.6 Backend Responsibilities

Current endpoint:

- `GET /api/me/heroes`

Target additions:

- include card life state,
- include flash status,
- include lock state,
- include relic attachment,
- include mode eligibility,
- include decomposition value,
- include revive cost,
- support pagination/filtering when collection grows.

## 10. Chronicle PvE Mode

### 10.1 Purpose

Chronicle is the PvE mode. It should teach the game, provide Dust and relics, and let players use smaller teams before entering Arena.

### 10.2 Current State

Current frontend has a Chronicle placeholder.

Current backend has:

- `POST /api/pve/start`
- `pve_runs`
- `pve_run_party`
- `pve_run_stages`

Current endpoint behavior:

- requires auth,
- charges PvE entry Dust,
- validates hero IDs,
- loads owned heroes,
- creates run,
- saves party,
- creates first stage placeholder,
- returns run, party, and economy.

### 10.3 Target Player Flow

1. Player opens Chronicle.
2. Player selects a Chronicle tier.
3. Player selects 1 to 3 heroes.
4. UI validates total BP around tier requirement.
5. Player pays Dust entry cost.
6. Run begins at Floor 1.
7. Player chooses node path after each floor.
8. Battles resolve against monster templates.
9. Player receives Dust, relics, or temporary run effects.
10. Player defeats boss, retreats, or loses.

### 10.4 Chronicle Screen Zones

- Tier selector.
- Party builder.
- BP eligibility panel.
- Floor path.
- Encounter panel.
- Reward panel.
- Run log.
- Party condition panel.

### 10.5 Chronicle Buttons

`Select Tier`

- Chooses BP band and reward table.

`Add Hero`

- Adds a card to party.
- Disabled after 3 heroes.

`Remove Hero`

- Removes card from party before run starts.

`Start Run`

- Requires valid party, enough Dust, no blocked card state.
- Calls backend start endpoint.

`Choose Path`

- Selects next node after a floor.
- Options can include safe path, deep path, strange door, sealed chamber.

`Fight`

- Resolves current monster encounter.

`Claim Reward`

- Adds floor reward to account.

`Retreat`

- Ends run early.
- Applies retreat reward and injury rules.

`Revive in Run`

- Uses shrine, relic, or run item if available.

`Return to Vault`

- Exits completed or failed run state.

### 10.6 Chronicle Backend Target Endpoints

Current:

- `POST /api/pve/start`

Needed:

- `GET /api/pve/runs/current`
- `GET /api/pve/runs/<run_id>`
- `POST /api/pve/runs/<run_id>/choose`
- `POST /api/pve/runs/<run_id>/battle`
- `POST /api/pve/runs/<run_id>/claim`
- `POST /api/pve/runs/<run_id>/retreat`
- `POST /api/pve/runs/<run_id>/revive`

### 10.7 Chronicle States

- not started,
- party draft,
- entry validation failed,
- active run,
- choosing path,
- in battle,
- reward pending,
- completed,
- defeated,
- retreated,
- expired.

## 11. Arena PvP Mode

### 11.1 Purpose

Arena is the formal PvP mode. It replaces Duel as the primary PvP surface.

### 11.2 Current Frontend Features

Current `PvpArena` supports:

- selecting 1 to 4 heroes,
- search heroes,
- selected lineup summary,
- total BP display,
- tolerance range,
- Dust stake display,
- join queue,
- cancel queue,
- clear result,
- queue countdown,
- polling existing entry,
- battle result visualization.

### 11.3 Target Arena Layout

Arena should center on formation, not just card selection.

Each player should have a 2 by 3 field:

- front row: 3 slots,
- back row: 3 slots,
- up to 4 heroes placed into 6 slots.

Screen zones:

- formation board,
- roster picker,
- BP eligibility panel,
- queue controls,
- opponent/match state,
- battle replay/result,
- card death/revival consequences.

### 11.4 Arena Buttons

`Add to Formation`

- Places selected hero into a chosen slot.

`Remove from Slot`

- Clears the slot.

`Auto Arrange`

- Suggests positions based on archetype and range.

`Clear Formation`

- Removes all selected heroes.

`Find Match`

- Requires 1 to 4 heroes, enough Dust if entry/stake is active, and no PvP dead heroes.
- Calls queue join endpoint.

`Cancel Queue`

- Cancels waiting entry.
- Refunds stake if backend allows.

`Clear Result`

- Clears local result display after match completion.

`View Replay`

- Opens battle visualization from board history.

`Revive Dead Cards`

- Opens revival panel for cards that died in the match.

### 11.5 PvP Match Rules

Target rules:

- Team size: 1 to 4 heroes.
- Available formation slots: 6 per side.
- Team size does not need to match opponent team size.
- Match eligibility: total BP gap within 5%.
- BP formula should use stricter lower-BP denominator:

```text
gap_pct = abs(team_bp_a - team_bp_b) / min(team_bp_a, team_bp_b) * 100
```

### 11.6 Current Backend Support

Current endpoints:

- `POST /api/pvp/join`
- `GET /api/pvp/entries/<entry_id>`
- `POST /api/pvp/cancel`
- `POST /api/economy/pvp-entry`

Current backend behavior:

- validates hero ownership,
- supports `1v1` and `4v4`,
- calculates total BP,
- queues entry,
- matches within configured tolerance,
- resolves match,
- saves match,
- settles Dust stake,
- supports cancellation and expiration refund.

### 11.7 Target Backend Changes

- Rename or present PvP as Arena.
- Store formation positions.
- Change tolerance default from 10% to 5%.
- Support 2 by 3 formation coordinates.
- Store per-card PvP death results.
- Apply revival requirements after match.
- Add ranked ladder rating update.
- Return replay-ready board history.

## 12. Battle Visualization

### 12.1 Current Features

Current battle visualizer supports:

- board view if board data exists,
- unit cards,
- HP/MP display,
- buffs,
- action feed,
- winner summary,
- event count,
- round count,
- close button.

### 12.2 Target Requirements

Battle visualization should become the main result surface for both Chronicle and Arena.

Required views:

- formation board,
- timeline,
- event feed,
- HP/MP bars,
- status icons,
- death markers,
- reward/result summary,
- replay controls.

### 12.3 Buttons

`Close`

- Closes visualization.

`Replay`

- Plays event sequence from first round.

`Pause`

- Pauses replay.

`Next Event`

- Steps one event forward.

`Previous Event`

- Steps one event backward.

`Skip to Result`

- Jumps to final state.

`View Rewards`

- For PvE/PvP reward result.

## 13. Ladder Mode

### 13.1 Purpose

Ladder gives PvP long-term meaning.

### 13.2 Required Screen Elements

- Current rating.
- Current tier.
- Wins/losses/ties.
- Peak rating.
- Recent ranked matches.
- Season timer.
- Season rewards.
- Rank progress.

### 13.3 Buttons

`Enter Ranked Arena`

- Routes to Arena with ranked queue selected.

`Claim Season Reward`

- Claims earned rewards after season or milestone.

`View Match History`

- Opens ranked match list.

`View Replay`

- Opens a saved match replay.

### 13.4 Backend Target Endpoints

- `GET /api/ladder/me`
- `GET /api/ladder/season`
- `GET /api/ladder/matches`
- `POST /api/ladder/rewards/claim`

## 14. Market and Relic Trading

### 14.1 Purpose

Relics are player-tradable. Dust is not. Market is where player economy and limited relic sales live.

### 14.2 Required Screen Elements

- Owned relic inventory.
- Tradable relic listings.
- Limited official relic sales.
- Relic details.
- Relic forge effects.
- Price/history if marketplace exists.
- Listing status.

### 14.3 Buttons

`Buy Limited Relic`

- Purchases official limited relic.

`List Relic`

- Creates player listing.

`Cancel Listing`

- Removes player listing.

`Buy Relic`

- Purchases listed relic from another player using approved market currency or mechanism.

`Use in Forge`

- Routes to Forge with relic preselected.

`Inspect`

- Opens relic detail.

### 14.4 Backend Target Endpoints

- `GET /api/relics/me`
- `GET /api/relics/market`
- `POST /api/relics/list`
- `POST /api/relics/cancel-listing`
- `POST /api/relics/buy`
- `GET /api/relics/limited-sales`
- `POST /api/relics/limited-sales/buy`

## 15. Profile and Economy Ledger

### 15.1 Current Backend Support

Current economy endpoint:

- `GET /api/me/economy`

It returns:

- wallet,
- relics,
- transactions,
- costs,
- starter balance,
- PvP config.

### 15.2 Required Profile Elements

- email/account identity,
- Dust balance,
- relic inventory summary,
- transaction ledger,
- owned card count,
- dead card count,
- injured card count,
- ladder summary,
- recent battles,
- logout.

### 15.3 Buttons

`Logout`

- Revokes session and clears local session.

`Buy Dust`

- Opens purchase flow.

`View Transactions`

- Opens full ledger.

`View Battles`

- Opens battle history.

`View Cards`

- Routes to Vault.

## 16. Backend Functional Inventory

### 16.1 Authentication

Implemented:

- create login code,
- verify login code,
- create session,
- fetch current user,
- revoke session.

Required product behavior:

- player cannot perform game actions without valid session,
- expired sessions return to login,
- all economy and card mutations require auth.

### 16.2 Forge

Implemented:

- charge Dust,
- analyze image,
- generate hero structure,
- generate final stats,
- save generation,
- save hero,
- refund on failure.

Target:

- relic ownership validation,
- flash card generation,
- card life metadata,
- source/edition metadata,
- structured forge history.

### 16.3 Economy

Implemented:

- wallet creation,
- Dust adjustment,
- relic adjustment helpers,
- transaction ledger,
- economy snapshot.

Target:

- Dust purchase records,
- decomposition records,
- revival records,
- daily sign-in records,
- daily task reward records,
- PvE reward records,
- PvP reward records,
- relic trade records,
- limited sale records.

### 16.4 Battle

Implemented:

- 1v1 battle,
- 3v3 and 4v4 team battle,
- event logs,
- board snapshots,
- buff/status handling,
- battle participant persistence.

Target:

- 2 by 3 formation,
- distance by coordinate,
- card death result,
- replay step data,
- PvE monster teams,
- ranked match metadata.

### 16.5 PvE

Implemented:

- start run,
- store run,
- store party,
- create first stage placeholder.

Target:

- floor progression,
- node choices,
- monster encounter generation,
- reward generation,
- run death/injury,
- retreat,
- claim rewards.

### 16.6 PvP

Implemented:

- queue join,
- status polling,
- cancellation,
- expiration refund,
- BP-window matching,
- match resolution,
- stake settlement.

Target:

- Arena naming,
- 5% BP gap,
- formation positions,
- ladder updates,
- PvP death state,
- Dust entry pool and winner-takes-all settlement,
- small low-tier relic drop chance for winner.

### 16.7 Collection

Implemented:

- list heroes,
- list battles.

Target:

- card detail endpoint,
- card lock/unlock,
- decompose card,
- revive card,
- card state update,
- paginated collection filters.

## 17. Activity and Daily Rewards

### 17.1 Purpose

The web game needs lightweight daily reasons to return, especially because Forge, Arena entry, and PvP revival consume Dust.

Daily activity should provide reliable Dust income without replacing PvE, PvP victories, decomposition, or Dust purchases.

### 17.2 Required Screen Elements

Daily activity can appear in the global shell, Profile, or a small home panel.

Required elements:

- daily sign-in status,
- current daily reward,
- task list,
- task progress,
- claim buttons,
- reset timer,
- recent claimed rewards.

### 17.3 Buttons

`Claim Daily Sign-In`

- Claims the daily Dust reward.
- Disabled after claim until next reset.

`Claim Task Reward`

- Claims Dust for a completed task.
- Disabled if task is incomplete or already claimed.

`Go to Task`

- Routes the player to the relevant mode, such as Forge or Arena.

### 17.4 MVP Daily Tasks

Initial daily tasks:

- Forge one card.
- Enter Arena once.
- Win one Arena match.
- Decompose one card.
- Revive one card.
- Claim daily sign-in.

### 17.5 Backend Target Endpoints

- `GET /api/daily/me`
- `POST /api/daily/sign-in/claim`
- `POST /api/daily/tasks/<task_key>/claim`

### 17.6 Backend Responsibilities

- Track daily reset window.
- Track task progress.
- Prevent duplicate claims.
- Grant Dust through resource transaction records.
- Return updated economy snapshot.
- Make rewards configurable.

## 18. Required New Backend Actions

Future API actions implied by product design:

- revive card,
- decompose card,
- lock card,
- unlock card,
- fetch card detail,
- fetch relic inventory,
- trade relic,
- buy Dust,
- buy limited relic,
- start/continue Chronicle run,
- choose Chronicle node,
- resolve Chronicle encounter,
- claim Chronicle reward,
- enter ranked Arena,
- fetch ladder profile,
- claim ladder reward,
- claim daily sign-in,
- claim daily task reward.

## 19. State Model Requirements

### 19.1 Card State

Each card should eventually have:

- `alive`
- `pve_injured`
- `pvp_dead`
- `locked`
- `in_active_pve_run`
- `in_pvp_queue`
- `listed_for_trade`
- `decomposed`

### 19.2 Relic State

Each relic should have:

- `owned`
- `listed`
- `reserved_for_forge`
- `consumed`
- `attached_to_card`
- `limited`
- `tradable`
- `non_tradable`

### 19.3 PvE Run State

Each run should have:

- `draft`
- `active`
- `choosing_node`
- `in_battle`
- `reward_pending`
- `completed`
- `defeated`
- `retreated`
- `expired`

### 19.4 PvP Queue State

Current states are close:

- `waiting`
- `matched`
- `cancelled`
- `expired`

Target may add:

- `resolving`
- `resolved`
- `failed`

## 20. Web UX Priority List

Priority 1:

- Make Forge flow clearer.
- Make Vault card actions explicit.
- Replace Duel nav with Arena.
- Make Arena the first real playable PvP mode.

Priority 2:

- Add card life state.
- Add revive/decompose UX.
- Add formation-based Arena.
- Add visible BP eligibility feedback.
- Add daily sign-in and daily task claim UI.

Priority 3:

- Build Chronicle as first real PvE mode.
- Add Ladder.
- Add relic Market.
- Add flash card visual system.
- Add replay controls.

Priority 4:

- Add official limited relic sale surfaces.
- Add Dust purchase UI.
- Add full transaction ledger.
- Add advanced filters and comparison.

## 21. Product Acceptance Criteria

The web game client should be considered product-complete for the next major version when:

- A new player can log in, forge a card, and understand what the card can do.
- The player can view and manage cards in Vault.
- The player can enter Chronicle with up to 3 heroes and receive Dust/relic rewards.
- The player can enter Arena with 1 to 4 heroes arranged on a 2 by 3 formation board.
- Arena matching uses a 5% BP rule.
- PvP death creates a visible card state and Dust revival path.
- Unwanted cards can be decomposed into Dust.
- Arena charges 30 Dust entry, winner takes the 60 Dust pool, and tie refunds both entries.
- PvP winner has a small chance to receive a low-tier relic.
- Daily sign-in and daily tasks provide Dust.
- Relics can influence future Forge attempts.
- Dust is account-bound and purchasable.
- Relics are player-tradable or at least designed with tradability in mind.
- Ladder has a visible rating and rank identity.
- Backend transaction records explain all resource changes.

## 22. Document Follow-Up

This document should later be split into implementation-ready documents:

- Forge page UX and API spec.
- Vault and card-detail UX spec.
- Chronicle PvE UX and backend spec.
- Arena formation PvP UX and backend spec.
- Ladder UX and rating spec.
- Market, relic trading, and Dust purchase spec.
- Card lifecycle, revival, and decomposition spec.
