# More Zhihu Stories / 2026-09-06

## Current Delivery / 2026-09-07

Both selected new Zhihu excerpt adaptations are published and playable at
http://127.0.0.1:4173/ in the new Zhihu stories library band. The dated sections
below retain production history, including prior failed reviews and recoveries.
They do not describe the current publication status.

| Adaptation | Exact excerpt | Scenes / decisions | Routes | Endings / Bad Ends |
| --- | --- | --- | --- | --- |
| 星航：关断之后 | 曦楠, 735 characters | 50 / 37 | 3 | 13 / 8 |
| 路灯下的两张日期 | 向南天, 932 characters | 51 / 41 | 3 | 10 / 5 |

Both retain their independent import UUIDs, exact official search excerpts and
real author/source links. Added plot and endings are explicitly adaptations,
not the original author's complete work. Each final draft passed the actual
configured-model independent review with zero blockers and zero advisories.
The existing original sample and authored catalog are not counted as new games.

Current engine acceptance: 8,247 Star states and 3,300 Factory states, all 205
choices, all 101 scenes and every-state save roundtrips. These are real Ink
executions, not only a graph walk. Evidence:

- output/workshop-sample/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f-r1-1788707791422/acceptance.json
- output/workshop-sample/import-0b3ce5e1-1f96-474d-871d-5e2a2a541713-r1-1788710957077/acceptance.json
- output/zhihu-expansion/delivery-2026-09-06T15-16-30-950Z/verification.json

Final browser evidence after the clue-label presentation fix, desktop1440x1000
and mobile390x844, all23 endings in both viewports:

- output/playwright/generated-stories/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f-2026-09-06T17-11-57-486Z/verification.json
- output/playwright/generated-stories/import-0b3ce5e1-1f96-474d-871d-5e2a2a541713-2026-09-06T17-11-36-418Z/verification.json

These supersede the earlier browser runs for the current UI. Exact excerpt
reading and return, save/reload/load, export/import/load, ending prose, all
encountered locked-choice explanations, reading bounds and scrolling pass.
Factory also has explicit action-feedback, clue-journal/history and unchanged
internal-clue-ID assertions. Final full tests:634 passed, zero failures,
output/zhihu-clue-labels-tests-20260907.log. Production build passed with only
the existing large-bundle warning. No commit was made.

Art is still pending: 101 registered scene jobs, zero generated files, zero
native-4K candidates and zero approvals. Both service batches currently inherit
NATIVE_4K_GATE_FAILED. Preparation used server/art-production.ts; this lane made
no paid image request, gate acknowledgement or visual-readiness claim.
Shared4173 remains PID34880. Both production workers completed and released
their locks; no duplicate generation or second shared-server restart was used.

## Initial Scope / 2026-09-06

Latest user request: connect more actual Zhihu stories and make them playable.
The existing official hackathon list was refreshed live: still 20 entries, all
already have authored games. Do not label copies of those 20 as newly found works.

This lane owns NEW server/zhihu-discovery.ts, shared/zhihu-discovery.ts,
src/ZhihuDiscovery.tsx, discovery tests and production evidence. The existing
zhihu-experience lane continues its library/UI and hackathon import work.

Integration additions only: ZhihuOrigin.kind will also distinguish zhihu-answer
and zhihu-article, with contentScope=search-excerpt; scope remains zhihu-excerpt.
The canonical answer/article ID comes from the actual returned URL, NOT the
search engine's opaque ContentID. Original text is exact ContentText and is
explicitly a search excerpt, never the complete work or hackathon story API.

New GET/POST /api/workshop/discovery lists saved results or explicitly searches.
New POST /api/workshop/discovery/import accepts only a saved candidateId and
optional generate=true. Existing /from-zhihu {storyId} is unchanged.

The official CLI is installed and authenticated via keychain. No credential files
were read. Actual search found new suspense and scifi sources, including
Xiang Nantian's factory mystery and Xi Nan's Xing Hang. This lane will persist
the responses, create separate import UUIDs, and run the actual configured-model
pipeline for selected works, with graph/editorial/browser verification.

No authored content file, existing active job or paid art request is changed.
Do not start duplicate generation for these new imported projects. Shared4173
remains PID59456; no restart by this lane. Final evidence remains pending.

## Actual Production / 12:33

Official CLI responses saved under .local/zhihu-discovery, 10 distinct sources.
Intake evidence: output/zhihu-expansion/2026-09-06T04-33-22-629Z/intake.json.

- Xiang Nantian factory mystery, 932 exact characters:
  import-0b3ce5e1-1f96-474d-871d-5e2a2a541713,
  job0550f40b-f26e-4753-ad19-c1d0bf6d44c8, r1 running.
- Xi Nan Xing Hang, 735 exact characters:
  import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f,
  jobca899fe4-4a74-436c-843f-a02de8f41b53, r1 running.

Five new discovery/API/preservation tests and tsc passed before actual launch.
Added one accepted scope to the editorial validator (zhihu-excerpt), with no
changes to its repair algorithm or current job. Both new workers inherit the
configured model/reasoning and current common writing/art requirements.

UI integration: a third source tab, discovery, lives in new ZhihuDiscovery.tsx
and its isolated CSS. Existing source picker and paste tabs are retained. Source
readers explicitly distinguish search-excerpt from the hackathon API excerpt.
The latest request prioritizes additional source intake/playable games; the
other lane's ongoing polished UI is preserved, not reset or overwritten.

## Intake And UI Acceptance / 12:50

Full repository tests passed 491/491, recorded in
output/zhihu-expansion-full-tests.log; the production build passed in
output/zhihu-expansion-build.log. A subsequent immutable-candidate regression
brings the focused discovery tests to 6/6. Each changed upstream excerpt now
has a content-addressed candidate, retaining the earlier exact snapshot; the
library shows the newest snapshot per canonical URL. Legacy saved candidates
remain readable. No copied article body is treated as a complete original.

