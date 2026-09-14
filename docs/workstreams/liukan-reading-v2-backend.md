# Reading V2 backend — in progress

The shared additions are fixed: `ask`, `choice-design`, `ending-design`, `storyboard`, `pitch`, `style`; optional `parentNoteId` on run input; optional `parentNoteId` and `question` on completed notes. `ask` requires a question and accepts 1–3 saved sources. The other five tasks are explicitly invented and accept one source.

Continuation retrieves the saved parent server-side, validates its persisted schema and exact source quotations, and requires identical current source IDs/hashes/metadata. Parent prose is supplied as discussion context, never as quotation evidence. A maximum of four continuation links bounds recursive validation and context. Historical notes remain readable when source freshness changes, but stale notes cannot start a continuation.

Legacy fingerprint version and field order remain unchanged for requests without parents. Optional parent identity and content digest distinguish continued requests. Unknown attempts remain quarantined. No model/provider/configuration change, real model request, browser, persistent service, or image request is owned by this lane.

Implementation is available. All six new task prompts specify concrete output; multi-source `ask` must cite each supplied source. The continuation parent is read from the durable note store and recursively validated. Its ID and a digest of its content enter only the continued fingerprint. Source freshness is checked before making a new continuation. Parent discussion snippets carry no evidence arrays and remain outside the validated source passages.

New public errors: `INVALID_READING_PARENT` (400), `READING_PARENT_CHANGED` (409, current source mismatch), and `READING_PARENT_DEPTH` (409, four continuation links reached). Malformed/missing saved parents use the existing note errors. `ask` without a nonempty question uses `INVALID_READING_QUESTION` (400). These validations precede model submission.

TypeScript passes after the concurrent UI changes. The full reading contract test file is running, including six task prompts, mandatory questions and multi-source evidence, source identity/freshness, parent context isolation, distinct durable caches, legacy note compatibility and unknown-outcome preservation, bounded chains, and corrupt persisted records. Actual model verification remains root-owned.
