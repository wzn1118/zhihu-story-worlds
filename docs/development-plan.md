# Development Plan

Started: 2026-09-06 02:05:27 Asia/Shanghai.
Minimum horizon requested by the user: 2026-09-07 02:05:27 Asia/Shanghai.

The active Codex goal tracks the 24-hour requirement. No automation creation tool
is exposed in this session. Do not claim a background scheduler is installed or
that development continues while the application or machine is stopped. Save
handoff checkpoints so work can continue across goal turns without repeating
paid image requests.

Latest checkpoint: functional repairs, browser checks and production contracts
are completed for the current four worlds. Actual art generation remains blocked
by OpenQI HTTP 402, with no confirmation of replenishment across four goal turns.
The overall objective is not complete; the 24-hour minimum has not been fulfilled.

## Milestone 1: Working Vertical Slice

- [x] Download and inspect the exact beta Skill archive.
- [x] Back up the prior installed Skill outside auto-discovery.
- [x] Install the beta Skill and its compatible official CLI.
- [x] Store the supplied credential using stdin and verify authentication.
- [x] Verify the documented story API and retain source attribution.
- [x] Select a live source story in the frontend.
- [x] Enter an adapted world with background and onboarding.
- [x] Complete a branching story and resume a saved game.
- [x] Generate, inspect and integrate OpenQI art for the Blue Blood opening.
- [x] Verify desktop and mobile in a real browser.

Evidence: the four authored worlds and existing browser records in `progress.md`;
current Fang Nuo main/reaction, opening background and cover are recorded in
`docs/art/current-delivery.json`. This milestone does not complete all scene art.

## Milestone 2: Narrative And Visual Depth

- [ ] Expand source-grounded locations and adult character identity sheets.
- [x] Ensure independent branches change information, relationships and endings.
- [x] Test all endings and locked choices in the four current worlds.
- [ ] Give each world its own visual composition, sound and pacing.
- [ ] Review source-to-adaptation fidelity and adult-character consistency.

The four cached excerpts have received an independent source/prose review in
`docs/narrative-review.md`. Adult-character visual consistency remains incomplete
outside the reviewed Fang Nuo pair; the combined item therefore stays open.

## Milestone 3: Robustness And Usability

- [x] Test upstream failures, cached reads and source freshness.
- [x] Validate keyboard navigation, focus and reduced motion.
- [x] Check slow asset loading, narrow phones and landscape phones.
- [x] Validate corrupted saves, story version changes and storage failure.
- [x] Document backup, run commands, provenance and known limits.

Current verification: 38 automated tests pass, including explicit Blue Blood
revision migration and path-dependent Smith-couple clock reconstruction. The
independent browser audit in `docs/playability-audit.md` covers narrow and
landscape phones and repairs ending clipping, retained scene scroll and a hidden
source link. Six further actual-browser cases in `docs/art-loading-verification.md`
cover held delivery, transient failures, fallbacks, retries, permanent missing
files and late completion after scene exit. These delivery checks do not stand
in for the still-missing images or their final visual acceptance.

## Milestone 4: Continued Expansion

- [x] Extend the curated story library to four verified API excerpts, including sci-fi.
- [ ] Add source-specific character reactions using approved identity references.
- [x] Perform independent narrative and interaction reviews after expansions.
- [ ] Record actual elapsed development and remaining work at each checkpoint.
- [ ] Complete final verification only after the requested minimum horizon.

Current art audit: `docs/art/coverage-current.json`. Of 71 nodes, only the first
two Blue Blood scenes have their matching reviewed background/character layers;
15 reuse legacy backgrounds and 54 have missing background files. One of 16
cast members has a reviewed main/reaction pair. No user approval of the entire
asset set or final visual completion is implied.

Production contracts now cover all 16 authored adults and every current node:
`docs/character-bible.md`, `docs/art/cast-production-plan.md` and
`docs/art/scene-production-plan.json`. There are 15 remaining baseline portrait
pairs and 50 pending background jobs, plus contextual pose/costume needs. All are
prepared only. Each background node is mapped exactly once; variants reference
earlier base jobs. Generation and actual image review remain outstanding.

## Recovery Rules

- Current image blocker: the single Zhang Wei request ended with HTTP 402,
  insufficient credits, and produced no image. No live request needs resuming.
  Further paid submissions wait for the user to confirm replenishment. Existing
  art corrections, game verification and independent implementation can continue.

- Resume existing OpenQI recovery jobs after delivery failures; no automatic
  resubmission of paid generations whose outcomes are unknown.
- Use exact local file and endpoint references; never invent source URLs.
- Real stories without an adaptation remain readable but cannot claim to have a
  playable world until their content and ending paths are implemented.
- Secrets stay in private configuration or the operating-system credential store.
