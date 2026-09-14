# Zhihu webpage selection / 2026-09-12

This lane adds real-page selection to the existing discovery/source workflow.
It owns `server/zhihu-discovery.ts`, the discovery routes in `server/app.ts`,
`src/ZhihuDiscovery.tsx/.css`, new `ZhihuPagePicker.tsx` and `zhihu-page-picker.ts`,
the webpage source hash/provenance condition and its tests. Authored worlds,
game generation and the shared server are preserved.

## Published interface

- `POST /api/workshop/discovery/url { sourceUrl }`: resolves an exact canonical
  answer/article link against saved official search records, or an exact matching
  official search response. Other returned URLs are never substituted.
- `POST /api/workshop/discovery/page { title, author, text, sourceUrl }`: stores a
  user-selected visible webpage excerpt as an immutable candidate. It does not
  generate a game or contact a model. Its origin scope is `webpage-selection`,
  distinct from the official API's `search-excerpt`.
- The existing `/discovery/import` imports the saved candidate and can start the
  established generation workflow. Exact text, URL and authorship are retained;
  the imported ID stays separate from the real answer/article ID.
- A user-clicked bookmarklet runs in the real Zhihu page, lists expanded answers
  or takes the current 80+ character selection, and returns in the same tab to a
  local preview through a URL fragment. Zhihu links also navigate in the same tab.
  It never reads cookies, sends page text elsewhere, fetches hidden
  content or imports automatically. Fragment content is cleared once read.
- Main app must select the workshop when `location.hash` starts with
  `#zhihu-page=` (integration owner handles App.tsx).

## Live observations

Official CLI status is authenticated via its existing credential store. A real
search for `悬疑短篇小说 已完结` returned three real answer/article URLs and
their excerpts; the records are not a complete-fiction claim. A direct page
request returned HTTP 403. URL-only search does not reliably find an arbitrary
answer, so exact-match failure remains a visible 404 rather than another work.
The bookmarklet uses the reader's already-open page and visible DOM instead.

Validation: `tests/zhihu-discovery.test.ts` passed 8/8; the new page transfer and
immutable import tests passed 2/2. Existing seed hashes, exact whitespace/markup,
same-URL deduplication and active generation ownership remain verified.
TypeScript now passes after the integrating mascot contract was aligned.
The same-tab follow-up reran the two page-picker tests successfully and confirms
the bookmark uses `location.assign`, with no `_blank` or `window.open` in the
three picker/discovery UI files. Exact selected text survives the fragment
roundtrip. Full-browser acceptance belongs to the integration owner using its
isolated server; this lane opened no additional browser tab.

An initial npm test-filter invocation expanded into the full suite; it was
stopped after verifying that exact npm PID 70280 and its test child tree. The
handshake timeout from that interrupted run is not a pass or a product result.
No shared server was in that owned test tree.

No paid image call,
creative generation, shared-server restart, authored source edit or commit was
performed by this lane.
