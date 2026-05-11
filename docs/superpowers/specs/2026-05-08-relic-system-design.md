# Relic System Design

> **Purpose:** Define a two-track relic system for Hero Forge: low-tier functional relics for drops and forge bias, plus named relics with stronger gameplay effects and narrative value.

**Goal:** Build a relic system that supports gameplay progression, worldbuilding, and collectible identity without turning relics into generic stat sticks.

**Architecture:** Relics are typed inventory assets with a shared backend ledger and a shared display vocabulary. Low-tier relics provide broad acquisition and functional bias; named relics provide stronger effects, lore, and collector appeal. Both types use the same ownership and transaction model, but they differ in rarity, provenance, and effect depth.

**Tech Stack:** Flask, PostgreSQL, resource transactions, React, TypeScript, icon generation prompts.

---

## 1. Design Principles

1. Relics should feel like artifacts, not materials.
2. Low-tier relics should be common enough to support progression and drops.
3. Named relics should be desirable because of story, style, and effect identity.
4. Relics should shape outcomes and build direction more than raw combat power.
5. Visual identity matters: every relic needs a recognizable icon silhouette.
6. The same backend ownership model should support both relic classes.

---

## 2. Relic Taxonomy

### 2.1 Low-tier relics

Low-tier relics are the basic relic layer. They are:

- elemental or thematic,
- easy to drop,
- easy to understand,
- useful for Forge bias and light progression,
- not overly unique in effect language.

Examples:

- Ember
- Frost
- Radiance
- Void
- Storm
- Beast

These are the relics that should appear frequently in early PvP reward tables, Chronicle floor rewards, and future daily systems.

### 2.2 Named relics

Named relics are specific objects with a title, backstory, and stronger design identity.

They are:

- rarer,
- more narrative-heavy,
- more collectible,
- allowed to have stronger or more specialized effects,
- still readable by family and effect profile.

Examples:

- Echo Heart
- Ashen Crown
- Oath Lantern
- Frostbound Reliquary
- Storm Choir Bell
- Grave Key of Auralis

### 2.3 Limited relics

Limited relics are event, season, or special edition relics.

They are:

- highly collectible,
- visually distinctive,
- not required for the core progression loop,
- allowed to be stronger or stranger, but only within limited distribution rules.

This spec does not require limited relic implementation now. It only reserves the category.

### 2.4 Tier and key naming

Use two separate fields:

- `relic_type`: internal slug key, stable for code and inventory
- `display_name`: player-facing title, allowed to be dramatic

Suggested slug style:

- low-tier relics: `low_fire_shard`, `low_frost_shard`, `low_void_shard`
- named relics: `named_echo_heart`, `named_ashen_crown`, `named_oath_lantern`
- limited relics: `limited_blood_moon_seal`

Tier ladder:

- `common`: low-tier functional relics
- `rare`: named relics with focused identity
- `epic`: named relics with stronger or stranger effects
- `legendary`: very rare named relics with strong lore and distinct mechanics
- `limited`: orthogonal edition flag, not just a power tier

---

## 3. Effect Model

Relics should use a small set of effect buckets:

1. Forge bias
   - shifts archetype, element, skill pool, or flash chance
2. Reward bias
   - increases odds of a class, element, or special tag appearing
3. Utility bonus
   - improves a specific system interaction, such as drop quality or revive efficiency
4. Conditional gameplay effect
   - a named relic may unlock a narrow special rule
5. Cosmetic identity
   - frame, icon, aura, or collection badge

Hard rule:

- Relics should not become plain +ATK / +HP items.
- If a relic gives combat value, it should do so through identity or conditional behavior, not simple inflation.

---

## 4. Backend Ownership Model

The backend should treat relics as two related layers:

### 4.1 Relic definition

Definition-level fields:

- `relic_type`
- `display_name`
- `tier`
- `family`
- `lore_summary`
- `effect_profile`
- `forge_bias`
- `battle_bias`
- `icon_prompt`
- `is_limited`

### 4.2 Player inventory

