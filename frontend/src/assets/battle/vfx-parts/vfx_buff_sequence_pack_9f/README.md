# 9-frame buff sequence pack

Every file is a 3 x 3 sprite sheet containing nine chronological frames.

- The portrait card perimeter is registered at the same position in every frame.
- The card artwork opening remains empty and black.
- Only material highlights and small particles move; the frame itself never translates, rotates, scales, or breathes.
- Frame 9 connects back to frame 1 for a persistent loop.

Files: `buff-stun.png`, `buff-frozen.png`, `buff-poison.png`, `buff-wound.png`, `buff-curse.png`, `buff-bless.png`, `buff-heal.png`, `buff-haste.png`, `buff-pray.png`, `buff-weakness.png`, and `buff-vulnerable.png`.

Generated with the built-in image generation tool. `buff-frozen.png` established the fixed layout; the remaining sheets used it only as a composition and registration reference, with independent material prompts for each status.