Actual browser intake checks passed at 1440x1000 and 390x844:
output/playwright/zhihu-expansion/2026-09-06T04-40-45-740Z/verification.json.
This verifies the new library band, discovery/selection, exact source reader,
idempotent import and actual running production status. It does NOT establish
that either new game is finished. The preceding run at 04-37-02-441Z performed
the real import of the third source, Tai Kong Man You Ji by Zi Zhou Yu De Zi Zhou,
as import-71ea1ce0-5f47-439a-9661-37c61d8ca6fb; it remains an idle source project,
not a completed game.

Preview uses the existing UI lane server http://127.0.0.1:4174 (PID65684 when
verified). This lane has not restarted the shared4173 or any other owner's job.
The two selected new works still run under their original job IDs above.
Native4K scene production remains separate and unapproved; no paid call made.

New scripts/verify-generated-browser.ts is prepared for actual published-game
acceptance: introduction, choices, every ending, exact source return and manual
save/load, in both viewports. It requires the strict engine/editorial acceptance
record and cannot certify merely queued or unpublished work. Final game results
will be added only after those checks run against completed production.

## Real Drafts And Current Verification / 13:07

Both real outlines and first route drafts have returned. Draft adaptation titles:
Lu Deng Xia De Liang Zhang Ri Qi (factory mystery) and Xing Hang: Guan Duan Zhi Hou.
Each first route currently contains 15 scenes, 12 decisions and 3 endings. Both
workers are now writing route two under the SAME original job IDs. These are
saved drafts, not published or editorially accepted games.

Actual first-route prose was inspected. An outline-only editorial observation
for the factory mystery has been recorded in its own r1/editorial-notes.json:
check whether repetitive politeness/recklessness rewards displace substantive
investigation, and require evidence/goal tradeoffs rather than a moral quiz.
Its observedDraftHash explicitly describes {outline, routes:[]}; it is not a
claim that a full draft was read or accepted. The existing independent editorial
stage will compare the note with its then-current complete draft. No generated
prose or active prompt was manually replaced, and no additional model was started.

Latest full suite passes 494/494 in output/zhihu-expansion-tests-1305.log; tsc
also passes. Latest actual desktop/mobile intake acceptance:
output/playwright/zhihu-expansion/2026-09-06T04-55-35-131Z/verification.json.
This adds real search-form submission (cached official responses), the homepage
source-reader return, exact excerpt preservation and unchanged active job IDs.
The desktop discovery and mobile production screenshots were visually inspected.

scripts/verify-zhihu-delivery.ts is observing only these two existing jobs and
will run strict engine plus actual browser acceptance after publication. Current
run directory: output/zhihu-expansion/delivery-2026-09-06T04-58-22-062Z.
No success report exists there yet. It neither launches creative jobs nor pays
for art. Homepage art counts now read the actual art-service batch, rather than
the earlier project snapshot, with separate loading/failure states.

## Preview Handoff Reload / 13:34

The zhihu-experience lane has completed and handed off preview4174. Its final
report explicitly preserves these new source jobs. The listener was freshly
verified as PID65684, Node --import tsx server/index.ts, created at12:35:11.
This lane is taking one reload of that handed-off preview to load the newer
immutable-candidate backend. Shared4173/PID59456 and all detached creative
workers stay untouched. No additional preview port or generation is started.
The reload helper verifies listener identity before stopping only that PID,
then checks the replacement PID, health and content-addressed discovery DTOs.

Reload completed once at13:36:02, new preview PID54800 on4174. Exact record:
output/zhihu-expansion/preview-reload-2026-09-06T05-36-02-223Z/verification.json.
Shared4173 remains PID59456. Post-reload real desktop/mobile intake passed:
output/playwright/zhihu-expansion/2026-09-06T05-36-37-446Z/verification.json.

## Policy Refresh And Real UI Resume / 13:46

Both complete drafts now contain 3 routes of 15 scenes each. Both reached
independent editorial review after the initial full graph check. Neither has
been published or accepted as a completed game yet.

A concrete live-process mismatch was found before acceptance: the factory
worker started before the shared editorial-notes adapter was added, so its
loaded module omitted the later notes. Its ledger had the base policy09fd35aa,
not the required note-bound policy2fcb28e0. Xing Hang correctly uses the base
policy and was left running under its original job. The earlier factory review
and partial repair outputs are retained; they do not satisfy the newer notes.

After checking token, worker command line and port-independent ownership, only
factory worker76268 was stopped. Its last recorded child12100 was also confirmed
absent before resume. Source-file and all 3 completed route-file SHA256 values
were unchanged. Stop evidence:
output/zhihu-expansion/policy-reload-2026-09-06T05-41-05-325Z/stopped.json.
The record's stoppedChildren=[null] reflects that no child remained enumerated
after stopping the worker, not a claim that a nonexistent PID was terminated.

Actual desktop UI clicked 'resume from completed stages'; mobile then checked
the running state and absent duplicate-generation controls. Exact source-reader
text and source metadata still match. Evidence:
output/playwright/zhihu-resume/2026-09-06T05-42-53-067Z/verification.json.
New factory job69668a9a-dbc8-4d27-90f6-f5ee5ee329ed, worker64620, r1 unchanged.
Both current ledgers now match their expected policies; the new factory CLI
prompt contains REVIEWER_OBSERVATIONS_DATA. No new outline/route drafting or
paid image request was launched by this refresh.

The earlier delivery observer correctly recorded the intentional interruption
as a failure, not success. Current observer directory:
output/zhihu-expansion/delivery-2026-09-06T05-44-49-858Z.
Its final engine/browser results are still pending. No second server reload.

