# Art production service — stable v1 contract

Published 2026-09-06 by art-production. Implementation entry: `server/art-production.ts`;
browser-safe DTOs: `shared/production.ts`. Workshop owns HTTP routing and UI. No shared
server restart is required or performed by this owner.

## Actual batch resume / 2026-09-10

The latest direct user instruction renewed bulk-production authorization. The
previous release and pause records were archived; formal wave 40 submitted 21
evidence-pinned character corrections with concurrency ceiling 32. Each job made
one POST and delivered its original PNG, with zero new unknown image outcomes.
Twenty assets used correction 1; one used correction 2. No unknown identity was
resubmitted and no global source/style revision was bumped.

All 21 originals are pending independent visual review because each owner CLI
exited with model HTTP 403 before image inspection. The new pause is
`AWAITING_VISUAL_REVIEW`; bulk authorization persists, but the next fresh wave
must wait for this wave's actual reviews. Model-review transport and image-service
delivery are separate facts. The prior review-only hold below is historical.

## Review scheduling correction / 2026-09-10

Review lanes prioritize delivered jobs without an imported review before legacy
evidence completion, with character anchors first inside each group. Launcher
receipts record the exact selected job IDs. Selection and supervisor use one
predicate for matching identity/SHA, full-image/native-detail/style flags,
decision, reviewer and concrete notes; incomplete records remain review work.

The review sync watcher acknowledges a file marker only after the status importer
exits successfully. Failed imports retry unchanged markers after bounded backoff,
and logs retain safe exit code/signal or spawn code. A successful process exit is
an import result, not proof that an image was visually accepted. Legacy service
review counts and sidecars with complete current evidence must remain distinct.

Formal `status` prepares dependency revisions and imports evidence, so it is a
mutation. Service `listArtBatches/getArtBatch` and gallery reads do not acquire the
write lease. Revoking a character anchor may retire dependent current revisions
without any sourceHash or promptHash change; historical assets remain visible.

Fresh paid work is still held by the current pause/release records. These review
repairs do not authorize new POSTs or release quarantined identities.

## Current Policy / 2026-09-07

Latest style-correction checkpoint: formal bulk dispatch is intentionally paused
after wave 17 while closer film-frame transfer is evaluated. The successful
comparison route separates a film drawing reference from the original subject
reference and keeps the image prompt short. Seven actual studies are in
`style-repair-20260907-1530/`; their `reviewed-results.json` is separate from the
formal asset manifest. Files existing in `public/generated-art` alone do not
grant approval, current-node binding, or automatic game integration. Resume the
formal queue only with the corrected route and retained identity/source guards.

The latest user explicitly prioritizes drawing style over image quality. Call
`prepareArtBatch({ world, qualityPolicy: 'style-first' })` to select that policy.
It persists per batch and appears in the safe batch DTO. Omitted policy preserves
existing batches; new batches default to the legacy `native-4k` policy. Switching
policy never resets attempts, hashes, job IDs, old reviews or uncertain requests.

For `style-first`, a complete distinct original can be manually approved and
count toward coverage at its actual dimensions. `native4k` remains factual and
`resolution_mismatch` remains visible, but small dimensions no longer open a
circuit breaker. Duplicate detection, integrity and current-revision checks remain.
Formal scene references accept approved original cast anchors at any resolution.

`node --import tsx scripts/art-production-formal.ts supervise --max-wave=32`
runs continuous fresh waves. Historical unreviewed images do not stop unrelated
new jobs. `--once` retains one-wave operation. Image HTTP 429 uses a persisted
60-900 second cooldown before other untouched jobs; it never repeats an uncertain
paid POST. Known prompt rejections and quarantined transport identities do not
freeze all other stories. 401/402/403 stop spending. Recovery uses saved responses
only, at most twice per recovery identity in the supervisor state.

