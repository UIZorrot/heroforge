# Changelog

All gameplay and player-facing changes are recorded here. This log starts on 2026-10-08; older releases have not been reconstructed.

## Unreleased

### Fixed

- Restored the existing Chronicle navigation name and matching sign-in copy. PvE describes the campaign's play mode; it does not replace the section name. Void Labyrinth remains the chapter title. Navigation keys and campaign progress are unchanged; targeted TypeScript/lint and whitespace checks validate the copy correction.

- Adding VFX cards after dragging a unit now reserves its existing slot first and places new cards in free slots; adding a card no longer overwrites the caster or primary target.

- VFX tests now calculate whole-team HP/MP totals, per-target history and a single cast cost, including after changing slots.
- Live polling preserves the current cast and its post-impact pause; result reveal waits for every target.

- Multi-target skills resolve every affected living target, primary target first, while charging MP once. Both manual and automatic combat use the same resolution helper.
- Ally skills can target their caster; support skills with zero direct damage do not damage friendly units.
- Passive skills trigger automatically after preparation and cannot be selected as active skills or by automatic controllers.
- Buff fields are retained independently: attack, defense, crit, evasion, accuracy, healing and MP effects no longer collapse into the first nonzero value. Defense is bounded to prevent negative damage.
- Stun counts skipped actions, so a stun applied after a unit has acted still affects its next action.
- Local manual and automatic previews now resolve actual card skills, passive effects and periodic statuses rather than using separate fake attacks.
- Team combat records an initial board and an individual snapshot for each event, including every target of an area skill.
- Forged portraits are persisted with hero records and generation provenance. The server returns the saved hero ID; the client uses it instead of guessing by name. Hero templates are also preserved.

### Changed

- Chronicle's 3D entrance now emphasizes a dim sky, fractured causeway, suspended platforms, beveled basalt, broken orbital architecture and physically placed warm lamps against cool rim light. Enemy portraits sit in shallow framed cards. Shader veils add subtle light shafts and layered mist; detailed static architecture is batched, shadows update at 250ms intervals and DPR is capped at 1.25. The generated eclipse backdrop remains a concept/fallback asset. Names, BP tiers, targeting, costs and the instant spell system are unchanged; animated monster models are no longer part of the requested direction. See [art direction](docs/void-labyrinth-art-direction.md).

- PvE interface, depth/node names, enemy skills, intents and API feedback now use English to match the surrounding game. Public catalog includes creature lore and tactics. Restored NPC presentation refreshes without changing saved combat stats, costs, targets or RNG; original player content and historical events stay intact. Narrow PvE layouts reclaim sidebar space; mobile primary navigation stays scrollable across the game.

- Skyfall development is paused. Multi-target spells now reuse the existing instant particle/impact system, with simultaneous per-target feedback in a single cast. Active combat no longer imports or starts the Three.js layer.
- Delivery choices are now Auto / Instant / Direct. Saved `sky` choices map to `instant` so older prototype records remain playable. Targeting, costs, damage, statuses and replay snapshots are unchanged.

- Paused prototype: multi-target elemental/support skills previously used a 3D skyfall: warning on the target region, falling objects or columns, then impacts. Physical swipes and gunfire retain direct delivery. The caster stays in place during skyfall.
- Skills may set `VFX_PRESENTATION` to `auto`, `instant` or `direct` (legacy `sky` maps to `instant`); server/local events preserve normalized `vfxPresentation`. This choice affects presentation only.

- Passive semantics are explicitly defined as once-per-battle opening effects. Named periodic statuses tick from the following round; duration is stated in rounds, except stun which counts skipped actions.
- Newly generated passives are limited to support effects, and generated status duration is bounded to 1–3 rounds/actions. Named statuses receive an executable effect if a model omits its marker.
- Relic, enchantment and market views explicitly label their combat effects as planned, rather than presenting saved metadata as an active bonus.
- The generation prompt and skill inspector describe only supported mechanics. Nearby-BP matchmaking, free Train practice, ranked stakes and existing revival prices are preserved.

### Added

- A [Monad submission handoff pack](submission/monad-metropolis-2026-10-14/00-交付清单.md) provides ready-to-paste project/acquisition copy, timed demo and pitch recording scripts, judge access instructions, existing logo and public chain evidence. It distinguishes completed testnet deployment from missing videos, repository access and browser-wallet acceptance; scripts are not described as finished video assets.

