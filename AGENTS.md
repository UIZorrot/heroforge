# Repository working instructions

## Command output

Any command with unknown or potentially large output must be byte-capped. Use a bounded head/tail capture (about 3 KB each by default), including for tests, builds and searches.

## Change history

- Update `CHANGELOG.md` under `Unreleased` for every change to gameplay, player-facing behavior, APIs, persistence, or a committed feature design.
- Explain the resulting behavior, not just the changed filenames. Record validation and material compatibility limits.
- Put completed fixes under `Fixed`, new working features under `Added`, rule changes under `Changed`, and unimplemented designs under `Planned` with a document link. Never describe a design as implemented.
- At release, move the accumulated entries into a dated version section and create a new `Unreleased` section. Do not invent historical releases.

## Current gameplay direction

- Preserve nearby-BP matchmaking and lore-based hero power unless the user requests a change.
- Train lets players practice with their own cards without ranked stakes or card-death costs.
- Missing combat features need concrete rules and acceptance scenarios in `docs/battle-feature-contract.md`, with implementation status stated accurately.
- Keep manual, automatic, REST, and local-preview combat consistent where they share a mechanic. Test both resolved effects and resource costs.
