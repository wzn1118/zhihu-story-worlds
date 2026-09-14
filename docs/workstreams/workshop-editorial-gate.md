# Generated-story editorial gate

## Implemented / bounded integration handoff

2026-09-06. The editorial module and injected-generator tests are ready for root
review. This implementation has made **zero model calls**. The real sample has
not received an editorial pass from this lane.

This lane owns only `server/workshop-editorial.ts`,
`tests/workshop-editorial.test.ts` and this document. Worker, compiler, shared
schemas/types, frontend and live sample files remain with their owners.

The stage accepts a full `ImportedSource` and `GeneratedDraft`, retains an
immutable input snapshot, requests an independent structured review through the
existing configured `runCreative`, repairs only evidence-backed targets, and
reviews the complete updated story again. Compiler validation and publication
remain separate, mandatory integration steps. Tests inject the generator.

## Exported API

```ts
reviewAndRepairStory(
  source: ImportedSource,
  draft: GeneratedDraft,
  options: EditorialOptions,
): Promise<EditorialResult>

assertEditorialPass(
  source: ImportedSource,
  draft: GeneratedDraft,
  report: EditorialReport,
): void
```

`EditorialOptions`:

- `directory`: private staging root. The stage creates its own hashed child
  directory here. Use an unpublished working revision or a separate staging
  tree; keep published versions outside this write path.
- `maxRepairRounds`: integer 0–3, default 2. Zero means review-only. Two allows
  an initial review, two rounds of targeted repair and two complete re-reviews.
- `generate?: typeof runCreative`: dependency injection for tests; omitted in
  production to use the existing configured structured-JSON engine. Each review
  is an independent ephemeral call receiving the complete source and current
  draft, without the writer's conversation history. Model and reasoning remain
  inherited from `runCreative`; this module adds no model flags or credentials.
- `onChild?: (pid?: number) => Promise<void>`: forwarded unchanged to the engine
  for the existing owner's lease/heartbeat handling.
- `onCheckpoint?: (checkpoint: EditorialCheckpoint) => Promise<void>`: called
  after durable acceptance, including cache reuse. Receives `label`, `kind`,
  `round` (zero-based), `draftHash`, absolute accepted-file `path`, and `reused`.

The result contains a cloned/revised `draft`, structured `report` and absolute
run `directory`. Caller input objects remain unchanged. `EditorialReport`
includes full source/input/final hashes, source scope, round budget, every full
review and repair checkpoint label, remaining findings and counts. Its status
is `passed` only when the last whole-story review has zero blocking findings.
Advisory prose findings stay visible, including at the round limit. Every
report carries `compilerValidation: 'required'`.

Additional exports: `editorialProtocol`, canonical `editorialHash`,
`editorialReviewSchema`, `editorialReviewPrompt`, `validateEditorialReview`, and
the evidence/finding/review/checkpoint/round/report/options/result types.

## Review contract and repair scope

Findings cover continuity, source contradictions, choice causality, resource/text
consistency, ending closure and concrete prose. All categories except prose
require `blocking` severity. Review coverage must list every actual route and
scene exactly once. The prompt requires reading every choice transition and
path-dependent ending, including evidence retained on failed paths.

Each finding supplies actual location IDs and a JSON pointer relative to that
location, with a verbatim substring from the addressed string:

- `opening`: `outline.opening`; unused IDs are `null`.
- `outline`: the complete outline, e.g. `/routes/0/commitment`.
- `route`: a real route ID; only `/entry` or `/routeId`. A finding also needs a
  prose quotation, so an identifier alone cannot substantiate a defect.
- `scene`: actual `routeId` and `sceneId`, e.g. `/text/0` or
  `/ending/resolution`.
- `choice`: actual `routeId`, `sceneId` and `choiceId`, e.g. `/hint`, `/feedback`
  or `/needs/0`.

Unknown IDs/fields, fabricated quotations, duplicate findings, partial coverage
and unevidenced repair targets fail validation. `basis: 'source_fact'` requires
verbatim `sourceQuotes` from the **full supplied source**. Invented continuation
is labeled separately. Outline fact quotations must remain exact source text;
this protects attribution but leaves factual interpretation to creative review.
Valid identifiers and quotes establish traceability, not proof that a model's
literary judgment is correct.

Repair targets are explicit `outlineFields` and `routeIds`. Outline repair uses
a schema containing only the cited top-level fields; route plans without cited
outline evidence remain unchanged. Affected routes are regenerated individually
as complete `RouteDraft` objects using the existing `routeSchema`. All other
routes remain byte-equivalent JSON data. Route/scene/choice identity and existing
entry IDs are retained; choices may be added within schema limits. Costs, clues,
local edges and prose can change with evidenced narrative cause. Every round
then re-reviews the **entire** updated story, including untouched routes.

The module performs shape/identity/source-quotation validation, not compiler
validation. A graph-invalid but shape-valid draft can still be reviewed. Missing
required draft fields or ambiguous IDs fail before generation. A failed repair
is retained as rejected output, never substituted with template fiction.

## Persistence and normal resume

Caller must hold the existing worker/job lease throughout the call. Before
resuming, that owner must establish that a prior creative child has stopped, as
required by `runCreative`'s own completed-output recovery. This module creates
no extra worker, supervisor or process-control mechanism.

Run identity combines protocol, full source hash, original draft hash and round
budget. Same input/options reconstruct the same run; any changed source or
draft creates a separate run. Object-key order alone has no effect. Inside:

