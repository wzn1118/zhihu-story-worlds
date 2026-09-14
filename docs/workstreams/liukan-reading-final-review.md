# Liu Kanshan reading skills — independent review

2026-09-13. Read-only review of server/liukan/reading.ts, shared/liukan-reading.ts, the published API contract, the root review notes, and existing focused test source. No API/model/image requests, browsers, services, or test suite were executed by this lane. No business code was edited.

## Backend checkpoint

No new P1/P2 finding beyond the already assigned root notes at this checkpoint. Exact source IDs come from the verified inbox. Every analytical section requires an exact quote from the actual supplied passage; comparisons must cite each input. Invented dialogue/adaptation are typed and validated as invented, including visible title/summary prefixes. Source hashes and the immutable request input determine the note ID; persisted note reload revalidates the complete output schema and exact citations against that pinned input, then decorates the current source match independently.

Completed fingerprints reuse durable notes. Identical same-process request IDs share their pending promise; filesystem claims prevent an independent service from resubmitting the same fingerprint. Unknown upstream outcomes are preserved without automatic retries. Received output is saved privately before output validation. Long-source context now prioritizes question-related passages and marks truncated input incomplete. These observations verify implementation presence for the root's five notes; that owner remains responsible for focused runtime checks.

The existing test file was read as contract evidence only. It includes durable reuse, cross-service claims, orphan/unknown handling, exact evidence, comparison coverage, stale sources, invented-task labeling, and HTTP routes. This report does not assert those tests passed during this lane.

## UI checkpoint

The UI is now present and was reviewed read-only together with its stylesheet. It issues only inbox/index GETs on open; reading starts through the explicit POST button. The same payload retains its request ID in session storage. A selection revision suppresses late result/error attachment after source, skill, question or history-note changes while still preserving completed results in history. Source text and evidence are rendered as React text, creative notes have visible draft labels, partial/stale source flags are visible and included in export, downloads revoke their object URL, and modal listeners/inert/body-scroll changes have paired cleanup. No browser/model/UI success is inferred from this source review.

## P2: visible comparison order differs from model source order

- src/LiukanReadingDesk.tsx:100 constructs selectedPosts by filtering the inbox list, keeping inbox order. The selected-source display at line 257 uses this order. The request at line 174 sorts the IDs, and server/liukan/reading.ts:44 also sorts them before building contexts at lines 148-151.
- Deterministic trigger: inbox order is answer A (ID beginning b) then answer B (ID beginning a). The UI shows A first and B second, but the model receives B first and A second. A focus question such as 第一篇和第二篇对人物动机的解释有什么不同 can therefore assign the user's ordinal reference to the wrong source, even though every literal quote validates.
- Focused correction: make displayed selected-source order and transmitted context order identical, preferably preserve the user's chosen order and include that order in the request/fingerprint. The smaller compatible change is sorting selectedPosts by the same IDs before displaying them, with explicit 1/2/3 labels; ensure the model sees the same order. Add a pure ordering test with inbox order deliberately reversed relative to ID order. No live request is needed to verify this invariant.

No other new P1/P2 defect was found in this bounded review. The root's existing five backend notes were not re-reported as new findings. Final browser, actual provider reply, and full UI acceptance remain root-owned.


Root closure: visible comparison chips now sort by the same source IDs as the request and are numbered 1/2/3. Real comparison output and visible order were verified together. Root also fixed a browser-discovered source-preview focus leak/notification obstruction and confirmed Tab, Shift+Tab and Escape behavior. Full evidence is in liukan-reading-expansion.md.
