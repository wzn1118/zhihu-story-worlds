# 看山阅读能力 API

Owner: reading_backend. Shared types, ten task implementations, durable store, and Express router are implemented; UI integration is owned by root.

Root mounts `createLiukanReadingRouter(inbox)` from `server/liukan/reading.ts` at `/api/liukan/reading`; inbox must provide verified `get(id)` and `list()` methods. The service constructor is `new LiukanReadingService(inbox, root?, answerer?)`, defaulting to `.local/liukan-reading` and the configured Liu Kanshan model transport. No model substitution or image request is involved.

- `GET /`: `{ skills, notes }`, ten skills and up to 100 completed local notes, newest first. Read paths never call a model.
- `POST /run`: `{ skill, postIds: string[], question?: string, requestId: string }` returns a completed `LiukanReadingNote`. A comparison requires 2–3 saved answers; every other task accepts one saved answer. The client should retain its request ID for repeated delivery after an interrupted HTTP response.
- `GET /:id`: the completed note. Every source reports its pinned hash and whether the current verified source still matches (`current`). `complete` only describes whether all saved excerpt characters reached the model, never the completeness of the original work.

Shared contract: `shared/liukan-reading.ts`. Skills are recap, characters, timeline, clues, motives, uncertainties, compare, adaptation, dialogue, and world-rules. Adaptation and dialogue are visibly marked `invented: true`; their text is separated from exact source quotations.

Input accepts only existing verified inbox IDs, not arbitrary source text or URLs. The model receives at most 14,000 source characters in total. It returns strict JSON: `{ title, summary, sections: [{ heading, body, evidence: [{ postId, quote }] }] }`. Quotes must be exact substrings of the supplied passages, with valid post IDs. Analytical sections require evidence. Invalid structured output is rejected and never published as a completed note.

Identical completed fingerprints reuse the durable result. Atomic filesystem locks prevent concurrent processes from submitting the same work twice. The durable attempt records distinguish `running`, `completed`, `failed`, and `unknown`; a lost/uncertain upstream outcome is not resubmitted automatically. Error responses use the existing `{ error: { code, message, status } }` shape. `READING_RUNNING` / `READING_UNKNOWN` / `READING_ATTEMPT_FAILED` are HTTP 409 and preserve the attempt; `INVALID_READING_*` is HTTP 400 and precedes submission.

Root review fixes are now in this lane: identical concurrent request IDs share a task; a brief cross-process mapping-write window returns busy rather than submitting twice; private attempt `reply.json` retains bounded model output before validation; `input.json` preserves the hashed context; note reads validate their schema and every quotation against that pinned context. Updated source hashes only change `current`, never rewrite a historical note. Long excerpts use question-relevant passages within the same 14,000-character budget.

The expanded injected contract run passed 14/14. After adding the two-upstream-request bound and the final stored-context guard, the changed concurrency/corruption subset passed 3/3; there are now 15 distinct tests. The tests cover concurrent exact request IDs, independent service filesystem claims, uncertain outcomes across restarts, corrupt stored notes, retained invalid responses, middle-passage retrieval, all-source comparison citations, explicit invented labels, and real HTTP router behavior with an injected answerer. TypeScript currently reports only the pending concurrent UI component `src/LiukanReadingDesk` and its caller; no backend type error was reported. No real model requests, persistent services, browsers, or image workers were started by this lane; root owns the real frontend acceptance. These test fixtures are not evidence of live creative output.

The per-service concurrency limit is two distinct upstream tasks (`READING_BUSY`, HTTP 429). A duplicate task shares or reuses its outcome even while another task occupies the second slot. The cross-process filesystem claim is per fingerprint; it prevents duplicate identical work across service processes, while the two-task limit is process-local.

## Reading latency follow-up

Root's first real MAIA recap exceeded the original 60-second relay deadline and is recorded as an unknown outcome. This lane did not read, modify, or retry that private attempt.

The reading prompt now asks for 3–5 short sections, 400–800 Chinese characters of analytical body text, at most 1,200 characters for creative tasks, a short summary, and short exact quotations. Existing graph-independent note schema and exact-evidence validation remain unchanged. The fingerprint version is unchanged; this is not a way to resubmit the timed-out operation.

The shared adapter now accepts an internal timeout option. Ordinary callers retain the 60-second default. Reading's default wrapper passes 180 seconds, with the same configured endpoint, protocol, model, and reasoning. This changes the waiting allowance, not the selected model or upstream compute. No automatic model retry was introduced.

Four targeted tests passed: compact prompt/evidence contract, default reading180/chat60 using the same mocked Responses configuration, Chat Completions timeout parity and invalid-option rejection, and unknown-outcome persistence across service restarts. `tsc --noEmit` also passed after the concurrent UI integration became available. These were injected model tests only; root owns the subsequent live browser measurement.
