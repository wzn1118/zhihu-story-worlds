# Workshop Art Integration

## Film-Frame Wave Handoff / 2026-09-07 01:06

The art-owner calibration now records the user's preference as **queen refinement**,
not the Blue Blood training image. The queen single-scene baseline is 4096 x 2303
and internally passes its isolated review; the 4096 x 2304 training image is
rejected for cuff-action and Zhang Wei identity drift. Neither result grants
whole-world approval or native coverage.

The `film-frame-20260907` first wave has prepared 40 distinct scene jobs across
20 authored stories, but it is not a completed 40-image wave. Current status is
4 historical paid attempts, 4 delivered, 3 reviewed, 2 current generated, 1
current native4K, 0 approved, 38 queued, 0 in flight, with
`NATIVE_4K_GATE_FAILED`. The old text-only V1 route remains held. No workshop
resume, paid request, server restart or code change occurred in this handoff.

## Comparison Outcome / 2026-09-06 23:04 Review

The parent's bounded two-reference comparison is complete and rejected, per
`output/imagegen/scene-production/blue-blood-v1-transfer-20260906-2251/review.md`
and its safe manifest. Its1672x941 output is not a qualified replacement:
0 approvals,0 native4K,0 new distinct narrative scenes. V1 remains the target;
bulk style hold remains. This notice triggers no production or code changes.

## Later Style Hold / 2026-09-06 22:50 Handoff

The latest Blue Blood tea-room result was rejected for style. V1 remains the
visual target, not approval of the zero-reference recipe on original characters.
The three new1672x941 images remain outside approved/native4K coverage. Root's
dispatcher hold and single controlled reference comparison stay with their
owner; this workshop lane has not changed any review, lock or job. This does
not change the completed immutable binding/layout checks below. See the held
candidate integration in `workshop-v1-art-handoff.md`; tests are not art review.

## Handoff Recheck / 2026-09-06 22:45 China Time

Re-read coordination, the latest workshop reports and the completed integration
code. Both GET routes still call the immutable approved-art binder; current
source projection matches the producer and the annotation rule is outside the
mobile media query. No integration rewrite, broad test rerun or browser rerun
was needed. Re-inspected the existing1440/390 authored openings, sample opening
and mobile sample ending screenshots. The existing default evidence below has
22 passing checks, six annotation boxes at0x0,14 real sample ending paths,
zero page errors and zero mutation requests. These are the completed21:34
browser run, not newly captured screenshots.

Live read-only recheck:4173 remains PID34880 and isolated4174 remains PID13176.
Neither server was restarted. The sample still publishes r1 with40 scenes,
7 endings, artReady=false and0 bound native images; revision2 remains failed
under job5a4ad41c-c29a-4338-8606-258b73f9573f, attempts9. The double-pursuit
GET also omits the revoked generated image. No generation, recovery or paid
request was launched by this recheck. No other browser context was closed.

A later art-owner handoff selected V1 as a visual direction; this supersedes
the21:50 statement that there is no selected style benchmark, not the native4K
delivery gates. Future workshop brief changes and their remaining service hook
are separately documented in `workshop-v1-art-handoff.md`. Their new focused
run passed40 tests and TypeScript; the earlier43-test/build/browser evidence
below remains historical completed integration evidence, not a repeated run.

## Completed Integration / 2026-09-06 21:50 China Time

Scope: immutable art binding for authored and imported worlds, live source-hash
eligibility, desktop/mobile resource/title layout, and existing sample gameplay.
No authored content, art-service edits, paid requests or creative job launches.

Read coordination.md and the newest story-workshop.md before editing. The
10:30 work already connected both world GET routes and immutable node copies.
New issues confirmed: binding trusts the delayed stale flag without recomputing
the scene source hash; annotation suppression applies only below640px.

Art owner's latest correction supersedes the historical pilot acceptance:
scene_89cce0808c88ddb09926000189a4 was rejected at12:41:57Z. No approved style
benchmark currently exists. Historical PNGs/screenshots remain evidence of old
states, not current eligible artwork. Unknown paid identities remain untouched.

Shared4173 currently listens under PID34880, not the historical PID49796.
It was not stopped or restarted. The updated backend is running on the separate
owned preview **http://127.0.0.1:4174**, PID **13176**, launched only after verifying
that port was free. Root may load the backend changes in its next coordinated
refresh; this report does not claim the already-running4173 has reloaded them.
The existing sample still publishes r1; r2's last job failed at its creative
upstream access stage. Reuse r1 and saved checks; do not recreate the source or
resume that job as part of this bounded integration.

## Changes