New manual review records may set `styleReviewed: true`; full-image inspection
and actual asset hash are required. Explicit style re-review can supersede an old
size-based decision. Delivery, style review and approval counts stay separate.
The supervisor reports complete only when all current assets have real files and
style approvals. The older stricter wave descriptions below are historical.

```ts
import {
  prepareArtBatch, listArtBatches, getArtBatch,
  runArtBatch, pauseArtBatch, reviewArtJob,
} from './art-production.ts';

await prepareArtBatch({ world, minimumImages: 30, qualityPolicy: 'style-first' }); // optional nodeIds: string[]
await listArtBatches();
await getArtBatch(batchId);                         // ArtBatch | null
await runArtBatch(batchId, { maxJobs: 2, concurrency: 2 });
await pauseArtBatch(batchId);
await reviewArtJob(batchId, jobId, {
  decision: 'approved', reviewer: 'NAME', notes: 'actual visual findings', // or rejected
});
// Saved response/archive recovery, zero new paid POSTs:
await runArtBatch(batchId, { recoverOnly: true, maxJobs: 30, concurrency: 2 });
```

All functions return Promises. Mutations return the current `ArtBatch`. `run` starts
a detached durable worker and returns promptly; it does not await paid generation.
`pause` stops new scheduling, not an already transmitted request. Repeated `run`
while already running is idempotent. Default run budget is **2** new jobs, concurrency
defaults to **2 globally**, with explicit supported limits **1–32**, including
separate callers/processes. The effective global limit is the highest active
reservation, capped at 32; each batch also obeys its own limit. New paid jobs
require an explicit run call; preparation alone never spends credits.

`world` is a structural snapshot compatible with authored/compiled GameWorld:
`id`, `storyId`, `title`, `version`, `nodes`, `characters`, `source`, optional
`introduction`, `summary`, `adaptation`. Each node retains real `id`, `title`,
`location`, `time`, `text`, `choices`, optional `speaker`, `character`, `ending`.
No Ink compilation is required by this service. Imported world IDs are independent
of source IDs and need not be Zhihu IDs. Node IDs are never invented to fill a quota.

Formal production also accepts `jobKinds: Record<nodeId, ArtJobKind>` where kind is
`scene`, `character-anchor`, `character-reaction`, `cover`, or `environment`.
Ancillary nodes use the reserved `__art_` prefix in art-only augmented snapshots;
they never modify authored stories and never count toward the 30-scene minimum.
`progress.sceneCurrent` and scene-only `required/covered/missing/sceneShortfall`
are separate from `ancillaryCurrent/Generated/Native4k/Reviewed/Approved/Covered`.

Current formal controller: `node --import tsx scripts/art-production-formal.ts`
with `prepare`, `status`, `run`, and `review` commands. It keeps all 20 stories'
asset requirements and dependencies in `formal-production-20260907/state.json`.
Scene requests wait for each explicitly present person's approved native fixed
anchor, verify its bytes, and use those same references rather than chaining
generated scenes. Changed source nodes remain held for their art owner. Paid
revisions with uncertain outcomes remain quarantined across prompt changes.
The rejected legacy film profile is not globally re-enabled. No server restart.
Formal `run` and `supervise` continue fresh waves until completion or a persisted
hold; `--once` explicitly limits execution to one wave. Review is independent of
unrelated fresh production. The service API still accepts bounded caller-selected
jobs independently, with default concurrency two and explicit maximum 32.
`--max-wave=N` accepts 1 through 32; `--job-ids=id,...` preserves exact bounded
one-wave selections. An in-flight request finishes after a pause or gate change.
Every received image still requires actual style review before final acceptance.
Same-process writers sharing a store are queued before taking the cross-process
file lock. A generated client's PID is still committed before its START token;
the serialization fix does not relax the paid-request handshake. Internal error
stages remain private, and public errors retain only allowlisted safe codes.