Player-owned data should continue to live in `user_relics`:

- `user_id`
- `relic_type`
- `amount`

This keeps ownership simple while allowing the catalog to grow independently.

### 4.3 Transaction ledger

Every relic gain or spend must emit a `resource_transactions` row with:

- `resource_type = relic`
- `resource_key = relic_type`
- a reason string
- a reference to the source event

Reasons should stay stable and human-readable.

---

## 5. Initial Relic Roster

This is the first roster I recommend shipping conceptually. It is intentionally split into low-tier and named relics.

### 5.1 Low-tier relic roster

| Relic | Tier | Family | Identity | Primary effect direction | Icon prompt |
| --- | --- | --- | --- | --- | --- |
| Ember Shard | Common | Fire | Cinder fragment from a burnt altar | Fire-aligned Forge bias, burn skill bias, aggressive archetypes | `soulslike item icon, ember shard, jagged red-orange crystal, charred metal prongs, floating ash, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Frost Shard | Common | Frost | Ice splinter sealed in old glass | Frost-aligned Forge bias, defensive and control skill bias | `soulslike item icon, frost shard, pale blue ice crystal, cracked silver mount, thin mist, cold glow, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Radiant Shard | Common | Light | Piece of a sun relic | Light-aligned Forge bias, healing and protection bias | `soulslike item icon, radiant shard, ivory-gold gem, halo ring, sacred metal filigree, soft divine glow, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Void Shard | Common | Void | Fragment from an empty shrine | Void-aligned Forge bias, curse and penetration bias | `soulslike item icon, void shard, dark obsidian crystal, thin purple void haze, broken rune ring, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Storm Shard | Common | Storm | Condensed lightning fragment | Storm-aligned Forge bias, speed and multi-hit bias | `soulslike item icon, storm shard, cobalt crystal with lightning vein, brass clamps, electric sparks, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Beast Fang | Common | Beast | Trophy from an ancient predator | Beast-aligned Forge bias, physical pressure and HP bias | `soulslike item icon, beast fang, bone talon pendant, leather wrap, primal scratches, warm amber rim light, black void background, centered composition, square icon, no text` |

### 5.2 Named relic roster

| Relic | Tier | Lore hook | Primary effect direction | Icon prompt |
| --- | --- | --- | --- | --- |
| Echo Heart | Rare | A jeweled pendant said to hold the last voices of a fallen kingdom | Raises chance of undead, memory, echo, or persistence-themed outcomes; slightly improves rare Forge tag odds | `soulslike item icon, echo heart pendant, cracked ruby heart set in gold frame, faint ghost silhouettes trapped inside, mournful halo, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Ashen Crown | Rare | A soot-black crown worn by the last ruler of a burned dynasty | Pushes regal, fire, leadership, and high-aggression archetypes; can bias flash frames | `soulslike item icon, ashen crown, burnt gold diadem, soot and ember residue, broken regal spikes, faint smoke, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Oath Lantern | Rare | A lantern sealed with a knightly vow that never went out | Biases paladin, guardian, and support outcomes; increases protection-themed skill tags | `soulslike item icon, oath lantern, iron lantern with sacred glass, warm white flame, engraved vow sigils, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Frostbound Reliquary | Rare | A small reliquary that preserves a winter saint's relics | Biases frost, defense, and control outcomes; can improve survival-oriented flash odds | `soulslike item icon, frostbound reliquary, silver reliquary box with ice seal, pale blue frost mist, ornate latch, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Storm Choir Bell | Rare | A bell once rung to summon a city-wide thunder rite | Biases storm, speed, accuracy, and multi-target skill outcomes | `soulslike item icon, storm choir bell, bronze ritual bell, crackling lightning ring, etched thunder patterns, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Grave Key of Auralis | Epic | A black key said to unlock the crypt of an erased kingdom | Biases void, death, curse, and rare grave-themed tags; strong collectible identity | `soulslike item icon, grave key, ornate black key with bone handle, violet grave mist, tiny coffin-shaped motif, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Mirror of the First Duel | Epic | A polished shard that remembers the first formal combat | Biases battle, mirror, retaliation, and accuracy-based outcomes; good for PvP identity | `soulslike item icon, mirror shard relic, cracked silver mirror, reflected sword silhouette, cold white glint, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Bone Rosary of the Silent March | Epic | Prayer beads made from soldiers who never returned | Biases endurance, formation, and mass-control skills; strong lore value | `soulslike item icon, bone rosary, black cord with ivory bone beads, rusted cross charm, faint ash trail, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Sunless Seal | Epic | A wax seal pressed under a starless sky | Biases void-light contrast, hidden power, and sealed power sources | `soulslike item icon, sunless seal, dark wax seal with broken sun sigil, gold crack lines, subtle red wax texture, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Harrow Glass | Epic | A glass vial containing a battlefield chorus | Biases crowd-control, wound, and damage-over-time skill pools | `soulslike item icon, harrow glass vial, cracked glass vessel, red-black fluid swirl, surgical brass frame, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Reliquary of the Last Gate | Legendary | A holy container taken from a city gate that never opened again | Strong defensive and guardian bias; may improve rare mythic frame chance | `soulslike item icon, last gate reliquary, cathedral gate miniature in silver reliquary, heavy lock, holy dust, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Thorn Votive | Rare | A candle wrapped in living briars | Biases nature, bleed, and self-sustain outcomes; useful for aggressive utility builds | `soulslike item icon, thorn votive candle, thorn-wrapped wax pillar, green ember flame, organic vine detail, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Sable Talisman | Rare | A charm carried by couriers through cursed roads | Biases speed, evasion, and stealth-like archetypes | `soulslike item icon, sable talisman, dark cloth charm, silver knot sigil, faint motion streaks, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Crownless Scepter | Epic | A broken scepter from a throne with no heir | Biases authority, buffs, and team support archetypes | `soulslike item icon, crownless scepter, broken royal staff, gold headpiece, fractured gem, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |

