# Core Ending Browser Acceptance

Scope: the three actual incoming choices to `double-pursuit/ending_fall`, on
390x844 mobile and 1440x960 desktop. This lane owns only this report and
`.local/verify-core-causality-browser.ts`. Shared server `http://127.0.0.1:4173`
remains root-owned; no server restart, game-content edit or paid request occurs.

## Accepted Result / 2026-09-06 11:56 Asia/Shanghai

The six real UI playthroughs reached the corrected `ending_fall` title and all
three paragraphs. All six UI rewinds also reached the preserved alternative
ending. Three old-world save restorations passed against the currently served
world. The strict script result is **6 passed / 0 failed**, with no page errors,
console errors, HTTP errors or failed requests. All eighteen current screenshots
have been independently opened and inspected. This accepts the ending-copy,
gameplay and save-compatibility checks; scene-art coverage remains incomplete.

Current default evidence:
`output/playwright/core-ending-acceptance-20260906T035546Z/report.json`.
This run completed at `2026-09-06T03:56:07.196Z`. Root confirmed the test process
had ended before this independent artifact review. Root supplied and declared
`public/favicon.svg`, then updated the helper's begin-button selector to the
App owner's new label. This follow-up only read the completed report/screenshots
and updated this document; it launched no further test, service or paid request.
Earlier failure directories remain preserved in the history below.

| Incoming Choice | Viewport | Actual Choices | UI Alternative | Destination | Strict Result |
| --- | --- | ---: | --- | --- | --- |
| `p_climb_broken` | 390x844 | 9 | `p_roof_hide` | `ending_pursuit_loss` | Passed |
| `p_jump_gutter` | 390x844 | 11 | `p_wait_under_tank` | `ending_pursuit_loss` | Passed |
| `p_return_for_phone` | 390x844 | 13 | `p_descend_now` | `ending_roof_alive` | Passed |
| `p_climb_broken` | 1440x960 | 9 | `p_roof_hide` | `ending_pursuit_loss` | Passed |
| `p_jump_gutter` | 1440x960 | 11 | `p_wait_under_tank` | `ending_pursuit_loss` | Passed |
| `p_return_for_phone` | 1440x960 | 13 | `p_descend_now` | `ending_roof_alive` | Passed |

## What Was Exercised

The script follows real library and gameplay controls, records all 66 chosen
edges across six initial playthroughs, and captures the final decision and ending.
It then clicks the existing rewind control, confirms the rewind and takes the
zero-cost alternative through the actual UI. Only reading settings and completed
onboarding are preconfigured; no game progress is injected, API intercepted,
authored world overridden or generated asset substituted.

The shortest broken-stair path had no `p_roof_door` history entry and no floor-map
clue. Its revised ending therefore no longer depends on unseen map, gutter or
water-tank facts. The three final-choice states had `(focus, reserve)` values
`(1, 1)`, `(0, 1)` and `(0, 0)` respectively, and the alternatives remained
available. The latter two exercise zero-stamina exits; the third also has no
remaining battery. Every ending and alternative had no horizontal overflow.

Save checks re-created saves using the previous exported world and the normal
game engine, then restored them against the real HTTP world. This is an old-world
compatibility check, not a claim to have imported a user's private save through
the browser. All three retain version `1.2.0`, choice counts, resources and clues,
while presenting the revised ending paragraphs. The old world has the previous
map/gutter copy, as recorded alongside the corrected text in `saveChecks`.
Its source is `output/creative-core/double-pursuit.world.json`, SHA256
`a3e1bfd51c2df428b37405a0a0ebc5700873a2a8b54888704ec313c88ed8c373`.
The current HTTP world read took 356 ms in the accepted run.

The earlier path report at
`output/coordination/core-causality-20260906/paths.json` remains unchanged historical
input. Its old timestamp is recorded in the new report; the compatibility
assertions above were executed again by the accepted run and independently
checked in its three `saveChecks` records during this follow-up.

## Screenshots And Remaining Issues

All eighteen PNGs in `core-ending-acceptance-20260906T035546Z` were opened and
visually inspected in this follow-up. For every entrance/viewport the `-before`,
`-ending` and `-alternative` captures were reviewed. The corrected title, all
three ending paragraphs, choice counts, available and locked choices, rewind
result and ending controls are visible without incoherent overlap. The six
current result records all have empty `errors`, `consoleErrors`, `httpErrors`
and `failedRequests` arrays; the previous favicon error is absent.

All reviewed ending backgrounds are currently `unavailable` with `degraded: true`
and `source: null`. The state references include
`/assets/scenes/double-pursuit/ending_fall.webp`,
`/assets/scenes/double-pursuit/ending_pursuit_loss.webp`, and
`/assets/scenes/double-pursuit/ending_roof_alive.webp`. The screenshots visibly
use the dark fallback. These are missing scene-art coverage, not accepted native
4K images. This lane has not repaired, replaced or generated any artwork.

No service, worker or global process was stopped or restarted by this lane.

## Preserved History

- `output/playwright/core-ending-acceptance-20260906T034339Z/report.json`:
  initial strict 5/6 run. All gameplay and alternatives completed; the first
  mobile case logged an unspecified resource 404. Process ended with exit code 1.
- `output/playwright/core-ending-acceptance-20260906T034444Z/report.json`:
  diagnostic strict 5/6 run completed at `2026-09-06T03:45:19.064Z`, exit code 1.
  The sole console error was localized to `http://127.0.0.1:4173/favicon.ico`;
  an independent HEAD at 11:47 also returned 404. The HTTP world read took 515 ms.
  These two initial runs each had nineteen PNGs; all 38 were visually inspected
  during the earlier acceptance turn. Their extra failure captures were taken
  after the alternative ending had already been reached.
- `output/playwright/core-ending-acceptance-20260906T035238Z/report.json`:
  subsequent strict 0/6 run. All six cases timed out waiting for the former
  begin-button label after the App owner renamed it. The reports contain no
  page, console, HTTP or failed-request errors. Root corrected only the helper's
  selector and then produced the accepted `035546Z` run. This obsolete-selector
  result remains historical evidence, not a current gameplay failure.

None of these earlier results or screenshot files has been deleted or rewritten.

Reproduction: `node --import tsx .local/verify-core-causality-browser.ts` from
`E:/知乎`, using `C:/Windows/System32/cmd.exe` with `login: false`. Each execution
creates a fresh timestamped directory and preserves previous evidence.
