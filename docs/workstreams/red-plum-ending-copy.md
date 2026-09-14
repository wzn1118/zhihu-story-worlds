# Red Plum Ending Copy / 2026-09-07

Latest user task: the attached ending screenshot is abstract, machine-like and
hard to understand. This is a targeted copy correction, not new-story production
or an artwork task. Target: red-plum / b_village_small, story1930445234262750503.

The original omits what damaged the houses, who rescued the residents and how
the empty shelter differs from the vegetable greenhouse. It replaces these
events with abstract claims about ability, scope and promises. The corrected
ending names the threat, doctor's rescue, temporary shelter, limited harvest,
night watch and Hongmei declining to lend her daughter again. No claim is made
that the player completed a rescue before choosing an early retreat.

Only content/catalog-b-red-plum.ts's selected ending title and two paragraphs
are changed; choice IDs, conditions, resources, world version, other endings,
original excerpt and shared source files remain unchanged. New tests exercise
every incoming choice and restoration of existing saves. Existing exact-match
editorial layers continue to apply to unrelated text.

Pre-edit actual API baseline: output/red-plum-ending-20260907/before.json.
Shared4173 listener is PID34880, verified as the existing Node server before
reload. One bounded reload is planned after tests/build pass, for this new
user-requested correction; no creative or art worker will be stopped/restarted.
Browser acceptance and final PID will be appended after actual verification.

## Verified Result

Shared4173 was reloaded once from34880 to25672 after the successful build and
focused checks. The listener and exact Node command were verified before the
stop, and the new listener was checked afterward. No other process was stopped.

61 related tests passed (tests.log), including12 reachable incoming edges and
both ID-based/text-only old saves. Production build passed (build.log), with
only the existing bundle-size warning.

Actual browser acceptance: output/red-plum-ending-20260907/verification.json.
Desktop1440x1000 and mobile390x844 each passed early retreat, late retreat and
import/load of a pre-edit ending save constructed from the frozen live API
snapshot. The late path has food=0, with its state preserved. The real API
comparison permits only the target ending title and two paragraphs plus their
ending metadata mirrors; every other field except recompiled Ink is identical.
There were zero page errors or horizontal overflows.

Inspected current desktop-late.png, mobile-old-save.png and the skill client's
skill-smoke/shot-0.png in the same output directory. Old API baseline before.json,
current after.json, source attribution and mechanics comparison are retained.
No generated-story registry, paid image job, authored aggregate file or original
excerpt was changed. The ending's art source now differs because its prose was
corrected; existing service source-hash checks still govern any future artwork.
No commit was made. This is only a response to the user's selected copy defect,
not a new acceptance claim for the entire catalog's prose or artwork.

## Choice Presentation Follow-up / 2026-09-07

The next user request was that choices must not state their outcomes. App now
renders only each action and negative resource cost. It omits choice hints (the
former result/risk preview) and positive resource gains until after the click;
the existing `hint` fields remain stored for editorial review and save/schema
compatibility. Locked-choice explanations still show missing evidence/resources
because they explain why an unavailable action cannot be selected.

All 1,941 choices across the 20 playable worlds have no parenthetical text.
Focused presentation/outcome/resource tests pass, and the full suite is 645/645.
Build passes with the existing bundle-size warning. Fresh real browser runs for
both imported stories pass all endings, source reading, saves, pressure exits,
and assert that no `.choice-button` renders a hint. Inspected screenshot:
output/playwright/generated-stories/import-0b3ce5e1-1f96-474d-871d-5e2a2a541713-2026-09-06T19-40-38-194Z/desktop-opening.png.