### 5.3 Limited relic examples

These are future-friendly placeholders, not core MVP requirements:

- Eclipse Medal
- Blood Moon Seal
- Frozen Cathedral Token
- Red Comet Fragment

### 5.4 Additional roster seeds

These are extra candidates for later expansion if the content pool needs more variety.

| Relic | Tier | Family | Identity | Primary effect direction | Icon prompt |
| --- | --- | --- | --- | --- | --- |
| Ash Fragment | Common | Fire | Black ember dust sealed in slag | Very basic fire bias, cheap drop, very common reward token | `soulslike item icon, ash fragment, blackened ember chip, cracked iron cage, soot dust, orange rim light, black void background, centered composition, square icon, no text` |
| Tide Shard | Common | Water | Salted glass from an old sea shrine | Water bias, recovery and fluidity themes, light support use | `soulslike item icon, tide shard, translucent blue glass crystal, salt ring, water droplets, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Iron Splinter | Common | Stone | A splinter torn from a fortress plate | Defense bias, bodyguard / armor direction, basic survival use | `soulslike item icon, iron splinter, dark steel shard, rivet ring, worn battle scratches, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Moon Ash | Common | Void | Ash that fell under a moonless rite | Light void bias, stealth and omen flavor, early rare roll helper | `soulslike item icon, moon ash, silver-gray ash clump, crescent sigil, pale haze, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Lantern of the Ninth Bell | Rare | Light | A pilgrimage lantern that only rings at dawn | Stronger holy / protection identity, shrine and vow effects | `soulslike item icon, lantern of the ninth bell, ornate golden lantern, nine tiny bell charms, holy flame, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Hollow Choir | Epic | Void | A bone choir that sings without mouths | Void and curse identity, control and dread aesthetics | `soulslike item icon, hollow choir relic, clustered bone chimes, black hymn ribbons, violet echo haze, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Warden's Tear | Epic | Frost | A frozen tear from a prison saint | Defense, endurance, and restraint identity | `soulslike item icon, warden's tear, clear frozen droplet in silver claw setting, ice mist, pale blue glow, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |
| Kingless Banner | Epic | Beast | A torn war banner that never bowed | Aggression and battlefield momentum identity | `soulslike item icon, kingless banner, torn red-black cloth banner, bone spear tip, weathered cloth folds, black void background, dramatic rim light, hand-painted fantasy detail, centered composition, square icon, no text` |