Preparation upserts one stable batch per world. Each scene has one independent job,
keyed by world/node + a source/brief/reference-content SHA-256 revision. Re-preparation
reuses unchanged jobs and marks replaced/removed revisions stale, preserving history.
`nodeIds` optionally limits preparation; omit it for complete current node coverage.
Every node is prepared, including endings; minimum 30 is a **coverage requirement**,
not a claim of 30 files. A world with fewer nodes reports the remaining shortfall.

Public snapshots contain batch/job IDs, real world/node IDs, source hashes, progress
counts, requested size, actual width/height/bytes/SHA-256, native-4K verification,
manual review, safe error codes, and `/generated-art/...png` asset URLs only. They
never contain prompts with private paths, credentials, signed upstream URLs, recovery
paths, archive paths, CLI logs or private environment configuration. Native 4K for
landscape scenes requires original decoded pixels >=3840x2160 and 16:9 within
0.5%. Character anchors/reactions may request 2:3 portrait; those require original
width >=2160, height >=3840 and 2:3 within 0.5%. Long edge alone never qualifies.
Geometry participates in revision identity; scene jobs stay landscape. No
resize/upscale occurs in the delivery pipeline.

The art-only brief builder can persist a `blockedReason` for unresolved source or
fixed-anchor dependencies. Such jobs are prepared and visible but not dispatchable;
resolving a dependency creates its own source/reference revision. The formal
controller's `status` command synchronizes preparation and imports review records;
use service `listArtBatches` / `getArtBatch` for genuinely read-only inspection.

Counts distinguish generated files, native-4K candidates, manually reviewed jobs,
approved coverage, queued/in-flight, blocked, unknown-outcome, failed, rejected and
stale. An image is not covered until native, distinct, current and manually approved.
Review approval is rejected for missing, stale, duplicate or non-native files.

Additive v1 fields: `progress.deliveredTotal/reviewedTotal/paidAttemptsTotal` include
all historical revisions; `generated/reviewed/native4k/covered` concern current ones.
`job.failureHistory` preserves earlier HTTP errors after recovery attempts.
`run` accepts optional `jobIds: string[]` for precise calibration selection.
An uncertain prior revision also blocks a NEW revision of the same world/node
from paid submission; changing text or prompt is not an uncertainty bypass.
`recoverOnly` may select stale historical job IDs to restore an archive without
counting it as current scene coverage. Non-native or duplicate deliveries stop
further paid expansion immediately. Historical `unknownOutcomeTotal` stays visible
even if revised text makes an unresolved attempt stale.

**Integration completed by root:** exported `artPrivateFileGuard` is mounted in
`server/index.ts` before Vite/static middleware. Do not mount it again in app.ts.
It denies raw `/output`,
`.private`, `.recovery.json`, and encoded `/@fs/.../output` paths. DTOs and
`/generated-art/...png` stay available. This owner does not edit shared app.ts.

The service records the paid attempt before spawning the safe Python client. It
never retries an uncertain POST. HTTP 402/403/429 (also auth/service failures) stops
new scheduling globally and persists a circuit breaker. `recoverOnly` uses saved
response/archive records only. A funding confirmation can clear a circuit for
**untouched queued jobs only**, via `runArtBatch(id, { acknowledgeBlock: true, ... })`;
blocked or uncertain jobs are never reset to queued by that flag.

Suggested workshop routes (workshop-owned): `POST /api/art/batches`,
`GET /api/art/batches`, `GET /api/art/batches/:id`,
`POST /api/art/batches/:id/run`, `/pause`, `/jobs/:jobId/review`.
Treat run/acknowledge as explicit credit-spending actions, not page-load effects.

Implementation status and live production evidence: `docs/workstreams/art-production.md`.

## Short Prompt Character Continuity / 2026-09-07

The callable API remains unchanged. The following is an art-authoring and manual
review rule, not a new automatic identity guarantee or a reason to clear the held
film-profile gate.