- Monad testnet collectible prototype is published at [hf.txzy.net/monad/](https://hf.txzy.net/monad/): the public Monad page connects an injected EVM wallet, mints an ERC-721 hero snapshot, waits for a confirmed Monad transaction, and reads the wallet’s cards and metadata from the contract. Cards use public HTTPS/IPFS art URLs; combat authority and ownership remain in the existing game backend. Contract `0x17bdc9D38BE086CDcEE39D524d33F484cCdD359a` is deployed on chain 10143 and selected by default; `/monad/` and `#monad` open the public mint page directly. Portrait and shared-logo URLs respect the deployment base path. An independent `build:monad` packages the same mint component, four portraits and the game-home link without loading simulated game state or the full game asset bundle. Validation: deployment and two real mints succeeded; ownership, balances and onchain metadata were read back, source verification returned `exact_match`, and the public page, bundles and four default portraits are reachable. Local browser checks cover card selection, images and the missing-wallet message; browser-wallet signing remains unverified. The original game page and API health are unchanged. Test token 1's earlier root artwork path was repaired and its final public GET returns valid WEBP; other previously cached edges can retain the old response until expiry. Token 2 and all new page defaults use the working `/monad/art/` paths. See [Monad testnet MVP instructions](docs/monad-testnet-mvp.md) and [public deployment records](contracts/deployments/monad-testnet.json).

- [Void Labyrinth art pass](docs/void-labyrinth-art-direction.md): nine distinct generated creatures and an illustrated ruin now appear in the bestiary, battle portraits and three portal apparitions. A lazy Three.js scene adds real stone arches, steps, pillars, lighting, shadows, dust, route runes and tier-driven camera focus. Party selection uses portrait cards. Reduced motion keeps the world static; offscreen/background rendering pauses, GPU resources are disposed, and unavailable WebGL/chunks retain the illustrated entrance. Portraits remain paintings rather than animated character models; spell effects continue through the existing instant system.

- [Void Labyrinth playable prototype](docs/pve-void-labyrinth-prototype.md): live players select 1–4 owned heroes and a fixed 1000/5000/10000 tier, traverse ten nodes with two branches, fight scripted enemies and 1/2/4-target boss rituals, use camps and retry checkpoints. Includes PvE column protection, carried HP/MP, two waits per hero per encounter, clear-only victory and 30-round failure, interruptible locked-target rituals, anchor collapse and a curse that lasts through the next full round. Existing instant VFX are reused; enemy portraits and the 3D entrance are described in the art pass above.

- PostgreSQL-backed campaign action/RNG snapshots, revision checks, account ownership validation and idempotent requests survive loss of in-memory sessions. An account/theme/tier ledger records first clears once; prototype entry/retries are free and no uncalibrated Dust or unfinished cosmetics are awarded. PvP/Train retain their existing rules. Mock mode provides formation preview only; campaign play requires the live service.

- VFX test mode now lets users add/remove ally and enemy test cards independently, up to six per side, while keeping duel/full/PvE presets. These controls sit at the top of the panel. Spell targets support every count from 1 to 6 with step controls and actual-hit feedback.

- Paused prototype retained for reference: Three.js VFX scene with real 3D ground registration, mesh meteors/ice/lightning/light columns/arrow rain, animated shader fire, debris and expanding ground rings. DOM slot positions are raycast to the 3D ground on camera movement and resize.
- The VFX test mode adds a Delivery selector to compare automatic, instant and direct effects on the existing four-versus-six battlefield.
- The paused 3D prototype is not loaded by current battles. Reduced motion retains static result feedback. Unavailable WebGL or a failed 3D chunk falls back to direct effects; offscreen/hidden rendering pauses, and mesh/GPU resources are disposed when the cast changes or the layer unmounts.

- Direct grouped skill presentation: one cast fans projectiles out to all affected targets; melee acts once while each target receives its own impact, number and status feedback. Reduced motion keeps static result feedback.
- Cast events expose `actionId`, `targetIndex` and actual `targetCount`; playback waits for all impacts and buffers incomplete live casts. Legacy events remain compatible.
- `pve_4v6` battle/session mode supports up to four player units against six enemies with six visible slots, preparation, manual/REST and automatic resolution; invalid sizes are rejected. The subsequent Void Labyrinth prototype adds campaign progression and a first-clear ledger; calibrated reward payouts remain planned.
- Existing VFX test mode now offers 1v1, 6v6 and PvE 4v6 formations, 1/3/6 targets, group healing and enemy statuses using the shared battle renderer.

- Regression tests for area targeting, single MP payment, passives, independent buffs, status timing, replay snapshots, and forged portrait persistence.
- Repository instructions require maintaining this changelog with subsequent gameplay, API and persistence changes.

### Planned

- [Further Chronicle 3D presentation](docs/void-labyrinth-art-direction.md#further-3d): room geometry and traversal camera, a spatial ten-node route, a depth-aware battle environment, and detailed environment props while monsters remain cards. These are unimplemented presentation plans with acceptance criteria; existing names, server combat/targeting/costs, player portraits and the paused skyfall decision remain constraints.

- [Void Labyrinth phase-one design](docs/pve-void-labyrinth-v1.md) and [30 draft encounter configurations](docs/data/void-labyrinth-v1.encounters.json): three fixed challenges for deployed team BP totals of 1000, 5000 and 10000 share a ten-node maze, with different enemy compositions and 1/2/4-target boss rituals. Defines enemy budgets, art direction/assets, instant VFX, camps, checkpoints, free retries, finite first-clear rewards and acceptance scenarios. A first prototype now implements campaign scripts, PvE targeting/resources/victory rules, persistence and a first-clear ledger. Authored art, full telegraph presentation, economy payouts, offline/player-automatic control and calibrated balance remain planned; skyfall stays paused.

- [Battle feature contract](docs/battle-feature-contract.md): versioned relic/enchantment effects with family mappings and bounded budgets; general-mode front/back protection, shields, cleanse, cooldowns, summons and guard remain planned. Void Labyrinth now has its own playable ten-node prototype with a PvE targeting version; it does not silently change other modes.

### Validation

- Dark-sky environment pass: targeted lint, TypeScript and Vite production checks pass; desktop and 390px previews confirm the real 3D canvas, tier selection, single-canvas re-entry and no page errors. Static rest poses/reduced-motion scheduling and resource cleanup are inspected; OS motion preference was not toggled. One desktop sampling reports 95 main render calls and 162 on a shadow update; these are not a hardware FPS benchmark. Generated concept/fallback assets, prompt provenance and local links are checked. Combat logic was untouched.

- Art/localization pass: 143 frontend tests pass, 49 targeted PvE rule/PostgreSQL tests pass, and the preceding shared-rule/API run passed 113 tests. Targeted lint and TypeScript/Vite build pass. Browser inspection confirms a live Three.js canvas, nine loaded creature portraits, tier and bestiary changes, four-hero limit, BP sum, duplicate-position feedback and desktop/390px presentation. These are UI and rule checks, not normal-BP difficulty calibration or authenticated browser combat.

- Void Labyrinth prototype: backend regression suites cover existing modes and campaign rules; PostgreSQL integration tests exercise free authoritative creation, access control, stale/idempotent requests, full-route completion and first-clear uniqueness. Frontend tests cover non-mutating portrait enrichment, live totals, ritual/mechanism presentation and catalog consistency; production build passes. 176 backend tests pass across unit and PostgreSQL integration suites; 142 frontend tests pass; production build and diff whitespace checks pass.

- Browser checks cover mock tier selection, four-card formation, BP totals, duplicate-slot feedback and 390px layout with no page errors. Starting an isolated live-login browser test service was rejected by automatic approval review (“blocked by policy”); actual live browser combat remains unverified. Runtime API flow is verified separately by PostgreSQL tests. Temporary art and initial budgets are not a finished art pass or balanced release.

- Void Labyrinth design: static checks cover all 30 encounter budgets, three BP tiers, unique legal slots, six-enemy limits, node/branch coverage, deterministic stat costs, role/controller references and local document links. No runtime code changed; no battle simulation, playable campaign verification or final art was produced in this planning change.

- Custom VFX formation changes: 139 frontend tests pass with one worker; production build and diff whitespace checks pass. The initial parallel run hit a timeout in an existing instant-particle test, resolved on the full single-worker rerun.

- Instant substitution passes canonical effect mapping, legacy sky compatibility and non-mutating event tests. Production output contains no 3D skyfall chunk.
- The current browser preview could not connect through the in-app browser, although the local server returned HTTP 200. This substitution is validated by regression tests/build; a fresh visual check remains pending.

- Earlier prototype VFX browser check: 3D meteor/ice/lightning descent on six enemy slots, four-ally healing with independent result numbers, and switching between skyfall/direct delivery.
- Skyfall policy, elemental geometry profiles, bounded impact timing, perspective ground projection, moved/resized slots and visual-only delivery metadata have regression coverage.
- 3D effects use procedural geometry/materials. Authored models, richer textures, sound and mid-range device profiling remain future polish.

- Backend: 128 passing tests, including PostgreSQL-backed API integration tests and combat regressions.
- Frontend: 139 passing tests; TypeScript/Vite production build passes.
- Earlier VFX browser check: six-projectile fan attack against six enemies, four-ally healing with independent numbers, three-target melee after changing the primary slot, and one shared effect canvas.
- Earlier browser smoke check: the local preview renders, and the enchant dialog clearly shows the pending combat-effects notice before binding; no browser errors were observed.
- `git diff --check` passes. The existing large-bundle and outdated Browserslist notices remain.
- Portrait persistence restores newly forged cards. Previously saved cards without an image cannot be recovered from the old records alone.
