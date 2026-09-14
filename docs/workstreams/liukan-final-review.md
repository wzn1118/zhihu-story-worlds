# Liu Kanshan final review

## Pointer-drag review — 2026-09-13

The remaining original URL P2 is closed: src/LiukanCapabilities.tsx:6 now matches the backend HTTPS, no-userinfo/no-port, and three-host allowlist in server/zhihu-browser.ts:21. All four original findings are closed at source-review level.

Read-only review of src/ZhihuLivePage.tsx found no confirmed silent body/frame substitution or persistent listener leak. The drag stores postId/frameId at pointerdown (lines 46 and 69); backend capture validates that membership and re-hashes the currently displayed source before saving (server/zhihu-browser.ts:288-293). Repeated saves of unchanged text use the same source hash/ID and inbox identity. connect() first removes the previous document listeners, and the stored cleanup removes matching event registrations on unmount (lines 16, 19, 124).

Two concrete interaction edge cases remain in the pointer implementation:

- P2, multi-touch cancellation: src/ZhihuLivePage.tsx:42-47 replaces the active pointer record without checking event.isPrimary or an existing pointer. If a second finger touches another answer handle while the first drag is active, the original pointer ID is discarded and its move/up events are ignored. The original drag does not complete. Ignore non-primary/new pointerdown while one drag is active, and clean up on lostpointercapture as well as pointercancel.
- Repeated capture requests, without duplicate persisted posts: src/ZhihuLivePage.tsx:89 and 127 allow click-to-feed while busy; ZhihuWorkspace.tsx:32-39 queues each call. Repeated taps during capture therefore enqueue redundant source reads/writes. Add the same busy guard to click/toolbar feed and disable its button. Existing source IDs and inbox idempotence prevent these from becoming multiple learned entries, so this is redundant I/O rather than duplicate stored knowledge.

No browser or event simulation was executed here. Root owns mouse/touch/iframe browser acceptance, including verification of pointer capture across the real iframe boundary.

---

## Recheck — 2026-09-12 15:51 UTC

This recheck read the latest source and docs/workstreams/liukan-intelligence.md. It did not run browsers, services, model/image requests, or test suites. Three original P2 items are closed at source-review level; the external-URL item has one remaining validation mismatch. Browser acceptance and live transport evidence remain root-owned.

### Closed: ending memory grows after reading later paragraphs

server/liukan/memory.ts:8-18 now requires an otherwise identical saved scene sequence and a strictly longer ending-text prefix before merging. Lines 41-48 update the matching ending in place, preserve its original completedAt, keep worldId/version separated, reject shorter or changed-route snapshots, and retain the 50-ending bound. The original first-paragraph freeze is fixed. tests/liukan-memory.test.ts:39-112 contains six focused cases for growth/reload, different choices, altered prior text, out-of-order snapshots, bounds/versioning, and invalid progress. Test content was inspected here; this recheck did not rerun or claim passing execution.

### Closed: source labels and relay provider acceptance

src/LiuKanShanPet.tsx:295 now displays 知乎网页选取 or 知乎搜索节选 from origin.contentScope. Both post and journey reply handlers accept zhihu-zhida and relay at lines 182 and 241. Assistant speaker labels at lines 300 and 314 are neutral 刘看山, so relay responses are no longer attributed to 知乎直答. The saved source body remains rendered unchanged. Existing 打开原文/看看原文 controls refer to that labeled source and no longer claim a complete work.

### Closed: switching abilities while a response is pending

src/LiukanCapabilities.tsx:58-63 disables capability selection, query, resource IDs, and account-read checkbox while busy. Line 65 renders results only when result.ability matches the current selection. This closes the reported old-response-under-new-capability problem. The result collection/base shortcut can still change selection during a pending refresh, but the matching-ability render guard keeps that old response hidden, so it does not reproduce the original mislabeling.

### Remaining P2: source reader eligibility still differs between UI and backend

Most of the external URL correction is present: src/LiukanCapabilities.tsx:65 retains non-Zhihu URLs in the panel and offers copying rather than invoking the Zhihu reader. However, isZhihuSource at line 6 accepts every HTTPS *.zhihu.com hostname and any port, while server/zhihu-browser.ts:17-22 accepts only zhihu.com, www.zhihu.com, and zhuanlan.zhihu.com, with no explicit port/userinfo.

A normalized search/knowledge result such as https://daily.zhihu.com/story/12345678 or https://www.zhihu.com:8443/question/12345678 still receives 阅读来源, closes the capability result panel through App's callback, and is rejected by the browser API. This is a deterministic contract mismatch from source inspection; no live search containing those URLs is asserted. Align the frontend eligibility predicate with the backend host/port/userinfo rules, ideally by sharing the predicate; unsupported variants should retain the existing same-panel copy action. This is the only remaining finding from the four-item recheck, with no new P1.

### Current status-report accuracy

