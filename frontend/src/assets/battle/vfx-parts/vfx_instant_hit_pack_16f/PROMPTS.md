# Generation prompt set

Generated with the built-in `imagegen` workflow. The original 9-frame sheets remain the semantic anchors for `strike.png` and `claw.png`; their silhouettes were expanded to 16 chronological frames without adding a generic impact ring.

## Shared production specification

- Production-ready game VFX sprite sheet for a browser card battle.
- Exactly 16 chronological frames in an exact 4 columns × 4 rows grid, row-major.
- Perfectly uniform pure-black cells with no dividers.
- Frames 1–2 anticipation, 3–5 compression, 6–8 impact peak, 9–12 pressure response and traveling fragments, 13–16 extinction.
- One stable center and camera, at least 12% cell padding, no cross-cell elements.
- Premium AAA real-time fantasy VFX texture language: crisp high-frequency detail, restrained bloom, physically coherent material response, controlled highlight rolloff.
- No text, labels, numbers, borders, watermark, logo, duplicated frames, flat white blobs, or blurry glow-only rendering.

## Effect-specific prompts

- `strike`: one razor-straight silver-white diagonal weapon cut from bottom-left to top-right; tiny contact glint, growing blade line, compact asymmetric peak, then sparse needle fragments along the same axis. No ring or round explosion.
- `instant-bullet-hit`: compact ballistic entry; one dominant directional streak, compressed ring, brass and steel chips.
- `pierce`: a precise desaturated edit of `instant-flesh.png`; the original three piercing streaks, impact ring, fragments, layout, and timing are preserved while crimson is replaced by silver-white and cold steel gray.
- `claw`: exactly three coherent blood-crimson curved gouges sweeping upward-right from one lower-left origin; narrow bone-white peak cores, shredded arc residue, and sparse wound flecks. No ring, central explosion, or fourth claw.
- `smash`: heavy blunt compression; short force wedges, fractured stone and iron-gray debris.
- `fire-instantFire`: focused combustion hit; directional flame tongue, heat ring, cinders and char fragments.
- `explode-instantFire`: round high-pressure detonation; incandescent shell, asymmetric flame spikes, far-traveling embers.
- `frost-instantFrost`: crystalline spear growth and radial shatter; frozen pressure ring, faceted ice splinters and cold mist grains.
- `dark-instantVoid`: inward collapse around a near-black core; fractured violet rim followed by a reverse shock ring.
- `light-instantHoly`: precise sacred judgment; restrained cross-like star, thin concentric halo, glassy aged-gold motes.
- `magic-instantMagic`: violet arcane prism impact; asymmetric crystalline rays, thin geometric ring and prism fragments.
- `nature-instantNature`: seed-bright thorn impact; fibrous pressure ring, bark splinters and sparse torn leaf fragments.
- `poison-instantNature`: corrosive chemical hit; unstable toxic membrane, acidic needles, viscous droplets and oxidized residue.
- `thunder-instantStorm`: branching ionized filaments; electric compression core, thin ionization ring and fast sparks.
- `water-instantWater`: high-pressure crown splash; circular pressure wave, curved translucent sheets, droplets and mist grains.