- Keep the style cue and scene action short. A tested candidate template is
  `吸血鬼猎人D画风，参考图同一女性，脸型发型服装不变，<场景动作>。`.
  Identity checklists stay in metadata/review files, not appended to the prompt.
- Bind a real character ID and costume version to fixed approved anchor bytes.
  The existing reference-content hash participates in scene revision identity.
  Send that same anchor for each scene; do not recursively substitute the last
  generated scene, and do not share one actor image across unrelated story casts.
- The new `identity-lock-20260907-0214` experiment uses a calibration-only female
  anchor. It is not Fang Nuo or another authored character's replacement design.
  Its `experiment.json` records the immutable anchor ID/hash and exact requests.
- Independent angle references, when needed, require review against the original
  anchor before entering a character reference set. Keep them as separate images,
  not collages. A fixed seed or repeated name is not identity verification.
- Review face structure, hair outline, costume construction and visible accessories
  separately from pose, expression, style, scene fidelity and actual resolution.
  A passed continuity study alone does not approve an undersized or wrong-scene
  file for production. No scene counts are created by this calibration metadata.

Future multi-person scenes must explicitly bind each supplied reference to its
own cast ID; using several unassigned faces invites identity blending. Current
single-character tests do not validate that multi-person workflow.

## Queen-preferred Film Profile / 2026-09-07

The prepare/list/get/run/pause/review callable API is unchanged. Existing artist
modules now read the optional `film-frame-20260907` per-owner direction books at
call time. Current source snapshots, exact short prompts and both reference hashes
participate in preparation; a stale source stops preparation rather than selecting
an unrelated fallback. No shared server restart is required.

Art-owner commands:

```text
node --import tsx scripts/art-production-film.ts prepare
node --import tsx scripts/art-production-film.ts status
node --import tsx scripts/art-production-film.ts next
node --import tsx scripts/art-production-film.ts dispatch
node --import tsx scripts/art-production-film.ts resume
node --import tsx scripts/art-production-film.ts review JOB_ID approved|rejected REPORT_PATH
node --import tsx scripts/art-production-film.ts correct KNOWN_REJECTED_JOB PROMPT_PATH
node --import tsx scripts/art-production-film.ts hold KNOWN_REJECTED_JOB REASON
node --import tsx scripts/art-production-film-expansion.ts audit
node --import tsx scripts/art-production-film-expansion.ts prepare
```

Preparation freezes 40 fresh identities across 20 authored stories without any
paid request. Dispatch reserves at most two different worlds; prior wave images
must have actual current distinct 4K files and manual approval, or an explicit
known-delivery hold after recorded rejection. A hold skips the exact failed node,
never counts it as covered and never permits another paid attempt. It does not
clear a global circuit by itself. Uncertain submissions cannot use this hold.
`resume` only
continues the exact recorded untouched paid0 selections, never a transmitted POST.
An existing inspected native gate needs its exact explicit timestamp argument;
no HTTP funding/auth/rate/unknown gate is automatically acknowledged.

Known rejected files can receive one separately recorded corrective revision via
`correct`; preparation is free, then the normal two-slot dispatcher is used. The
source, previous paid attempt, original file and rejection remain in lineage. The
correction prompt/reference hashes create a different immutable job. Queued paid0
corrections may be revised before dispatch, never after transmission. `effective`
wave rows track the current correction without rewriting the frozen original wave.
Historical delivery/review/paid totals are separate from current approval counts.

The worker now validates film selection, saved intent, current source and references,
and prior reviews before claiming paid work, including requests scheduled by an
older already-running HTTP service. The art-only CLI uses a pure `wakeArtWorker`
after reservation; it does not undo a user's intervening pause. Atomic replacement
has bounded Windows sharing-violation retries, unrelated to paid network retries.

Expansion preparation seals all three source-checked books by file hash, preserves
the first 40 prompts byte-for-byte, and creates at least 30 current jobs per story.
It makes no paid calls and does not silently expand the approved dispatch scope.

