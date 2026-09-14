# Zhihu Story Experience / 2026-09-06

Latest user approved implementation with a highly polished UI. This lane owns
the Zhihu library presentation, source-to-workshop import, and ending-to-source
return flow. Preserve authored works, existing saves and the active r2 editor.

## Current Art Correction / 2026-09-06 21:50

The bed pilot below was subsequently rejected at12:41:57Z. Its former acceptance
and screenshots are historical, not current approved coverage. Current immutable
binding/source-hash and desktop/mobile verification are recorded in
`docs/workstreams/workshop-art-integration.md`. Shared4173 is PID34880; updated
isolated integration preview4174 is PID13176. Neither old PID below is current.

## Historical Main-Entry Acceptance / 2026-09-06 15:29

The default entry is now **http://127.0.0.1:4173**, PID **66252**. The coordinator
has already refreshed it; this lane performed no restart. Existing preview4174
is PID54800. Main reports revise/editorial/zhihuImport=true. The 12:50 process
and capability descriptions below are historical, not current launch guidance.

New default UI evidence:
`output/playwright/zhihu-experience/2026-09-06T07-26-54-343Z/verification.json`.
The existing full UI script now defaults to4173. Actual desktop1440x1000 and
mobile390x844 flows passed: featured works, source author/avatar, exact3000-char
reader, real server import, retained personal draft, saved discovery results,
seven offered choices to ending_witness, source return and choice history.
Wide1920x1080 and small360x720 fit checks passed. No page script errors or
horizontal overflow; current library and selected-source screenshots were
visually inspected. Imports reused `import-999925a5-3b06-4bfe-b1e5-50bed0458ce6`;
this remains idle and no generation was started.

### Single Reviewed Art Binding

Art owner's internally approved frame for `double-pursuit` / `ending_pursuit_loss`
is served at `/generated-art/scene_89cce0808c88ddb09926000189a4.png`.
Both4173 and4174 bind it only to that scene in world1.2.0. Existing
`withApprovedArt` checks already handle this; no production code change was needed.

New integration script: `scripts/verify-art-pilot-integration.ts`.
Main-entry evidence:
`output/playwright/zhihu-art-integration/2026-09-06T07-26-20-754Z/verification.json`.
Both desktop/mobile followed nine actual offered choices to the ending, loaded
the original4096x2305 PNG, and passed a nonblank canvas check (109 quantized
colors). Both screenshots were visually inspected. HTTP bytes:6538698;
SHA256:`e837cccbdf2863603abcdf2a879009d1cbb947cf821a336f704d8a18c0893d17`.
This verifies one internally approved scene, NOT user acceptance, full-book art
coverage, or the separate generated sample's art readiness. No paid request,
new image generation, job termination or server restart occurred.

Current focused verification:10/10 tests passed across
`tests/workshop-art-binding.test.ts` and `tests/zhihu-import.test.ts`;
`node node_modules/typescript/bin/tsc --noEmit` passed. This does not re-label
the historical494-test run below as a new full-suite run. Active sample/editorial
and discovery workers remain owned by their existing conversations.

## Ownership And Integration

- Editing src/App.tsx, src/styles.css, src/StoryWorkshop.tsx, new source UI,
  shared source types, server/story-source.ts, server/story-workshop.ts import
  methods, server/workshop-compiler.ts provenance fields, server/app.ts and tests.
- No changes to authored content or active model jobs. No paid image requests.
- Backend API: POST /api/workshop/from-zhihu with {storyId} retrieves the actual
  server-validated excerpt and creates/reuses a local import project. It does
  not automatically launch generation. Existing /:id/generate owns jobs.
- Imported source scope is zhihu-excerpt, with an independent import UUID and
  server-authenticated origin metadata. Public paste import rejects this scope.
- Existing import hashes and save contracts must remain unchanged.
- Preserve current buttons used by other browser lanes wherever possible.
- Shared4173 is not restarted while Catalog A is accepting routes. A coordinated
  reload is requested only after backend changes and tests are ready. This lane
  will use an isolated preview if the shared reload window remains unavailable.

## Design

Keep Red Leaf's red/black identity, but neutralize brown text/background casts
on library surfaces. Zhihu provenance uses a restrained blue accent. Real source
artwork, names, avatars and tags carry the subject. Library and workshop remain
usable first screens, not a marketing page. Original excerpts and new endings
stay visibly distinct; personal imports never receive a Zhihu source badge.

## Verification

Completed at 2026-09-06 12:50 China time. New default evidence:
`output/playwright/zhihu-experience/2026-09-06T04-49-22-444Z/verification.json`.

- Actual browser flows at 1440x1000 and 390x844: library, all four featured
  works, original reader, real author avatar loading, source selection, actual
  POST import, immutable source reader, personal draft retention across tabs,
  discovery results, seven real game decisions to ending_witness, return to
  original and back to the same ending, and actual choice-history view.
- Additional 1920x1080 and 360x720 library/discovery/source-picker checks.
  Screenshots checked visually; no horizontal overflow or page script errors.
  The final wide hero preserves the character's full face. Library cards use
  actual upstream original cover metadata, not empty pending game-art slots.
- Actual imported snapshot: `import-999925a5-3b06-4bfe-b1e5-50bed0458ce6`,
  from work `2025684191967294692` (Blue Blood). Both viewport imports reuse
  that project. Its 3000-character excerpt and authorship equal the actual
  detail API response exactly. It remains idle, without a generation job.
- `npm test`: **494/494 pass**, zero skipped/failed.
  Log: `output/zhihu-experience/tests-final.log`.
- `npm run build`: pass, including TypeScript. Existing bundle-size warning
  remains; no warning was suppressed. Log: `output/zhihu-experience/build-final.log`.
- New focused tests cover verified import, exact source persistence, concurrent
  deduplication, unchanged legacy hashes, forged origin rejection, source image
  host restrictions, HTTP origin protection and compiled provenance labels.

Earlier browser runs exposed empty covers, a stale test-state race, an avatar
load race and an inconsistent mobile navigation name. Their failed manifests
remain on disk. Only the final 044922Z run above is the default acceptance.

## Running Preview And Handoff

Full verified preview: **http://127.0.0.1:4174**, PID **65684**. Started with
`scripts/zhihu-preview.ps1`, hidden, after verifying the port was free. Verified
its current command line is Node with `--import tsx server/index.ts`.

Shared4173 remains PID **59456** and was NOT restarted by this lane. At final
check its projects capabilities still omit zhihuImport; preview4174 reports
zhihuImport=true and serves the actual discovery API as well. The source picker
truthfully disables import on an older backend. Backend changes are ready for
the coordinator's next single shared-server reload; preserve detached job owners.

Concurrent `zhihu-expansion` discovery UI, source kinds, library shelf, routes
and active jobs were preserved. We verified its saved-results view without
starting another search/generation. Its new works and active jobs are NOT
claimed as this lane's generated output.

This acceptance covers Zhihu integration and UI, not the pending r2 editorial
review, new story generation or native-4K artwork. No paid art request, credential
read, authored content edit, worker termination or Git commit occurred here.