## Editorial Repairs And Import Durability / 13:57

Both first independent reviews returned real findings. Xing Hang has 7 blocking
findings plus 1 prose advisory; the note-bound factory review has 6 blocking
findings plus 1 advisory. Source identity remains intact. Repairs address actual
branch causality, conflicting resource/waiting rules, timeline details and ending
closure; these are not waived to make publication succeed. Xing Hang's opening
and outline repair has returned and route repair is underway. The factory
outline repair is still running. Neither game is yet accepted as playable.

Read-only code review found an existing import-recovery defect: a process dying
while holding the empty legacy .recover file could leave import permanently busy.
New server/import-recovery.ts atomically publishes complete reservations via a
hard link and uses append-only recovery generations, never unlinking another
caller's lock name. persistImport rechecks the latest index after acquiring its
generation and marks a failed reservation recoverable before releasing it.
Generation job.lock ownership is unchanged. Migration applies at the next normal
server startup after old import handlers exit; current preview54800 remains on
its already-loaded import module. No live import records or job locks were edited.
Dedicated crash/concurrency tests are being added in isolated temporary roots.

Discovery tests now also exercise legacy candidate migration and three actual
concurrent HTTP generate=true requests against an existing owned job. All return
the same project, revision and job token, without a new creative subprocess.
Focused discovery tests pass7/7; combined workshop/source integration tests
pass27/27. TypeScript passes. These are API/durability checks, not creative-game
or native-art acceptance.

The dedicated import-recovery suite completed twice,10/10 each, including real
independent Node processes, forced claimant death and a deliberately delayed
reclaimer. All owned test children exited and temporary roots were removed.
Full current repository tests now pass508/508:
output/zhihu-expansion-tests-1400.log. Build/TypeScript pass:
output/zhihu-expansion-build-1400.log (existing629KB chunk warning retained).

## Real Rejection And Shared Policy Drift / 14:11

Xing Hang's first route repair returned a16th scene,
save_habitat_rescued_after_search. The existing identity validator requires the
same scene set and rejected it; no published world was written. The rejected
model output, receipt and complete earlier outline repair remain preserved.
Worker68532 and child66736 were both confirmed ended; no job.lock remained.
The delivery observer at05:44:49 correctly ended with this failure.

Actual UI resume passed both viewports, exact-source reading and duplicate-job
controls: output/playwright/zhihu-resume/2026-09-06T06-05-04-253Z/verification.json.
New Xing Hang job9c5d17bf-4d98-44ea-b68f-eac7970f3807, worker49544, r1 unchanged.

While the original jobs ran, another shared edit added repairChoiceStyle to the
editorial policy hash. The resumed Xing Hang worker therefore starts a NEW full
review under policyf19cac52, not merely the old rejected output's second attempt.
This distinction matters: earlier accepted partial repairs remain in their old
private run, and no claim is made that the new worker has reused them.
Factory worker64620 is still completing its current note-bound run2fcb28e0;
current expected policy is0e5dce17. Its in-flight work is not killed again.
Final strict acceptance still checks this mismatch; an old-policy pass alone
will not be reported as final completion. Please avoid changing shared editorial
policy again while these long-running sources are being completed.

Current read-only delivery observer:
output/zhihu-expansion/delivery-2026-09-06T06-09-55-521Z.
Neither new game nor native4K art is currently accepted. Preview4174/PID54800
and shared4173/PID59456 are unchanged. No paid art request or commit.

## Shared Server Loading / 14:20

All backend changes are now ready with508 passing tests and a passing build.
Catalog A's12:20 handoff is complete and requests loading its pending source
copy; the Zhihu UI lane's12:50 handoff also requests a shared reload. A fresh
process check found only server/index.ts listeners59456 on4173 and54800 on4174,
with no listed catalog/generated browser acceptance process running.

This lane will perform its FIRST AND ONLY shared4173 restart, checking PID59456
and its exact Node server command before stopping it. Earlier13:36 activity was
one handed-off preview4174 reload, not a shared4173 restart. Preview4174 and all
detached model/art workers remain untouched. Browser acceptance will subsequently
use4173 so the user's currently open URL gets the actual new backend. No import
or generation is launched by the reload helper.

Shared reload completed once: previousPID59456 -> newPID66252 on4173.
Evidence: output/zhihu-expansion/preview-reload-2026-09-06T06-19-56-797Z/verification.json.
The default URL is now http://127.0.0.1:4173; it serves10 content-addressed source
snapshots and the latest import-recovery implementation. Preview4174/PID54800
remains untouched. Both owned creative job tokens/PIDs are unchanged. The intake
and final generated-game browser scripts now default to4173. Post-reload desktop
and mobile acceptance is running; no second shared reload is planned.

Post-reload intake passed at1440x1000 and390x844 on4173:
output/playwright/zhihu-expansion/2026-09-06T06-21-33-832Z/verification.json.
Both actual search submissions, saved-source import identity, exact reader and
current running job9c5d17bf were checked. No duplicate project or creative job
was created. This remains intake evidence, not finished-game acceptance.

The existing Zhihu experience helper was also rerun explicitly against4173
without editing the other owner's script:
output/playwright/zhihu-experience/2026-09-06T06-23-06-251Z/verification.json.
Both desktop and mobile passed the real library/import/source/game-ending
workflow, plus its wide/narrow layout checks, with zero page errors. This verifies
old content after the shared reload; it does not substitute for either new game.

## Second Review And Independent Preflight / 14:45

Factory round1 full review returned4 blocking findings and1 advisory. It
independently detected a forced further-falsification choice, an unperformed
paper-book insertion, outline/scene ending-condition disagreement and a truncated
outline beat. The same owned job is performing its second repair round; no pass
or publication is asserted. Xing Hang has accepted its first two route repairs
and is still completing the third under the current policy.