The current intelligence report separates 56 choreographies from six supplied source GIFs, and 13 API operations from the user's 50-action requirement. It explicitly records the attempted imported game's upstream failure and keeps it separate from the older playable r1 sample; it does not claim the failed generated game finished. Browser/relay checks stated there are root-owned evidence and were not repeated or independently certified by this review.

---

## Original review snapshot (superseded by recheck status above)

Reviewed 2026-09-12; read-only source review while root runs browser acceptance. No browser, server, generation, or paid request was started here. Findings below are current source behavior, not claims of live browser reproduction. Line numbers refer to the inspected revision; root is editing the pet concurrently.

## P2: completed-ending memory is frozen at the first saved paragraph

- Evidence: server/liukan/memory.ts:28-29 treats storyId + worldVersion + endingTitle as a duplicate and keeps the old row unchanged. src/LiuKanShanPet.tsx:215-227 submits a memory as soon as isEnding is true and submits later reading positions too. server/liukan/zhida.ts:131 saves only the paragraphs included in that verified reading position.
- Trigger: arrive at a multi-paragraph ending at paragraph 0, then read the rest. The first request records the first paragraph; all later richer snapshots are discarded. On a subsequent visit, completedEndings only has that initial paragraph and the pet cannot recall the resolution that the player read.
- Focused fix: update the matching verified record when its same-path ending text expands; do not replace richer text with a later shorter snapshot. Preserve the history/source validation and the 50-ending limit. A focused regression should submit the same ending at two reading positions and assert the stored snapshot grows without adding a duplicate ending.

## P2: excerpt and provider labels disagree with actual source

- Evidence: src/LiuKanShanPet.tsx:295 always displays 知乎原文 · 已保存, while server/zhihu-discovery.ts:29 assigns contentScope=search-excerpt to official search results. src/LiuKanShanPet.tsx:314 always labels journey assistant messages 刘看山 · 知乎直答, while both message handlers accept source=relay.
- Trigger: feed an official search excerpt, or use the independently configured relay for journey recall.
- Focused fix: label the saved source from origin.contentScope, distinguishing 官方搜索摘录 from 网页所选正文; retain exact text and do not call a selection a complete work. Carry each response provider into its message metadata, or use a neutral 刘看山 speaker label.
- Root has been notified; recheck the latest file before applying because related source checks are already under repair.

## P2: a late capability response can appear under a different selected capability

- Evidence: src/LiukanCapabilities.tsx:39 unconditionally sets the result after awaiting a request; the selector at line 57 remains enabled and clears results without invalidating that request. Line 64 renders any non-null result, irrespective of result.ability versus the current ability (only pagination compares them).
- Trigger: start 我的创作 or a search, switch the capability selector while the request is pending, then let the old response return. The old result appears under the new control's description and reset account checkbox.
- Focused fix: invalidate in-flight UI responses with a request generation token/AbortController when the capability/query changes; also render results only against the exact submitted request context. Disabling the selector while busy is the smallest sufficient correction for the cross-capability case.

## P2: global-source buttons route unsupported URLs into the Zhihu-only browser

- Evidence: src/LiukanCapabilities.tsx:64 offers 阅读来源 for every normalized HTTP(S) item; src/App.tsx:1028 routes every onOpenSource URL into ZhihuWorkspace. server/zhihu-browser.ts:17 only accepts Zhihu hosts.
- Trigger: 查外部资料 returns any external source, or a knowledge-library item has an external OriginUrl; click 阅读来源. The app closes the result panel and attempts a browser route that is deterministically rejected.
- Focused fix: retain in-workshop routing for supported Zhihu URLs, and expose a same-panel source URL/copy action for unsupported domains instead of advertising a reader that rejects them. Do not open a new tab or silently relabel an external page as Zhihu.

## Checked boundaries

The stored-source read path verifies the source hash and exact title/author/text/scope before answering or starting generation. Model prompts identify source JSON as data and distinguish retrieved passages from full works. Generation dispatch is a real explicit endpoint with per-post in-flight deduplication. Capability execution uses a fixed argument switch with shell=false, bounded fields, and explicit account-read flags. Public relay configuration excludes the key; key changes are atomic, endpoint-bound reuse is enforced, and API failures do not echo upstream bodies. Account capability results are not written into reading memory. No new P1 finding emerged from this bounded review.

The API lane report clearly distinguishes its fixture relay tests from the real default-Zhida HTTP checks. Root's current integrated browser/relay/art acceptance is outside this report; synthetic fixtures are not counted as generated assets.


Root follow-through 2026-09-13: source-host validation now matches the backend exact three hosts and excludes userinfo/custom ports. Primary-pointer/existing-pointer guards and busy feed guards are present in ZhihuLivePage; real mouse/touch feed checks pass in output/liukan-intelligence/web-feed and web-touch. No open finding from this bounded review remains.