```text
workshop-editorial-v1-<24-hex-run-prefix>/
  input.json                         # complete immutable original source/draft
  round-0.draft.json                  # complete immutable review input
  <kind>-r0-<24-hex-input-prefix>.input.json
  <kind>-r0-<24-hex-input-prefix>-a1.request.json
  <kind>-r0-<24-hex-input-prefix>-a1.accepted.json
  <kind>-r0-<24-hex-input-prefix>-a1.rejected.json  # only on invalid output
  creative/<label>.*                 # existing engine output/receipts
  result.json                        # complete draft/report, passed or blocked
```

Checkpoint identity includes full current draft/source hashes, prompt, schema,
kind and round. Full hashes remain in metadata; filenames use short prefixes to
limit Windows path length. Snapshots and accepted results are published through
exclusive atomic hardlinks; existing bytes are compared instead of overwritten.
Cached output hashes, schema, actual evidence and repair scope are revalidated
on each resume. A mismatched/corrupt cache raises an error.

Accepted work is durable before the callback fires. If the callback or a later
route fails, rerunning with the same **original** inputs reconstructs completed
repairs and continues pending work. Invalid structured output is saved with its
validation error and the call fails; normal resume uses a distinct attempt
label and supplies that error to the generator. Each checkpoint has at most two
such output-validation attempts. Engine errors propagate and retain the engine's
own recovery files. There is no internal paid-call retry loop.

Exhausted blocking reviews return `blocked` with the partially corrected draft;
same-input resume retains that result rather than resetting its budget. An
explicit owner-managed new attempt or revised input is a separate run, never a
retroactive acceptance. Root should also bound any outer compiler/editorial
retry series. Bump `editorialProtocol` for future semantic/prompt revisions;
input-bound checkpoints must keep their original meaning.

## Integration point (root-owned)

Run after the three route drafts have been assembled, before publication/art
registration. Structural repairs may precede it, but every subsequent compiler
repair invalidates the old editorial pass and requires a new whole-story review.

```ts
const checked = await reviewAndRepairStory(source, draft, {
  directory: editorialStagingRoot,
  maxRepairRounds: 2,
  onChild: updateExistingOwnerHeartbeat,
  onCheckpoint: persistEditorialProgress,
});
// Owner persists/surfaces the report, including a blocked result.
assertEditorialPass(source, checked.draft, checked.report);
const built = buildGeneratedWorld(id, revision, source, checked.draft);
// Only after both gates: owner publishes this exact draft/world revision.
```

`assertEditorialPass` verifies source scope/hash, current draft hash, protocol,
final full-review snapshot, evidence, remaining findings and counts. Use it at
the actual publication boundary, especially after any intervening draft change.
Compilation is mandatory even for editorially passed output; later repair means
another review of the changed whole draft. No earlier compiled world should be
published in place of the reviewed draft.

Read-only integration observation at 11:33: root/workshop has concurrently added
`workshop-editorial-job.ts` and a worker call between structural repair and final
compilation. Those files belong to their owners and were untouched by this lane.
The new `assertEditorialPass` helper is available to strengthen that boundary
beyond checking `status`, `blockingCount` and draft hash alone. This observation
does not certify execution or publication of the live sample.

## Read-only sample grounding

Read-only sample: `import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10/r1`.
The assembled draft read during this turn has SHA-256
`c9660444504ea707d70b803931c4b2b9c55c4a2a67402430061e2954f4362402`.
Its source is the workbench's `original-seed`. The common opening still stops
at the warning/intercom, while the outline assumes the gunshot, wrist injury
and loss of the gun already happened. The review protocol examines actual
opening-to-entry transitions, choice-to-next-scene transitions and every ending,
including paths that retained evidence. Existing review findings are recorded in
`generated-story-prepublication-review.md`; their acceptance is tied to the
reviewed snapshot, not to later drafts.

Actual locations inspected include `bring_her_back_03_register` /
`bring_her_back_03_hide_signature`, `bring_her_back_04_clock` /
`bring_her_back_04_keep_preset`, `close_the_station_02_badge` /
`close_the_station_02_leave`, `let_the_record_speak_11_seal_the_record` /
`lr11_seal_radio` and `lr11_seal_physical`, and `close_the_station_05_pressure` /
`close_the_station_05_pump`. The stage receives current draft data instead of
hard-coding these IDs or assuming every older review location still exists.

## Verification

Focused commands run with injected generators only:

```text
node node_modules/tsx/dist/cli.mjs --test tests/workshop-editorial.test.ts tests/workshop-validation.test.ts
node node_modules/typescript/bin/tsc --noEmit
```

Results: **15/15 tests passed** (11 new editorial tests, 4 existing validation
tests); **typecheck passed**. The common-opening regression first compiles an
actual 37-node test draft through `buildGeneratedWorld`/Ink, then demonstrates
that an independent editorial finding still blocks it. This intentionally
synthetic fixture is marked as test text throughout.

Coverage includes opening-only repair, fabricated scene/choice/route/quote
rejection, complete coverage, bounded unresolved findings, affected-route-only
repair, source/draft cache invalidation, clean pass without repair, completed
repair reuse after interruption, cache tampering, scope/identity protection,
advisory reporting and final pass/hash assertion. Tests contain no real model or
image requests and do not read/write the active sample.

No model call, sample stop/resume, service restart, publication or image request
is made by this implementation turn. Root will run the real stage after the
workshop owner releases the sample.