A bounded read-only review independently reproduced the factory draft's missing
unconditional free exit at name_the_dead_separate_interview. Actual
buildGeneratedWorld on the private round-1.draft.json rejects that scene. Findings
and exact checkpoint hashes: docs/workstreams/zhihu-factory-review-1445.md.
This is a private intermediate snapshot, not a claim that the eventual final
repair remains defective. The final compiler gate is unchanged.

scripts/resume-zhihu-browser.ts now also supports --revise for an actual UI
editorial revision. It checks that the new revision is seeded from the completed
model draft while exact source, old world and old draft bytes remain unchanged.
The extension is prepared and type-checked, but has NOT been used to start a new
revision. Existing workers retain their ownership; no duplicate job or server
reload was performed.

## Bounded Scene Extension And Recovery / 15:09

Factory's second-round name_the_dead repair added two actual scenes,
name_the_dead_later_recheck and name_the_dead_reading_unresolved_bad. The old
same-scene-set validator rejected it, as it had Xing Hang earlier. Worker64620
and its recorded child5612 have both ended, and observer06:09:55 correctly
terminated with failure. No playable factory world was published.

Additional read-only Xing Hang evidence is in
docs/workstreams/zhihu-xinghang-review-1450.md. Its first-round draft compiles
with46 scenes/37 decisions/9 endings/7293 states, but has two concrete paths
with ample oxygen and only a newly harmful continuation. These findings are
specific to that snapshot, not an assertion about a future final draft. The
current independent model run continues its second repair round unchanged.

An explicit preserve-and-extend-v2 option is being tested for subsequent runs.
Default v1 protocol, prompt bytes, policy identity and existing live workers are
unchanged. V2 preserves every existing route, scene and choice ID; new scene IDs
must belong to the same route, remain within the existing18-scene schema, and
still undergo exact whole-draft review coverage and full graph compilation.
No rejected response is relabeled accepted, and no approval is inherited.

New server/workshop-recovery.ts can stage a complete actually reviewed snapshot
plus a hash-linked sequence of model repairs from a stopped unpublished revision.
Only a scene-set-only rejection is eligible for the explicit extension recovery;
schema, source, old-ID preservation and checkpoint/run hashes are rechecked.
The next owned worker applies the entire staged snapshot and writes its applied
marker last, so an interruption repeats the snapshot rather than mixing routes.
Source, prior model artifacts and recovery provenance remain retained. This is
not a publication path: normal structural repair and independent re-review follow.

The16 existing editorial/job tests and TypeScript pass. New extension/recovery
tests are in progress. No production recovery selection has been applied yet,
no new model/paid-art job has been started, and4173 has not been restarted again.

## Recovery Tests And Actual UI Resume

Extension tests pass33/33, recovery tests pass10/10, and the existing editorial
tests remain passing. Full repository tests pass558/558:
output/zhihu-expansion-tests-1514.log. Build/TypeScript pass:
output/zhihu-expansion-build-1516.log. No shared server reload was needed for
these worker-only changes; each new detached worker loads its own modules.

The factory recovery selection was actually staged at07:13:03Z and applied by
its next owned worker at07:13:07Z. Archive:
.local/story-workshop/projects/import-0b3ce5e1-1f96-474d-871d-5e2a2a541713/r1/recovery/0244a6cb-d4f0-418d-81b8-493f7bab2253.
Candidate hash638ba29d3d55f773970b6ce628274285fdff4b95b47bb9563f51b0b8b061f077.
This preserves a reviewed complete snapshot and three chained real repairs,
including the17-scene investigation output. The original rejection remains
unchanged. Source hash remains3ab2db9819b2c79cf1805d124f94fab05c1d3b3ebfc57ea6de2763bdfa52869b.

The actual UI launched job44d15c51-8fb7-4a6c-9217-2dbc3bdae714, worker61992.
Its browser helper first timed out while waiting only two minutes for the model
to finish structural repair: output/playwright/zhihu-resume/2026-09-06T07-13-05-161Z.
This was a helper failure, not a second generation. A separate read-only UI
observer at07:15:49 then correctly detected the actual next failure:
name_the_dead_later_recheck still lacked a free unconditional exit. The first
scene repair was preserved. Neither browser run is claimed as passed.

After verifying61992 and child76008 ended and job.lock was absent, the actual UI
resumed the same r1 again: jobaf57dc03-6470-48ee-8b1a-d581b44f2622, worker55672.
No recovery snapshot is reapplied after its completed marker; the first repair
survives. Browser verification now waits for actual editorial entry with a bounded
20-minute limit, handles an absent new-revision ledger, and stops on real failure.
The --observe option never launches a job and labels its result accordingly.

Current read-only delivery observer:
output/zhihu-expansion/delivery-2026-09-06T07-18-35-984Z.
Xing Hang remains in its original job9c5d17bf's final full review. A guarded
scripts/record-zhihu-xinghang-review.ts is prepared to replay the exact reported
problem paths against a completed current draft before recording observations;
it has not yet been run and starts no model. Both final gameplay acceptances
remain pending. No paid art request, fabricated approval, or commit.

## Current Real Recovery / 15:27

Factory's second structural repair now passes the actual compiler with48 scenes,
38 decisions,10 endings,5 Bad Ends,3 routes and2227 reachable states. Its new
independent v2 review is still running, so these are structural counts, not a
published-game acceptance. Actual desktop/mobile UI resume passed:
output/playwright/zhihu-resume/2026-09-06T07-18-25-210Z/verification.json.
The source is exact and duplicate generation controls are absent.

Xing Hang's final v1 review completed at07:23:37Z with2 blocking findings:
the cold-loop repair opportunity vanishes without physical cause, and the outline
places a breathing-box shutdown before reentry although the actual scene is later.
The worker ended and removed its job lock. The delivery observer07:18:35 correctly
stopped on this actual failure; it is not a passed acceptance.

