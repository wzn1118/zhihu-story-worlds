# Fang Nuo: Current Sprite Pair

The latest user requirement is the supplied angular late-1990s character drawing
with stronger facial light and shadow. The gothic reference controls painted
environments. This pair is root-reviewed and installed for user review; it is
not described as individually approved by the user.

## Visual Result

- Main: `output/imagegen/fang-nuo-main-integrated-v3/fang-nuo-main.png`.
- Reaction: `output/imagegen/fang-nuo-reaction-integrated-v3/fang-nuo-reaction.png`.
- A connected hard shadow covers the near forehead, eye socket, cheek and jaw.
  The nose/front-face light strip and sclera stay readable. The reaction changes
  brow tension, upper lids and the slightly parted mouth.
- Hairline, narrow eye spacing, nose length, ear position, jaw, asymmetric wine
  panel, zipper, notebook, watch and body pose remain consistent. The notebook is
  on image-left, the watch on image-right. Both are original adaptation designs.
- The head remains somewhat softer in its chin than the supplied profile. The
  result is an original adult Fang Nuo, not the person in the reference image.

## Processing And Quality

Both final transparent PNGs are 2833 x 3777. The body source was 3072 x 4096;
the face edits returned 1254 x 1254 despite a requested 4K tier. To retain actual
pixels, the body was downsampled by 1254/1360 for assembly. No source was enlarged.
The crop perimeter blends into clothing/background, away from the face. See
`scripts/assemble-fang-nuo.py` and each output directory's `assembly.json`.

Background removal preserves original RGB and only modifies alpha. Exterior,
hair-loop, bent-arm and finger-gap background regions were inspected against
both pale and dark backdrops. The alpha mask has a one-pixel edge contraction
and a narrow antialiased boundary. Both eye interiors remain opaque. The scripts
and cutout metadata preserve the exact seeds used.

`/assets/fang-nuo-main.webp` and `/assets/fang-nuo-reaction.webp` retain transparency.
Hashes and generation records are in `current-delivery.json`. The cover combines
the separately reviewed 4096 x 2304 training room with the downscaled sprite;
it is a composite, not another claimed native full-scene generation.

## Game Integration

`training` uses main and `test` uses reaction. Both use the independent training
room. The library and story detail use the new matching cover. The runtime
supports expression fallback and hides missing character art without stopping
the story. Text diagnostics include requested and actually loaded expression,
source, dimensions and status.

Four real-browser viewport checks (1440 x 960, 1024 x 768, 390 x 844, 320 x 740)
confirmed story entry and main-to-reaction choice transitions, no face overlap
with controls, no horizontal overflow and no page exceptions. Evidence is under
`output/playwright/character-integrated-v3`. The latest alpha cleanup and cover
are checked again before the delivery checkpoint.

The Blue Blood Ink check passed all 679 reachable states, 17 scenes and 3
endings after the visual contract change. Build passed. Other world artwork and
the remaining Blue Blood locations are still pending; this is not a claim that
all game art or the 24-hour goal is complete.