- Both existing GET routes retain `withApprovedArt`; app.ts adds only an optional
  read-only lookup dependency for real HTTP contract tests. There is no new paid
  path and no duplicate artPrivateFileGuard mount.
- `currentSceneSourceHash` matches the producer's canonical source projection:
  world/story identity, title, source attribution, summary, adaptation, cast and
  complete scene data. Background and portrait URLs are excluded exactly as in
  `buildSceneBrief`. An explicit parity test detects producer-contract drift.
- Eligible images must match that current hash even while job.stale=false.
  Batch identity also checks storyId, retaining original/import namespaces and
  version-specific lookup. Existing native pixels, dimensions, hash, bytes,
  duplicate, missing-file and review gates remain in place.
- Returned world/node snapshots remain separate from the cached world. Any
  generated-art URLs in an already-bound input snapshot are cleared before fresh
  eligibility is applied, so rejection or lookup failure cannot preserve them.
- The existing resource-dependent annotation hiding rule now applies at all
  widths, not only mobile. Ordinary scenes without resources keep their title.
- Browser checks use the current ending-source button, not its removed CSS
  class. Existing sample browser tooling received the same selector correction.

## Verification

**43/43 focused tests pass**, zero failed/skipped:
`node --import tsx --test tests/workshop-art-binding.test.ts tests/backend-source.test.ts tests/zhihu-import.test.ts tests/save-transfer.test.ts`.
Six art-binding tests cover immutable concurrent snapshots, approve/reject/stale,
same-version source and node changes, namespace/version mismatch, missing/corrupt
PNG data and the two real Express GET routes. A saved real authored game restores
with the same resources/clues after artwork rejection and retains actual choices.
HTTP tests use isolated synthetic PNG fixtures, never production reviews or paid
jobs. These fixtures are **not generated illustrations or accepted coverage**.

`npm run build` passes including TypeScript. The existing large-chunk warning
remains. No completed broad full-suite or creative-generation run was repeated.

New default browser evidence:
`output/playwright/workshop-art-integration/2026-09-06T13-34-46-868Z/verification.json`.
Separate Playwright contexts at1440x1000 and390x844 passed22 checks:
authored opening/next scene, imported sample opening, the actual nine-choice
pursuit path with the revoked image absent, and **14/14 real sample ending paths**
(seven per viewport), each returning to the exact source and then the same ending.
No API mutation requests or page script errors occurred. The sample's jobId and
attempt count remained unchanged. No browser routing mocks or injected game saves
were used in this run; all endings were reached by offered UI choices.

Annotation display is none and its bounding box is0x0 in all six measured scenes.
Authored resource bounds: desktop y157.796875..206.796875; mobile y124..173.
Sample resource bounds: desktop y189.796875..238.796875; mobile y148.578125..197.578125.
Resource strips start at or below the chapter header bottom. No horizontal overflow.
Desktop/mobile opening and revoked-ending screenshots were visually inspected,
as were the sample openings and selected sample good endings. The full set of
seven ending screenshots per viewport is in the evidence directory.

The required skill client also ran successfully and its original-reader screenshot
was inspected: `output/playwright/workshop-art-integration/skill-client-20260906-2137/`.
It is supplementary reader evidence, not another generated game. The earlier
failed runs remain on disk:132455Z exposed a test serialization helper issue;
132604Z expected first-time onboarding in an already-onboarded context;133008Z
used the retired source-link class. Only133446Z is the passing default.

## Real Status And Gaps

The recorded production snapshot has **zero current approved jobs**. The former
pilot remains rejected;4173 and4174 both omit its URL on current world reads.
Historical acceptance/screenshots and legacy backgrounds are not current native
scene coverage. The uncertain paid identities were not retried or changed.

Sample `import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10` retains its real r1 game:
40 scenes,33 decisions,3 routes,7 endings including4 Bad Ends. The current browser
run reuses the prior r1 engine acceptance paths, while rendering the existing r1
copy layer. Original text SHA256 is unchanged:
`5ab3fe5c1404fa69fb2c191c2c24a76b4144da7bd7931696a038266fe9239097`.

r2 is **not published or finally editorially accepted**. Existing job
`5a4ad41c-c29a-4338-8606-258b73f9573f` failed at the upstream creative-access stage
`route-repair-r1-3343d42532bdffa1a887ccdc-a1`; saved drafts/checkpoints are retained.
This integration did not relaunch it. Sample art remains0/40 native and0/40
approved, artReady=false. No authored content/art-service edits, paid requests,
credential reads, global browser shutdowns, worker termination or commits occurred.