The guarded local causal replay then reproduced all3 current forced-action paths,
with oxygen17,18 and16 respectively, against the completed draft. Source-bound
observations were recorded, opting this next owned run into preserve-and-extend-v2:
output/zhihu-expansion/xinghang-causal-check-2026-09-06T07-26-31-654Z/verification.json.
These are concrete state observations, not a blanket claim that failure endings
should be removed. A lost objective may retain its consequences without forcing
the player to perform a new harmful action they did not choose.

Actual UI resume passed on desktop and mobile:
output/playwright/zhihu-resume/2026-09-06T07-26-33-510Z/verification.json.
New job08e82388-3509-4ff3-9e52-5872eb46859b keeps r1 and the exact original source.
Its current policy is09abf23a989b2e865c0f7eb7bf8bffc1c35e9f16b43d52dad569b56a03b1b24a.
No rejected checkpoint was relabeled passed; no duplicate import or job was made.

Current read-only delivery observer:
output/zhihu-expansion/delivery-2026-09-06T07-26-58-158Z.
It starts neither model nor paid art work. Final new-game Ink/browser acceptance
remains pending. Shared4173 was not restarted again.

## Acceptance Hardening / 15:45

The browser resume helper now derives a new revision's requirements from its
published ancestor before the new directory exists. It also checks the current
job/attempt/PID and a ledger written after that job lease began, instead of
accepting an old ledger with the same policy hash. Actual read-only desktop/mobile
observations passed for both existing workers, without starting another job:
output/playwright/zhihu-observation/2026-09-06T07-31-45-394Z/verification.json
and output/playwright/zhihu-observation/2026-09-06T07-32-11-515Z/verification.json.

The final browser helper now handles both first-time onboarding and the remembered
skip-guide preference; checks the served world version, source hashes, every
published ending and each executed choice; and verifies persisted saves after a
page reload plus an actual exported-file import into another slot. These new-game
checks are prepared, not yet claimed as a completed browser delivery.

Pressure evidence now distinguishes a genuinely depleted decision from an action
whose cost exceeds a positive remaining resource. It preserves the blocked action,
all unconditional free exits and exact replay paths, and reports actual minima
and no-pressure-reachable separately for each route/resource. The prior Xing Hang
snapshot has affordability pressure in return_home, but none in its other two
routes; an ending that reaches zero is not a playable depleted decision.

New pressure tests pass9/9. The combined pressure, recovery and editorial-extension
run passes52/52, and TypeScript passes. Current4173 listener was rechecked as66252.
Both creative workers continue their existing owned repairs; no paid art dispatch,
shared server restart, publication bypass or commit was performed.

## Revised Ending Capacity / 16:00

Factory's v2 round-1 snapshot completed at07:51:59Z. A fresh read-only compiler
check rejects return_with_luoli_05_signature because both retained choices now
point to return_with_luoli_06_awning. The independent model is still reviewing
this whole snapshot. The earlier48-scene structural pass belongs to its input,
not this newer intermediate repair. Publication remains blocked by the original
two-distinct-target rule; no graph condition was relaxed.

The same snapshot contains4 actual name_the_dead endings but its revised outline
still lists3. The initial outline schema had a hard maximum3 although the existing
18-scene route budget and required10 decisions permit up to8 endings after causal
repairs. That outline-only capacity now matches the existing bounded route budget.
Initial drafting still requests2-3 endings; every later addition remains real
model output requiring full review, unique old/new identities and actual graph
reachability. No live draft or running model request was edited. Current workers
retain their already-loaded schemas; future owned workers load the new capacity.

The opt-in extension repair instructions now explicitly repeat the existing
two-distinct-next and ten-decision compiler constraints, and require the outline
to describe added endings rather than omit or combine distinct causal outcomes.
Default v1 prompt text is unchanged. Checkpoint request hashes include their
actual schemas and prompts; old rejected/accepted records remain retained.

New tests verify an outline describing all8 real endings in an18-scene route,
full compilation with the unchanged decision requirement, and rejection above
the bounded capacity. Editorial tests pass51/51; extension+recovery pass45/45:
output/zhihu-expansion-extension-1600.log. Build passes:
output/zhihu-expansion-build-1600.log (the existing bundle-size warning remains).
Both real story jobs are still in editorial, and neither is claimed playable.

## User Resume / 21:10

The user resumed this same two-game task after the earlier provider failure.
At20:41 the former4173 server and both creative workers were gone, with no job
locks. The existing preview script restored the vacant port without terminating
another process. Current listener34880 on127.0.0.1:4173 and /api/health are verified.

Both original excerpts remain exact. A guarded recovery script reconstructs only
completed real-model checkpoints, under inactive-job ownership and exact source,
revision, input/output hash checks:
scripts/recover-zhihu-september-resume.ts factory|star.
The factory round-1 snapshot already had a complete accepted review. Xing Hang's
candidate is reconstructed from its reviewed round-0 plus the four ordered actual
accepted repairs; its round-1 review had not finished. Neither inherits approval.

Recovery receipts:
output/zhihu-expansion/resume-recovery-2026-09-06T13-05-38-915Z-factory/receipt.json
output/zhihu-expansion/resume-recovery-2026-09-06T13-05-50-827Z-star/receipt.json.
The first factory staging succeeded but its receipt directory was missing; the
helper now creates it and reuses the exact unapplied staging without restaging.

The factory candidate retains hash00a2b808514ee9f7bee6b20d11821c949a8f2c1c5f2527aaf44d3b23892195bc.
It needs a real repair for the signature choices sharing one next scene. Opt-in
structural repair can now add bounded meaningful scenes while retaining all old
scene and choice IDs; the 18-scene cap and two-distinct-next rule remain strict.
Outline capacity now matches the same cap: at most16 beats and8 endings. Initial
drafting targets are unchanged. This prevents capacity rules from forcing a
repair to delete a real causal branch or omit its ending from the outline.

