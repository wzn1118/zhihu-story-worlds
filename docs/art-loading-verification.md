# Artwork Loading Verification

Verified in the actual browser on 2026-09-06. This concerns delivery behavior,
not new image generation or final visual acceptance.

## Reproduced And Fixed

A temporary HTTP 503 on Fang Nuo's main image left the current scene without
the character after connectivity recovered. Text could advance, but the image
had no in-place retry. Evidence before the fix:
`output/playwright/art-loading-20260906/before/verification.json`.

`src/App.tsx` now exposes a compact retry tool when the requested background or
character is unavailable or replaced by a fallback. Retrying remounts the image
requests without changing the session, paragraph or choices. Loading images stay
hidden until their own source loads; image containers retain their dimensions.
Background debug state now records requested and resolved paths, actual image
size, delivery status and fallback use. Character state retains the same
distinction, including main used temporarily for reaction.

No automatic retry loop or paid service call is involved. The retry fetches
already published local assets; it cannot generate missing art or cure the
OpenQI account condition. Scene changes start a new background request lifetime.

## Current Evidence

Runner: `.local/verify-art-loading.mjs after`.
Results: `output/playwright/art-loading-20260906/after/verification.json`.
Six browser cases passed with zero JavaScript page errors:

1. Main sprite 503, network recovery and explicit retry: portrait returns while
   training paragraph 2/3 and choice count remain unchanged.
2. Held background and main requests at 320x740: both report loading, text and
   choices work, and scene/portrait/dialogue/choice rectangles are identical
   before and after successful delivery.
3. Reaction 503: main is accurately reported as the fallback, then retry restores
   reaction without changing the test scene or decision history.
4. Background 503: cover fallback is accurately reported; retry restores the
   training-room source without advancing the paragraph.
5. Reaction delivered after leaving test for desk at 844x390: no stale character
   reappears, and current scene state remains correct.
6. All images 404 at 320x740: choices and journal work, retry tool fits, no
   horizontal overflow, and paragraph/modal changes cause no automatic retries.

Screenshots `slow-delivery-320.png`, `missing-images-320.png` and
`recovered-character.png` are in that current results directory. The first two
were opened and inspected. The required bundled game client also ran; its
latest screenshot under `output/playwright/art-loading-20260906/skill-client/`
was opened and inspected. Production build and TypeScript check passed.

An initial extended runner attempt read choices before the React render settled;
the next attempt put its wait in the wrong scene. Both were runner failures,
corrected by waiting for the actual target choice. The final result file above
comes from the completed six-case run. Existing 38 engine/source/save tests were
not rerun for this frontend-only change; their prior passing record remains in
`progress.md`.

## Art Still Missing

The existing coverage audit still applies: two nodes with matching reviewed
layers, 15 with legacy background use, and 54 with missing background files.
Only Fang Nuo has a reviewed pair. New scene and cast production plans are
preparation, not accepted images. Further generation remains blocked by the
terminal OpenQI HTTP 402 until the configured account is replenished.
