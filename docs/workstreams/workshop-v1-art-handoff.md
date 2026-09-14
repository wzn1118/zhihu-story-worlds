# Workshop V1 Art Handoff

## Film-Frame Calibration / 2026-09-07 01:06

The art owner's newest report supersedes the text-only V1 calibration for future
production direction. User preference is **queen refinement** (`皇后更接近`), not
the Blue Blood training image. The preferred single image is
`output/imagegen/scene-production/palace-film-refine-20260907-0032/delivery/palace-film-refine-01.png`,
4096 x 2303, SHA256
`3b327ab8c06b97e46a7c8480d78a397baa2af38a558c242da756dd87eb058197`.
It passes an internal single-image review only; it is not blanket approval for
all worlds or a reusable character asset.

The Blue Blood training image is 4096 x 2304 but rejected: the grasp is on the
upper sleeve rather than the cuff and Zhang Wei's broad cheek/jaw identity is
too weak. It is not a template. The tested production profile uses a concise
original-cast/location/action description, an actual film-frame input and an
explicit native-4K request; provider phrase causality remains unproven. The old
zero-reference V1 route stays held.

The first wave is **prepared, not complete**: 40 distinct scenes (two per each
of 20 authored stories). Its latest status records 4 historical paid attempts,
4 delivered files, 3 reviewed, 2 current generated, 1 current native4K, 0
approved, 38 queued, no in-flight work, and a `NATIVE_4K_GATE_FAILED` breaker.
The wave is a coverage plan, not 40 finished illustrations and not the
per-story minimum. The three historically uncertain identities remain excluded.
No resume or new paid call was made by this workshop handoff.

## Exact-Form Test / blue-blood-v1-userphrase-20260906-2316

Read the complete `prompt.txt`, safe `manifest.json` and parent `review.md` in
`output/imagegen/scene-production/blue-blood-v1-userphrase-20260906-2316/`.
This distinct test used the requested `以吸血鬼猎人D画（人物和场景描述）`
structure, one selected V1 reference, no rejected-scene reference and empty
requirements/negative fields. It is not the earlier2310 prompt test relabeled.

The delivered1672x941 PNG has SHA256
`b7f47d035d0d951636bec12d1823e2471e283999173562cce3e865f45a18c876`.
Parent decision is `not_approved`: soft facial shading and makeup-like eyelashes
remain, with additional character-identity drift. Recorded counts are0 approved,
0 native4K and0 new distinct narrative scenes. Preserve it as a comparison only.

Bulk style hold is unchanged. This notice supplies evidence, not a new accepted
prompt/reference contract. Workshop production prompts, candidate helper, jobs,
locks and approvals are unchanged. No paid request, retry, experiment, expansion,
test rerun or server restart was triggered by this report-only update.

## Comparison Rejected / 2026-09-06 23:04 Review

Read the parent's `review.md` and safe `manifest.json` at
`output/imagegen/scene-production/blue-blood-v1-transfer-20260906-2251/`.
The single two-reference comparison is complete, not pending:1672x941,
SHA256 `c0b14ac610c2ca949f31b686113ca004dfa27706a65c72515704849a8634e8c0`.
Parent review rejects the retained face design, makeup-like eyelashes and soft
shading; the changes are mainly tonal/textural. Recorded counts are0 approvals,
0 native4K and0 new distinct narrative scenes. This is not an eligible replacement.

V1 remains the target and the bulk style hold continues. The candidate helper
below is still not visually accepted. No new reference policy, prompt experiment,
retry, paid call or bulk dispatch follows from this notice. Existing owners may
finish reviews and retain their records; original source and failed artifacts
stay intact. This workshop update records the parent's finding only and changes
no code, job, review or lock.

## Style Hold / 2026-09-06 22:50 Handoff

The latest user rejection of the Blue Blood tea-room image supersedes any
inference that the zero-reference recipe is ready for original-cast production.
V1 remains the visual target; its style transfer to new characters is unaccepted.
Root reports the dispatcher style-hold is in place. The three new1672x941 images
are not approved scene assets and contribute zero native4K coverage.

The helper and short-brief metadata below remain candidate integration work,
not approval to connect and resume bulk production. Its passing tests prove
data handling only, not aesthetic quality or native resolution. Keep imported
production held and preserve source/draft materials. Root alone owns the single
same-scene comparison using actual V1 pixels; this lane starts no comparison,
reference upload, new worker or paid request. Do not extend that bounded
comparison into a new reference policy without its review outcome.

This update changes reports only. No service, prompt code, stored draft, review,
hold lock or server was changed; no tests or browser run were repeated.

The user-selected V1 in `art-v1-selected.md` supersedes old technical wrappers.
This lane updates future story drafting/review and exports production metadata;
it does not edit the art service, start a creative job or request images.

## Candidate For Art Owner

- `server/workshop-art-direction.ts` now instructs short Chinese character/place/
  action descriptions ending in the selected style name, zero reference images.
  The old hard-shadow/fill/costume recipe is removed from drafting and review.
- `server/workshop-creative.ts` no longer appends the obsolete route art recipe.
- `SceneNode.artBrief` is optional production data. The compiler retains the
  actual model's field exactly, separate from Ink and visible story paragraphs.
- `server/workshop-art-brief.ts` exports `buildWorkshopArtDirection(context)`
  using the existing `ArtDirectionContext`/`DelegatedArtDirection` contracts.
  It returns the exact validated prompt and `references: []`, without size text,
  a wrapper, reference uploads, quality overrides or appended instructions.
  Non-imported stories return undefined so existing artists retain ownership.
  Missing/legacy imported briefs throw `WORKSHOP_V1_BRIEF_REQUIRED`, rather than
  silently reusing an old technical prompt. No files are rewritten by this helper.

## Remaining Service Hook

At inspection, `art-production-delegates.ts` still routes only20 authored world
IDs. Imported worlds therefore reach the old fallback in `buildSceneBrief`.
Art owner needs to route imported story IDs through the helper above BEFORE the
authored-owner lookup, and preserve its missing-brief error without falling back.
This lane has not modified that service-owned file or prepared any new batch.
Until that hook is connected, these changes are NOT full image-service acceptance.

Existing published r1/r2 files are untouched. Old drafts retain their original
briefs, and the shared opening has no new artBrief yet. Those scenes need actual
short briefs from the creative/art owner before preparation; do not fabricate
them by trimming old technical prompts. Keep their batches held. The revised
drafting policy naturally changes the next editorial policy hash; no old approval
is carried onto a newly edited draft and no active child is restarted here.

The selected1672x941 V1 is style-approved only. Native4K, exact source identity,
unique scene coverage and individual review remain separate delivery gates.

## Verification / 2026-09-06 22:45 China Time

40 focused tests passed, exit0:
`node --import tsx --test --test-reporter=dot tests/workshop-art-brief.test.ts tests/story-workshop.test.ts tests/workshop-editorial-job.test.ts tests/workshop-art-binding.test.ts`.
`node node_modules/typescript/bin/tsc --noEmit` passed, exit0.
Coverage includes exact prompt/zero references, legacy-brief rejection, retained
authored ownership, metadata preservation outside player prose/Ink, shared
drafting/review direction, approval hashing and immutable current-art binding.
Fixtures are tests, not generated illustrations. No broad suite, image request,
creative generation, stored draft migration or server restart was performed.

Re-read `art-production-delegates.ts` after validation: the imported-world hook
is still absent. This remains an explicit art-owner integration handoff, not
a claim that current imported batches already use the new delegate.