Xing Hang's unchanged round-1 hash68c16f9980fdb964f9669c5f34bff336498b916a6447d636b278e2b88f9548d1
now compiles:50 scenes,37 decisions,13 endings,8 Bad Ends,3 routes,8247 states.
Its real model used missing-clue and numeric resource conditions, which now map
through shared/workshop-conditions.ts to existing typed game requirements.
Only plain clues, !clue and known-resource integer comparisons are supported;
there is no expression evaluation or generated executable code. Negated clues
must actually be obtainable, contradictory ranges fail, and Ink uses only
compiler-owned variables. Ordinary positive-clue world output is unchanged.
The full three-route read-only audit and actual old-problem path replays are in
docs/workstreams/zhihu-xinghang-resume-audit.md. Missing outline endings and
three truncated premises still require real creative revision.

The actual UI resumed factory as jobb2c3befe-4ad3-4016-b329-5fe011029401, attempt5,
and Xing Hang as job472ed5e8-d8c6-43ae-8bd7-09157c7a3814, attempt4. Xing Hang's
desktop/mobile resume and exact-source reader checks passed, with worker60936
and a fresh source-bound editorial ledger:
output/playwright/zhihu-resume/2026-09-06T13-06-14-417Z/verification.json.
Both screenshots were inspected. The desktop capture exposed a brief stale
previous-failure message during active resume; a bounded UI correction is underway.
Factory is still in the owned structural model repair; its resume check awaits
the fresh independent-review ledger rather than accepting an older ledger.

Current full test run passes583/583:
output/zhihu-resume-tests-2110.log.
Build passes with the existing bundle-size warning:
output/zhihu-resume-build-2110.log.
The19 focused new condition/compiler/actual-Ink/save tests also pass:
output/zhihu-resume-conditions-2100.log.

Current read-only final delivery observer:
output/zhihu-expansion/delivery-2026-09-06T13-07-21-175Z.
It launches no model or paid art request; after real publication it runs strict
whole-world Ink, source, editorial, resource-pressure, browser and save checks.
Neither new game is claimed published or visually ready at this checkpoint.

## Actual Repair And UI Regression / 21:23

Factory's owned model produced the scoped signature repair at13:11:36Z. It adds
one actual recorded-transport statement scene, preserves both previous signature
choices and the independent awning evidence, and keeps distinct next scenes.
The worker's complete graph validation passed before its new full review began.
The current draft has49 scenes including opening,39 decisions and10 endings.
Factory's actual desktop/mobile UI resume is now verified against its fresh
review ledger and owner28664, not the previous failed job:
output/playwright/zhihu-resume/2026-09-06T13-05-41-544Z/verification.json.

Xing Hang completed the new full review at13:14:10Z. It confirms the three former
forced-action cases are repaired, and requests the missing four outline endings,
complete premises, the exact preheating interval in the opening, and attribution
of valve/contact operations to whoever actually performed them. Factory's full
review completed at13:20:55Z and requests independent treatment of the December17
assault allegation, two explicit time transitions, complete outline coverage and
removal of the nonexistent co-signing promise. Both jobs continue their owned
model repairs with inherited model/reasoning; these are not publication passes.

Fixed the stale failure presentation in src/StoryWorkshop.tsx through the pure
src/workshop-status.ts helper. An active resumed job shows current production;
its previous failed review is retained in collapsed historical details. Truly
failed projects retain the full visible failure. Eleven unit tests and TypeScript
pass. Read-only real-current plus explicitly labeled browser-fixture coverage
passes six desktop/mobile cases, with zero writes, page errors or overflow:
output/playwright/workshop-status/2026-09-06T13-18-03-432Z/verification.json.
The resumed-fixture and expanded-history screenshots were inspected; fixture
states are not reported as production events.

The actual original-book regression also passes again on the restored server:
output/playwright/zhihu-experience/2026-09-06T13-18-06-294Z/verification.json.
Desktop/mobile checks cover exact source reading, author avatar loading, existing
source import/deduplication without starting generation, retained paste draft,
real original-game ending clicks, ending/source return and choice history.
Wide1920 and small360 layouts pass too. Current library, source and mobile
ending/source screenshots were inspected. This original-game regression is not
substituted for the two pending new-game acceptance runs.

## Continued Editorial Work / 21:53

After the status correction, the full repository run passes598/598 and production
build passes (existing bundle warning only): output/zhihu-resume-tests-2123.log
and output/zhihu-resume-build-2123.log. The web-game skill client also opened the
actual active workshop and captured current DOM state and screenshot, inspected:
output/playwright/zhihu-resume-skill-20260906-2150/shot-0.png.
This is a workshop smoke check, not a new-game play acceptance.

Xing Hang's first repaired snapshot is now
dce976e4d98dd6e448e9968587e4a6f585af9232dc10c316ff56569d2c622ebd.
Its outline now covers all13 endings; premises are680/731/785 characters and
complete. The opening preheating interval and sample-ending actor attribution
are corrected. Independent read-only compilation and actual cooperative-valve/
contact-operation replay pass, with all old mechanics and source text unchanged.
The exact audit is appended to docs/workstreams/zhihu-xinghang-resume-audit.md.
Its subsequent full model review found one remaining blocking timing issue:
the expanded opening includes at least94 seconds of observed pulses plus checks,
but the return-route entry still occurs too early. That owned second repair also
addresses advisory self-review wording in ending prose; it has not published.

