# Source Lookup Verification

Date: 2026-09-06. This is the current iteration record. Earlier journal,
investigation and logistics work is documented separately.

## Player Behavior

All 20 story readers now search their actual API excerpts, highlight literal
matches, cycle backward/forward and clear the search. Enter and Shift+Enter
cycle matches; an IME composition confirmation does not. Matching retains the
original text and UTF-16 offsets. The reader still identifies the author and
states that the source is an excerpt, not the complete work.

Four core worlds have 18 reviewed source passages. A current scene can locate
its associated original paragraph directly. The journal exposes passages only
after a related scene was visited or a related clue was earned. Each passage
explains the boundary between the original premise and the game's additions.
Future Island explicitly identifies its retained workboat as a divergence from
the source's destruction of aircraft and ships.

Opening a passage from the journal replaces the journal dialog. Returning by
the footer or Escape restores its tab, scroll position and exact clicked link,
including when two clues point to the same passage. Reading changes no choices,
resources, clues or paragraph progress. A missing quotation produces a visible
warning and retry, never a fabricated insertion. Repeated quotations produce an
ambiguity warning. The whole excerpt remains available for manual inspection.

## Verification

- `npm.cmd test`: 138 passed, 0 failed. The 12 new source-reader tests cover
  literal metacharacters, Unicode offsets, trimmed CRLF paragraphs, cross-line
  highlights, exact/overlapping quotations, route-dependent visibility, rewind,
  and invalid metadata. Existing world, save and API tests remain passing.
- `npm.cmd run build`: passed, including TypeScript checking.
- `.local/verify-source-reader.mjs`: passed for all 20 original readers and all
  18 exact, unique quotations in the served source content. The displayed
  paragraphs reconstruct the actual original excerpt text. Total source length
  remains 59,630 characters.
- Real browser flows passed at 1440 x 900, 390 x 844 and 320 x 844: onboarding,
  game-to-original lookup, match cycling, keyboard/IME, no results, clear,
  journal/clue return, focus restoration, unchanged game state, and cross-world
  source attribution. A browser-only simulated changed excerpt exercised the
  missing-anchor warning and successful retry; source caches were not changed.
- Browser checks confirmed no horizontal overflow, readable active highlights,
  visible return controls, one dialog at a time and no page JavaScript errors.
  Screenshots were opened and inspected, including narrow-screen source notes,
  journal links and missing-anchor feedback.
- The bundled develop-web-game client ran after the final UI changes. Its
  screenshot was opened and inspected. Its Node package-type warning belongs to
  the installed client, not a browser/application error.

Current browser evidence: `output/playwright/source-lookup/report.json`.
Screenshots and the bundled client's results are in the same directory.
Passage provenance: `docs/source-passages-core-review.md`.

## Remaining Work

The catalog still contains 20 worlds, 379 nodes, 805 choices and 69 endings.
This iteration adds no new story branches or artwork. The other 16 worlds have
searchable original readers but do not yet have curated scene-to-source links.
Further source-bound gameplay and narrative depth remain needed.

The 30-design art requirement remains incomplete. Previously recorded coverage
contains two root-reviewed independent designs, not user acceptance of the
finished visual set. At least 28 additional designs and matching scene/cast
coverage remain. No image generation or new credit check occurred this round;
recovery from the earlier terminal OpenQI 402 is still unconfirmed. The original
24-hour development requirement and overall project acceptance remain unmet.

Local server: `http://127.0.0.1:4173`, hidden process PID 36408 at verification.