---

## 6. Functional Mapping

### 6.1 Low-tier relics

Low-tier relics should:

- drop from PvP at a small rate,
- appear in Chronicle and daily rewards later,
- bias Forge toward a family or element,
- be readable in inventory as basic functional resources.

They should be simple enough to explain in one sentence.

### 6.2 Named relics

Named relics should:

- carry a strong lore sentence,
- have a more distinctive icon silhouette,
- influence Forge more strongly,
- occasionally unlock unique special tags,
- feel collectible even if the player does not immediately use them.

They should be memorable enough to quote in marketing or event copy.

### 6.3 Limited relics

Limited relics should:

- be visually special,
- be rare and time-bound,
- support collection identity,
- create live-ops events without changing the core combat loop.

---

## 7. Icon Style Rules

If icon generation is automated, use a consistent prompt grammar:

- soulslike item icon
- centered object
- black or near-black void background
- dramatic rim light
- hand-painted fantasy detail
- no text
- square composition
- strong silhouette
- visible material language: metal, bone, stone, crystal, cloth, wax, glass, ash

Do not generate:

- busy scenes,
- character portraits,
- full environments,
- text-heavy layouts,
- UI frames that obscure the relic.

The icon must read as an item at small size first, and as a lore object second.

---

## 8. Recommended First Expansion Path

The first implementation pass should not try to ship every relic in this document.

Recommended first slice:

1. Implement the relic catalog model.
2. Ship 6 low-tier relics.
3. Ship 4 named relics.
4. Keep the icon prompt list as content data.
5. Wire PvP drop and future Chronicle hooks to the catalog.

Suggested first named set:

- Echo Heart
- Ashen Crown
- Oath Lantern
- Grave Key of Auralis

This gives the system:

- one emotional relic,
- one fire / ruler relic,
- one holy protector relic,
- one dark mystery relic.

That is enough to test whether the naming language and icon style feel right.

---

## 9. What This Spec Is Not

This spec does not yet define:

- the exact relic database schema,
- the Forge bias math,
- the market trading flow,
- the visual inventory UI,
- the limited relic sale system.

Those belong in the implementation plan once the catalog direction is approved.

---

## 10. Relic Production Notes

Use these rules whenever a new relic is added:

1. Decide the category first.
   - `common` for low-tier functional relics.
   - `rare` / `epic` / `legendary` for named relics.
   - `limited` only for time-bound or event-only relics.
2. Always define both `relic_type` and `display_name`.
   - `relic_type` is the stable code key.
   - `display_name` is the player-facing title.
3. Every relic must have a strong silhouette.
   - If it cannot be recognized at small size, the icon prompt is not ready yet.
4. Low-tier relics must stay simple.
   - One family, one bias, one sentence of lore.
   - They should be readable in one glance.
5. Named relics must earn their name.
   - Give them a real lore hook.
   - Give them a specific object form.
   - Avoid generic labels like "Ancient Relic" or "Mystic Charm".
6. No relic should be a plain stat stick.
   - Prefer forge bias, reward bias, conditional effects, or collection value.
7. Every relic entry must include an icon prompt.
   - The prompt should work for a Soulslike / dark fantasy item icon generator.
   - Keep the object centered, isolated, and readable.
8. Do not add relics directly into gameplay before they exist in the catalog.
   - Add catalog entry first.
   - Add drop or reward hook second.
   - Add UI rendering last.
9. Keep family language consistent.
   - Fire, Frost, Light, Void, Storm, Beast, Memory, and future families should remain visually coherent.
10. If a relic is not exciting as text, it will not become exciting after balancing.
   - Fix the concept before balancing the numbers.