Factory's corrected outline completed at13:34:26Z and first repaired route at
13:42:52Z. The outline now separately describes13 investigation beats and4
investigation endings, and removes the nonexistent trust-gated co-signing promise.
The other scene repairs and final review remain pending.

At this checkpoint, both current creative calls have emitted error events but
remain alive under their original job leases. Their public live receipts do not
contain enough detail to identify the cause, and neither worker has reported a
final failure yet. No duplicate job or manual process replacement was started.
Completed accepted checkpoints remain available for the owned continuation.
The final delivery observer is still running; no new-game or art acceptance is
claimed from these partial editorial results.

## Xing Hang Published And Accepted / 22:41

The first new game is now actually published: Xing Hang: After Shutdown
(Chinese title: 星航：关断之后), project
import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f, version r1,
world workshop-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f-r1.
Final independent model review at 14:24:11.785Z has zero findings, including
zero advisory findings. Exact final draft hash:
37d4f94a06744d650ef601b4450605addcb92d8218a1a5f5ae9aa36a75acaaed.

Actual compiler and Ink runtime acceptance covers 50 scenes, 37 decisions,
13 resolved endings (8 Bad Ends), 3 routes, 8,247 states and all 107 choices.
Every state survives a save roundtrip. Current evidence:
output/workshop-sample/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f-r1-1788704658471/acceptance.json.
The 735-character source remains the exact official search excerpt, with text
SHA-256 c80037bf08e01ce3f879c0414a170dc315dfe3cdfcb18c611bc6c266465a2c05;
it is not described as the complete original, and new endings are adaptation.

Real browser acceptance finished at 14:27:14Z on desktop1440 and mobile390:
all 13 endings in each viewport, introductory guidance, exact source reading
and return, manual save/reload/load, file export/import into slot2 and load.
Two actual return-route oxygen affordability cases were clicked, including
locked costly actions and working free exits. The other two routes did not
reach an affordability block: their minimum decision oxygen is4 and5, and
minimum ending oxygen is3 and2. This is not a claim that all routes reached0.
Every decision still passes hypothetical depletion-exit graph validation.
No page errors or horizontal overflow. Current browser evidence:
output/playwright/generated-stories/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f-2026-09-06T14-24-46-866Z/verification.json.
Desktop introduction/opening/pressure and mobile source/route/ending screenshots
have been visually inspected. A pending-art layout refinement is being checked;
this evidence predates that potential UI-only change.

Art preparation uses the existing service, batch art_bf22d2ed4b03c0d15e60:
50 registered scenes, 0 generated images, 0 native-4K images, 0 approvals.
The inherited service circuit is CLIENT_FAILED_OR_UNKNOWN. No paid image request
was submitted by this lane, and neither publication nor this report claims
visual readiness.

Factory remains unpublished under the original attempt5 worker28664 and job
b2c3befe-4ad3-4016-b329-5fe011029401. Round1 snapshot384f54df0d9aa209f85e1e5d20d27e615ae9797e1d9cf01fde50f0baee91b0a0
compiled50 scenes/40 decisions/10 endings/2,688 states and repaired the five
previous blockers. Full model review then identified three remaining issues:
early recording provenance and chronology, the cost/causality of delaying the
ambulance-number check, and resolving the homecoming mystery on paths that skip
the optional interview. Second-round outline and investigation-route repairs
are saved; the public-route repair is running. Partial audit evidence is in
docs/workstreams/zhihu-factory-run5-snapshot-audit.md, not a publication pass.

Added bounded creative-error classification in server/workshop-creative.ts.
Future workers preserve only safe failure categories in live/final receipts,
including billing precedence over403; raw response bodies, tokens and URLs are
not stored. Four tests include an actual fake subprocess receipt/redaction
check, without model calls. Current already-running workers retain their loaded
module; they were not restarted for this logging fix. Prompt/model/effort/schema
and existing checkpoint identity are unchanged.

Latest full repository run:602/602 passed, production build passed with the
existing bundle-size warning. Logs: output/zhihu-resume-tests-2205.log and
output/zhihu-resume-build-2205.log. Shared4173 remains PID34880; no second restart,
duplicate generation job or commit was performed.

## Reading Layout And Final Closure Continuation / 23:25

Added a generated-story reading layout for scenes without a background image.
Desktop now places prose and choices in adjacent reading columns; mobile puts
prose before choices in one scrolling area. Existing illustrated/authored games
keep their original presentation. The stage resets scrolling on a new scene or
paragraph. Resource costs, locked choices, action feedback and exact game state
are unchanged. The first new layout assertion exposed mobile grid-row shrinkage
under a long oxygen paragraph; max-content row sizing corrects the actual overlap.
The full browser rerun now asserts region bounds, mobile order/no overlap,
desktop column alignment, scrolling and next-scene reset, alongside every ending.

Opening mechanics now hide only an exactly duplicated generated overview, using
src/world-intro.ts; resource explanations, initial/max values and beginner guidance
remain. Eight focused tests and real generated/authored intro tests pass. Evidence:
output/playwright/world-intro/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f-2026-09-06T14-46-31-091Z/verification.json.

Latest Xing Hang engine acceptance is now:
output/workshop-sample/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f-r1-1788707791422/acceptance.json.
Latest full browser acceptance is:
output/playwright/generated-stories/import-32bcca2e-c8e9-47bb-91b1-ee567f3cbe2f-2026-09-06T15-16-57-845Z/verification.json.
These supersede earlier pre-layout evidence. The equivalent immediately preceding
run's mobile oxygen-pressure screenshot was inspected after the overlap fix.
All13 endings, actual pressure exits, source and save/file flows still pass.
Original-library regression also passes again, including1440/390 and1920/360:
output/playwright/zhihu-experience/2026-09-06T15-00-35-393Z/verification.json.

