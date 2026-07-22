# Instant hit VFX — 16-frame rebuild

Production pack used by both the VFX test page and the battle renderer.

- Layout: 4 columns × 4 rows
- Frames: 16, row-major
- Source size: 1254 × 1254 px
- Frame rectangles: edge-safe rounded 313/314 px cells
- Frame duration: 18 ms
- Total sequence duration: 288 ms
- Runtime blend mode: screen

Motion structure:

1. Frames 1–2: anticipation
2. Frames 3–5: compression / ignition
3. Frames 6–8: impact peak
4. Frames 9–12: pressure response and material fragments
5. Frames 13–16: residue and extinction

Every effect uses a distinct material language rather than a recolored common explosion. The former 3×3/9-frame pack is preserved in the sibling `vfx_instant_hit_pack_backup_9f_2026-07-20` directory.
