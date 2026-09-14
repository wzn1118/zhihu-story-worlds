# Current Playability Audit

Audited at 2026-09-06 05:19 Asia/Shanghai against the running application at
`http://127.0.0.1:4173`. This is the current frontend audit, not a new art delivery.

## Result

No functional blocker remained in the tested library, onboarding, source-reader,
play, notes, save-transfer and ending workflows after the fixes below. All four
worlds were entered through the real library and played to an ending. This audit
does not replace the existing exhaustive 71-node/129-choice/13-ending checks and
does not claim final visual acceptance.

## Fixed In This Audit

1. Long ending content was centered above its scroll container. At 320x740, the
   content began at y=17.58 while its container began at y=54; at 844x390 the
   ending title was clipped even at scrollTop=0. The ending now uses start
   alignment with automatic vertical margins, retaining centering when it fits.
   Content starts at y=89 on mobile and y=114 in landscape and remains scrollable
   through the ending actions. Changes: `src/styles.css`.
2. A scene transition retained the document's prior scroll position in short
   landscape windows, sometimes opening an ending with the game toolbar above
   the viewport. A new world/node now resets document scroll to the top.
   Observed ending scrollY changed from 129 to 0. Changes: `src/App.tsx`.
3. The long Double Pursuit author/title was an atomic inline button inside an
   ellipsized footer. At 320px the browser elided the button itself; normal
   Playwright pointer clicks were intercepted by the parent and could not open
   the original excerpt. The footer is now a flex row and only the button's text
   is ellipsized. Normal clicking opens the reader and returns to the same page.
   Changes: `src/styles.css`.

## Current Evidence

- Browser runner: `.local/playability-audit.mjs`; evidence assertions:
  `.local/check-playability-evidence.mjs`.
- Successful current run:
  `output/playwright/playability-audit-20260906/after/verification.json`.
- Before/after ending images:
  `output/playwright/playability-audit-20260906/before/ending-landscape-top.png`,
  `output/playwright/playability-audit-20260906/after/ending-landscape-top.png`,
  `output/playwright/playability-audit-20260906/after/ending-mobile-320.png`,
  `output/playwright/playability-audit-20260906/after/ending-mobile-bottom.png`.
- Footer reproduction:
  `output/playwright/playability-audit-20260906/before/source-footer-320.png` and
  `output/playwright/playability-audit-20260906/before/source-footer-verification.json`.
  Current working reader:
  `output/playwright/playability-audit-20260906/after/source-reader-mobile.png`.
- Actual exported/imported save:
  `output/playwright/playability-audit-20260906/after/current-save-transfer.json`.
- Required skill client ran after the final CSS change; its screenshot was opened
  and inspected:
  `output/playwright/playability-audit-20260906/skill-client-final/shot-0.png` and
  `output/playwright/playability-audit-20260906/skill-client-final/state-0.json`.

Current checks include science-fiction filtering; author search and no-results
state; bookmark persistence; guide and world introduction; a long-title source
reader with preserved game position; notes and reading settings across reload;
Enter/number-key progression without triggering shortcuts inside a text field;
real manual-save download, preview, explicit destination, import and load;
ending history and archive; and maximum text size at narrow/landscape sizes.
Four naturally scrollable paragraphs also advanced without retained internal
scroll offsets, so no speculative paragraph-scroll change was made.

| World | Actual Reached Ending | Choices |
| --- | --- | --- |
| Blue Blood | `ending_return` | 11 |
| Double Pursuit | `ending_evidence` | 12 |
| Velvet Alibi | `ending_equal` | 8 |
| Future Island | `ending_witness` | 13 |

The browser recorded zero JavaScript page errors and no tested scene with missing
choices, horizontal overflow or chapter/choice overlap. `npx.cmd tsc --noEmit`
passed. Existing exhaustive backend tests were not repeated for these frontend
layout changes.

## Remaining Limits

Only five files exist under `public/assets`: the Blue Blood cover, legacy station,
training room, and Fang Nuo main/reaction portraits. Double Pursuit, Velvet Alibi
and Future Island currently have no usable scene image at their referenced paths;
their dark scene surfaces are visible in this audit's `after/*-entry.png` and
`after/*-ending.png` screenshots. Blue Blood locations beyond the calibrated
opening still reuse legacy imagery. These are known visual-delivery gaps, not
successful art coverage or user-approved final character designs.

The unresolved OpenQI HTTP 402 remains the reported image-production blocker.
This audit accessed no credentials and submitted no image requests. Additional
matching backgrounds and casts still require completion before final visual
acceptance. The current 24-hour development goal remains active.