Concurrent workshop/art integration added optional node.artBrief and changed only
the artwork direction in creative policy after Xing Hang was published. The strict
acceptance initially rejected both differences. It now explicitly records complete
legacy absence of optional briefs (49 reviewed briefs,0 stored in this old world),
but rejects mixed/altered briefs and any narrative/state/source mismatch. It also
checks the actual final model prompt, accepted input/output hashes, source/draft,
source-bound observations and successful inherited-model CLI receipt against the
published policy ledger. All current narrative instructions must still match;
an art-only direction change is recorded as historical, never current art approval.
No published draft/world was rewritten or reapproved. Ten focused compatibility
tests cover these boundaries. Xing Hang's report explicitly has
legacyArtBriefsAbsent=true and artDirectionChanged=true; art remains0/50 approved.

Factory attempt5 ended at14:58:53Z with one remaining blocking closure path and
one prose advisory. Its final snapshot14ac3eea80fd3a03c2cfda0b58e08045d6e5329798185e3f82cd344ff8ea69f4
compiles51 scenes,41 decisions,10 endings,5 Bad Ends,3 routes and3,312 states.
The private-only-handwriting/suggest-witness path still reached endings without
hearing the homecoming words. The guarded factory-closure recovery preserves
that exact completed snapshot plus these findings, not a hand-authored repair.
Current recovery receipt:
output/zhihu-expansion/resume-recovery-2026-09-06T15-06-03-126Z-factory-closure/receipt.json.
The old worker and child had exited and its lock was absent before the actual UI
resume. Current attempt6 job16753509-f709-47b6-aea1-880e9a12377e is held only by
worker7984; current policy71f531d7eb953ddc977b417715df081cdf95c47d2019c31d1910b84b4b0b6ce2.
Desktop/mobile resume and exact-source checks passed:
output/playwright/zhihu-resume/2026-09-06T15-06-04-731Z/verification.json.

The fresh full review retained that closure issue and additionally found that an
interrupted livestream did not record the location already spoken before the
choice. It also enforces the concurrent newly selected short scene-art wording;
the text is still not a generated image. The first route repair is accepted and
the next owned repair is running. This is not a publication/acceptance claim.

New read-only delivery observer:
output/zhihu-expansion/delivery-2026-09-06T15-16-30-950Z.
It has accepted Xing Hang and is waiting for Factory. Earlier observer failures
are retained as historical evidence, not hidden or reported as delivery successes.
Full repository tests now pass627/627 and production build passes (existing
bundle warning): output/zhihu-resume-tests-2321.log,
output/zhihu-resume-build-2321.log. No additional server restart, duplicate job,
direct paid art request or commit.

## Final Factory Publication And UI Acceptance / 2026-09-07

Factory attempt6 completed its real independent review at16:09:10.788Z and
published r1 at16:09:12.664Z. Its exact accepted final draft hash is
51fc3c85a0bde65d8fbae4e44eb5f0893492bce1a2cfd0d9c01309b23bdf1e9a,
with zero blockers and zero advisories. All return-route ending states now
include the actually obtained homecoming words; the verification checks this
through real Ink paths, including the previously missing private-letter path.
Actual pressure coverage includes5 public-route free exits at mutual_trust=0
in each viewport. The other routes have minimum balances1 and5; they are not
claimed to reach depletion. Star's2 return-route oxygen affordability cases
also pass in both viewports. Both worlds pass graph checks for a free exit at
every non-ending scene under resource depletion.

The two-game delivery observer completed successfully; its session is no longer
waiting. Worker7984 and its final creative child exited and the project lock
was removed by its owner. Source text remains exactly932 characters with
SHA-256 95a1cf68683692f1033008101351791d05c68dc28ab13f5debdd92f1877c4be2.
No published source, draft, world, Ink variable or stored save was modified for
the subsequent presentation fixes.

Final visual inspection found16 English internal clue IDs in Factory's return
route. src/clue-labels.ts now supplies source-specific Chinese display labels
only for that exact published world/revision. App outcome, journal/history and
locked-choice descriptions use the labels; original IDs still drive conditions,
source matching and saves. Unknown clues, future revisions and authored games
retain their original names. The optional choiceBlockers formatter changes only
explanations, not predicates or cost checks. Three new tests verify all aliases,
identity fallback, no mutation, and raw-ID gating even when labels coincide.

Latest actual screenshots inspected include Factory desktop/mobile clue journals
and the signed-ending feedback, plus Star's latest reading/pressure screens.
They live alongside the two final verification.json files in Current Delivery.
The skill-client smoke run is output/playwright/zhihu-clue-skill-20260907;
its onboarding screenshot and render_game_to_text state were inspected.
The preceding17:09 browser run stopped on an ambiguous test selector matching
both the toolbar and ending's history buttons; the final run scopes that selector
to ending actions. That failed evidence remains recorded, not passed off as success.

Art handoff remains art_bf22d2ed4b03c0d15e60 (Star50 scenes) and
art_8722cd196d766bd0bfbf (Factory51 scenes), both0/0/0 generated/native/approved
with the inherited NATIVE_4K_GATE_FAILED service pause. Text publication does not
clear that pause or certify artwork. Any paid production/recovery belongs to the
art owner through the existing service contract. Shared4173/PID34880 is retained.

## Choice Presentation Follow-up / 2026-09-07

The later UI-only request removed result previews from all player-facing choice
buttons. Hints and positive gains are no longer rendered before selection;
negative resource costs remain. This does not change route predicates, Ink state,
stored drafts or saves. A live audit counted 1,941 choices across 20 playable
worlds and found no parenthetical choice text. Full tests now pass 645/645 and
the build passes. Both imported-story browser verifications were rerun after the
change, with all endings/source/save/pressure checks and zero visible choice
hints under `output/playwright/generated-stories/`. This is a presentation
change only; art remains pending and no new generation or paid art request occurred.