The status file is `output/imagegen/scene-production/film-frame-20260907/status.json`.
It distinguishes prepared, paid, generated, reviewed, native4k and approved, and
uses only service-safe asset URLs. Queen preference is an internally reviewed
style baseline, not approval of all generated assets. Old V1 holds remain intact.

# Native pixel calibration update / 2026-09-06

`ArtJob.requested` may additionally include `pixelSize: '4096x2304'` for a
native-size calibration. This is a backward-compatible optional field. The safe
client uses the documented explicit pixel-size request instead of, never alongside,
the aspect-ratio/resolution pair. The request mode participates in immutable job
identity; actual returned dimensions and native-4K filtering remain authoritative.
This does not resize any output and does not allow an uncertain POST to be repeated.

`DelegatedArtDirection`/`SceneBrief` and the public `requested` fields also accept
optional `quality: 'high'` for an explicitly selected native-quality calibration.
This uses `16:9 + 4K + high`, never together with legacy `pixelSize`; conflicting
geometry is rejected before the Python paid marker. The quality field participates
in immutable job identity. Existing job attempts remain unchanged. This is a
documented request hint, not proof of native output: actual decoded pixels still
control native-4K acceptance.

## Actual Frame Batch / 2026-09-06

The callable service API is unchanged. `server/art-production-references.ts`
exports the current actual-frame reference revision, reference order and shared
medium instructions. The first two unchanged user JPGs are character-medium
studies; the third is background-medium only. Original identity anchors follow
them within the six-image input cap. Reference-content hashes remain private
inputs to job revision, not signed provider URLs.

Art-owner commands:

```text
npx tsx scripts/art-production-vhd-batch.ts prepare WORLD_ID
npx tsx scripts/art-production-vhd-batch.ts status
npx tsx scripts/art-production-vhd-batch.ts dispatch JOB_ID [SECOND_JOB_ID]
npx tsx scripts/art-production-vhd-audit.ts
```

The read-only audit checks every actual authored node against its individual
artist direction, prepared material, current job and reference hashes. Its
838 prepared materials are not 838 generated images. Dispatch first reserves
both explicit selections durably, then wakes the existing worker, retaining
the global two-request limit. Inspected historical rejection flags accept only
the exact recorded error/time/job and never permit retrying that rejected node.

User-directed visual calibration may use `--inspected-native-gate=EXACT_ISO_TIME`
after all delivered sub-4K files have recorded rejection, or
`--inspected-rejection-job=EXACT_JOB_ID` after a definitive structured rejection.
The latter must match the current circuit's exact durable failure event and
does not permit selecting that same world/node. These flags do not acknowledge
HTTP 401/402/403/429, transport timeouts or uncertain outcomes. They are explicit
art-owner CLI actions, not automatic HTTP/UI behavior. Input identity is checked
from the actual ordered reference paths and content hashes, not by requiring a
revision label to appear in the creative prompt text. Compact self-contained
artist prompts retain the same source/reference provenance checks.

Preparation validates actual-frame inputs and exports source-specific materials
and safe job receipts under `output/imagegen/scene-production/batch-vhd-20260906/`.
It never spends credits. Dispatch accepts only exact untouched current jobs,
revalidates source/prompt/reference hashes, limits concurrent requests to two,
and never releases the historical uncertain dinner identity. Any new gate needs
inspection; there is no automatic retry or bulk circuit acknowledgment loop.

`status.json` separates the 20 authored stories from older/imported service
batches. Prepared requirements, actual generated files, native dimensions,
reviewed files and current approvals are separate counts. It retains new-release
deliveries in generated/reviewed totals even when a later source change makes
them stale; only current jobs can count as approved coverage.

Worker/client dispatch now has a START handshake: the child PID is durably
recorded before the adapter can enter its paid path. Failure to persist that
record closes stdin without START and reports DISPATCH_NOT_CONFIRMED_NO_POST.
Neither this guard nor any request hint can certify output quality or resolution.

