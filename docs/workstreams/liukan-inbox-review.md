# Liu Kanshan inbox review / 2026-09-12

Scope: `server/liukan/inbox.ts`, `tests/liukan-inbox.test.ts`; shared inbox types
were reviewed and retain the integration owner's API contract. No App, pet,
browser service, authored content, image service or shared server change.

Fixed active request-ID reuse: identical concurrent messages share one provider
promise; the same request ID with different content receives REQUEST_CHANGED
before a second request is sent. Cached replies follow the same check. At most
two distinct inbox replies run in one service instance. A provider error is
surfaced and is not automatically retried or converted into a fabricated answer.

Inbox reads now check the stored candidate ID, exact text, title, author,
character count, immutable source hash and canonical origin identity against the
saved discovery source. Altered/corrupt records fail before chat or generation.
Timestamp-only refresh of the same source keeps the original learned snapshot
valid. Unknown candidate IDs remain rejected by the discovery service.

Long text is retrieved by the actual question. When JSON or Windows argument
escaping requires less context, retrieval keeps the highest scoring passages
instead of trimming the beginning and losing a later clue. Partial coverage is
explicit in the prompt. Source is inert JSON data; this is persisted reading
memory plus retrieval, not model training or a claim to know the entire work.

Generation still delegates to the existing workshop import and resume methods.
Concurrent requests share one operation; running/playable projects are returned
without restarting a writer. The workshop retains cross-process import and job
ownership. The test writer is injected and never launches a creative child.

Validation: the first focused inbox run passed 8/8, including a real local HTTP
server with an injected provider. TypeScript passes. A bounded follow-up reruns
feeding, escaped-input and repeated-generation checks after adding the unchanged
source timestamp refresh check, Windows escaping budget and a real test-owner
lease for the injected writer. All model
responses in this test file are injected synthetic fixtures; these results are
not evidence of a real Zhida request. Live provider/browser acceptance remains
the integration owner's lane.
