# Current Work Orders After OpenQI 402

OpenQI returned HTTP 402 (insufficient credits) on the Zhang Wei request. That
request is terminal, no images were delivered, no image requests remain live.
Do not make any further paid generation request until root reports that the
user has replenished the configured account. Retain all visual references and
the prepared background work orders; do not replace the target art with rejected
images or claim the visual work complete. Root has asked for replenishment and
continues independent implementation.

Current checkpoint: `docs/source-lookup-verification.md`. All 20 stories have
searchable real-source readers; four core worlds have 18 reviewed contextual
source links and journal-return restoration. There are 379 nodes, 805 choices
and 69 endings; 138 tests and desktop/mobile source-lookup checks pass. These
checks do not establish visual completion or player satisfaction. Funding
recovery is unconfirmed; no live image request needs polling. Continue useful
source-bound narrative/gameplay work while art production remains unavailable.

## Next Required Production Work

- Preserve the latest two user character references and stronger connected
  facial cel shadows. Retain the reviewed Fang Nuo identity, not the rejected
  Korean-webtoon-looking apartment image.
- Use `docs/character-bible.md` and `docs/art/cast-production-plan.md` for all
  16 baseline core-world cast IDs, identity anchors, physical versus remote appearance and
  default/variant costumes. Zhang Dongdong is male; the old bible was wrong.
- Use `docs/art/scene-production-plan.json` for the complete 71-node mapping,
  50 pending backgrounds and accepted-base dependencies of the older four-world
  baseline. This plan predates the 20-world expansion and is not complete current
  coverage. `docs/art/coverage-current.json` records the actual expanded scene
  and cast gaps; refresh production mapping when those worlds enter the art queue.
- Extend curated source links to the remaining 16 worlds and deepen their
  source-bound play. Keep the distinction between original premises, game
  investigations and authored endings visible to players.
- After confirmed credit recovery, start with Zhang Wei main, inspect it, and
  derive reaction from that accepted image. Continue the observer and matching
  Blue Blood locations, then the other worlds in the cast plan's order.
- Record actual returned dimensions and provenance, inspect characters together,
  derive contextual pose/costume variants, encode accepted images and wire only
  actual files into current scenes. Test the real integrated result at desktop
  and mobile sizes. Prepared filenames are not art coverage.
- Preserve the original full objective, including the unfulfilled 24-hour
  requirement. Do not claim completion from the passing functional checks.

## Archived Completed Instructions

The work orders below are historical context. They have already been completed
and must not be dispatched again. Current results and evidence are in
`progress.md`, `docs/playability-audit.md`, `docs/art-loading-verification.md`
and `docs/narrative-review.md`.

## game_frontend: Portable Saves

Implement in-app export and import of game saves, using the established three
manual slots and current SavedGame/Ink APIs. Users should be able to download a
real save JSON and select a file to restore it from inside the saves dialog. Use
Lucide download/upload tools with Chinese titles/accessibility labels. Reuse
existing modal states, focus handling, toast/errors and file/browser APIs.

Ownership: src/App.tsx and src/styles.css; root owns src/game.ts and the focused
save-transfer tests. Do not modify content, server, scripts or art files. Add the missing
science-fiction library filter (the user explicitly selected suspense and sci-fi)
while touching App, preserving other filters and counts.

Use a versioned envelope, bounded file size, existing exact story/world/version
checks, full structural validation and actual Ink restoration before replacing
a current session or stored slot. Invalid JSON, wrong versions, wrong world,
oversized files, incomplete history and inconsistent Ink/scene state must report
a recoverable error without overwriting the current game. Export should retain
real current choices, clues, paragraph and previous choices through restoration.
No API credentials, raw source caches or arbitrary file paths in the envelope.

Keep normal existing saves readable. Avoid changing the content version because
this is a save transport feature, not a new narrative. Verify a real browser
download/upload round trip, including different paragraph and at least one clue,
an invalid import, and mobile layout. Build and focused meaningful tests. No new
paid image requests. Do not edit shared/types.ts without coordinating with root.

## story_backend: Narrative Prose And Source Fidelity

Review the current four worlds against the already cached real source excerpts.
Improve the existing scene prose and dialogue so this reads as an immersive adult
mystery/adventure rather than repeated generic advice. Many scenes currently
explain their lesson or narrate what a character did not do. Prefer concrete
sensory evidence, individual voice, credible hesitation and consequences that
belong to the scene. Keep suspense, ambiguity and character agency. Do not make
the stories safer/easier/less consequential just to simplify validation.

Ownership: content/worlds.ts, content/future-island.ts, a new review at
docs/narrative-review.md, and relevant narrative test updates if needed. Preserve
all node/choice ids, transitions, clues, numeric effects and gates, adult cast,
source attribution, current character/background fields and current versions.
Do not add a fifth world. Do not modify frontend, shared types, source adapter or
art. Source snippets are incomplete; do not claim invented endings are original.

Distinguish verified source facts from adaptation. Condense repeated expository
sentences while preserving enough background for a first-time player. Keep each
scene readable across the existing 3-paragraph interaction. Take care not to
accidentally alter Ink syntax. Review all four, edit where useful, then run the
world reachability/save tests. Report exact changes and any unresolved narrative
weaknesses. No paid image generation.

## visual_assets: Complete Unsubmitted Art Prompts

Prepare the unsubmitted grey-jacket observer main prompt and a compact character
identity record. User character references still control linework and stronger
facial shadows; the gothic image controls environments. This is an original
adult man around 40, distinct from the female characters in forehead, eye shape,
nose, jaw and age marks, and wearing the source-grounded gray outerwear. Use a
matte gray/charcoal everyday winter jacket, limited burgundy inner collar and
old-silver hardware. No weapon, cosplay, armor, glamorous pose, glossy webtoon
face or excessive costume decoration. Calm still posture for the daylight
convenience-store conversation, knee-up on a uniform neutral background, full
hair and hands in frame, no text. Strong connected cheek shadow and readable
sclera. Original design details are not source facts.

Do NOT submit the prompt: no paid calls while the account is depleted. Own only
docs/art/observer-main.prompt.txt and docs/art/observer-design.md. Include expected
actual reference paths and the bounded main-first, reaction-after-review process
for resumption. Do not change the current Fang Nuo ledger or other app files.