## Published imports / 2026-09-06 14:20

The callable prepare/list/get/run/pause/review API and workshop binding remain
unchanged. The art-only source watcher additionally discovers published imported
worlds through `server/art-production-published.ts`. Its fingerprint uses the
published revision and exact final world bytes, not draft/editorial progress.
Unpublished world files do not trigger preparation. Publication version and world
identity are validated before use; refresh rechecks the publication before prepare.

`node --import tsx scripts/art-production-published-refresh.ts IMPORT_PROJECT_ID audit|refresh`
audits or prepares the currently published world with current source/prompt/reference
hashes. Both modes make zero paid requests; neither publishes story text nor bypasses
a production circuit. Original old-version jobs/saves remain history. Imported r1
has been refreshed but stays unapproved and unpaid while revised r2 is unpublished.
The historical optional size/quality fields above describe compatibility only,
not permission or evidence for another equivalent-parameter paid probe.

## Cross-Story Waves / 2026-09-06 15:25

The accepted internal style pilot and its exact review evidence are documented in
`docs/workstreams/art-production-style-pilot.md`. The art-only wave CLI verifies
that this pilot is current, approved, native, distinct and unchanged on disk before
building or dispatching a production wave:

```text
npx tsx scripts/art-production-wave.ts prepare first-forty
npx tsx scripts/art-production-wave.ts status first-forty
npx tsx scripts/art-production-wave.ts next first-forty
npx tsx scripts/art-production-wave.ts dispatch first-forty
```

Preparation writes an exclusive durable selection of two fresh independent nodes
per authored story, 40 total, with exact source/prompt/reference hashes. The order
covers all twenty stories before a second scene in any story; worlds with fewer
historical deliveries start earlier. Artist-selected source moments are preferred.
Already paid or uncertain identities are excluded across all revisions. A changed
source or direction stops use of that saved selection rather than silently replacing
its jobs. This forty-scene wave is a subset of the 838-scene authored queue.

`next` is read-only. `dispatch` explicitly reserves at most two exact jobs through
the existing guarded dispatcher, accounting for all other in-flight jobs. Delivered
wave images require manual review before the next dispatch. Existing circuit
inspection flags remain explicit and retain their exact evidence checks; no
automatic acknowledgment, paid retry, background budget loop or approval occurs.
Wave status distinguishes selected requirements, paid attempts, returned images,
reviews and approvals. A returned but rejected image is never counted as completed
scene coverage. The workshop's stable callable API is unchanged.

After a saved-response recovery actually delivers a reviewed file, the exact
`--inspected-recovered-job=JOB_ID` flag can acknowledge its matching historical
TRANSPORT_TIMEOUT_UNKNOWN event. It requires one original paid attempt, a completed
recovery, original distinct pixels and manual review; a non-native result must be
rejected. It never acknowledges funding/auth/rate failures or a still-uncertain
submission. The file remains subject to normal visual and native acceptance.

`art-production-vhd-batch.ts resume JOB_ID` restarts only a previously recorded
selection that is still current, queued and paid0 with identical source, prompt,
reference and batch identity. It preserves the original intent and writes a
separate resume receipt. It cannot repeat a paid attempt. A running batch's selected
jobs remain frozen; another selection waits for it to finish.
# High-Concurrency Transaction Rule / 2026-09-07

For a single Node process and private store, service transactions are queued by
the canonical state-file key before acquiring the cross-process `state.lock`.
Child PID persistence may be coalesced into one atomic transaction for a same
event-loop wave. A client receives `START` only after that transaction commits.
The cross-process lease, PID ownership checks, atomic state/manifest replacement,
and safe error-stage codes remain mandatory. This reduces repeated writes of the
large private state and public manifest during explicit concurrency-32 runs; it
does not infer that an upstream request was uncharged.
