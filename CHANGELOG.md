# Changelog

All gameplay and player-facing changes are recorded here. This log starts on 2026-10-08; older releases have not been reconstructed.

## Unreleased

### Fixed

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

- Skyfall development is paused. Multi-target spells now reuse the existing instant particle/impact system, with simultaneous per-target feedback in a single cast. Active combat no longer imports or starts the Three.js layer.
- Delivery choices are now Auto / Instant / Direct. Saved `sky` choices map to `instant` so older prototype records remain playable. Targeting, costs, damage, statuses and replay snapshots are unchanged.

- Paused prototype: multi-target elemental/support skills previously used a 3D skyfall: warning on the target region, falling objects or columns, then impacts. Physical swipes and gunfire retain direct delivery. The caster stays in place during skyfall.
- Skills may set `VFX_PRESENTATION` to `auto`, `instant` or `direct` (legacy `sky` maps to `instant`); server/local events preserve normalized `vfxPresentation`. This choice affects presentation only.

- Passive semantics are explicitly defined as once-per-battle opening effects. Named periodic statuses tick from the following round; duration is stated in rounds, except stun which counts skipped actions.
- Newly generated passives are limited to support effects, and generated status duration is bounded to 1–3 rounds/actions. Named statuses receive an executable effect if a model omits its marker.
- Relic, enchantment and market views explicitly label their combat effects as planned, rather than presenting saved metadata as an active bonus.
- The generation prompt and skill inspector describe only supported mechanics. Nearby-BP matchmaking, free Train practice, ranked stakes and existing revival prices are preserved.

### Added

- VFX test mode now lets users add/remove ally and enemy test cards independently, up to six per side, while keeping duel/full/PvE presets. These controls sit at the top of the panel. Spell targets support every count from 1 to 6 with step controls and actual-hit feedback.

- Paused prototype retained for reference: Three.js VFX scene with real 3D ground registration, mesh meteors/ice/lightning/light columns/arrow rain, animated shader fire, debris and expanding ground rings. DOM slot positions are raycast to the 3D ground on camera movement and resize.
- The VFX test mode adds a Delivery selector to compare automatic, instant and direct effects on the existing four-versus-six battlefield.
- The paused 3D prototype is not loaded by current battles. Reduced motion retains static result feedback. Unavailable WebGL or a failed 3D chunk falls back to direct effects; offscreen/hidden rendering pauses, and mesh/GPU resources are disposed when the cast changes or the layer unmounts.

- Direct grouped skill presentation: one cast fans projectiles out to all affected targets; melee acts once while each target receives its own impact, number and status feedback. Reduced motion keeps static result feedback.
- Cast events expose `actionId`, `targetIndex` and actual `targetCount`; playback waits for all impacts and buffers incomplete live casts. Legacy events remain compatible.
- `pve_4v6` battle/session mode supports up to four player units against six enemies with six visible slots, preparation, manual/REST and automatic resolution; invalid sizes are rejected. Campaign nodes, progression and rewards remain planned.
- Existing VFX test mode now offers 1v1, 6v6 and PvE 4v6 formations, 1/3/6 targets, group healing and enemy statuses using the shared battle renderer.

- Regression tests for area targeting, single MP payment, passives, independent buffs, status timing, replay snapshots, and forged portrait persistence.
- Repository instructions require maintaining this changelog with subsequent gameplay, API and persistence changes.

### Planned

- [Void Labyrinth phase-one design](docs/pve-void-labyrinth-v1.md) and [30 draft encounter configurations](docs/data/void-labyrinth-v1.encounters.json): three fixed challenges for deployed team BP totals of 1000, 5000 and 10000 share a ten-node maze, with different enemy compositions and 1/2/4-target boss rituals. Defines enemy budgets, art direction/assets, instant VFX, camps, checkpoints, free retries, finite first-clear rewards and acceptance scenarios. Campaign scripts, front/back targeting, PvE resource/timeout rules, persistence and rewards remain unimplemented; skyfall stays paused. Budget, reward and success-rate targets require playtesting.

- [Battle feature contract](docs/battle-feature-contract.md): versioned relic/enchantment effects with family mappings and bounded budgets; front/back protection, shields, cleanse, cooldowns, summons, guard, and a concrete ten-node PvE adventure. These designs are not yet implemented.

### Validation

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
