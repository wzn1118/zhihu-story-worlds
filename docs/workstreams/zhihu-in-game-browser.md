# In-game Zhihu browsing and drag to Liu Kanshan

2026-09-12 continuation. The user clarifies that same tab means the game stays mounted while real Zhihu content is readable inside it; top-level navigation/bookmarklets alone do not satisfy this. Root owns App integration and the in-game reader/browser UI. Remote browser backend lane owns a private local persistent browser, screenshot/input/extraction APIs and tests. Pet lane owns drop targeting and saved-post controls. Discovery lane owns validated candidate inbox storage and real-source handling.

No shared-server restart, authored world changes, new paid illustrations or copied browser credentials. Preserve game progress. Native webpage content and official search excerpts must have separate labels. A page fetch returning403 must remain visibly403. User interaction with a login page, when needed, takes place in the embedded view.

## User correction

The entry belongs INSIDE the story adaptation workshop, not a sidebar inside active gameplay. Clicking it changes the full work area to Zhihu while the floating Liu Kanshan remains available. Dropped answers become persistent, source-labelled reading memory; asking about a supplied answer must use the real Zhida API. Explicit “make game” action invokes the existing story generation endpoint for that answer. No new browser tab.

Root integration data contracts: shared/liukan-inbox.ts defines LiukanInboxPost {id,candidate,learnedAt,projectId?}; provider owns GET /api/liukan/inbox, POST /api/liukan/inbox {candidateId}, POST /api/liukan/inbox/:id/chat {question,requestId?,conversation?}, POST /api/liukan/inbox/:id/generate. Pet receives onProject(WorkshopProject). It accepts official candidate MIME application/x-redleaf-zhihu-candidate {candidateId} and native browser MIME from shared/zhihu-browser.ts. Touch has an explicit feed control.

## Active acceptance 2026-09-12 21:05 China

Root of this workshop/browser turn owns preview4179 PID88560 and ONLY ZhihuWorkspace.tsx/css plus native-browser lane this continuation. Another native root is concurrently adding onboarding/intelligence/pet actions; preserve its App/Pet/shared edits and coordinate a final bundle rather than overwrite. Actual desktop UI: official MAIA candidate was dragged to pet, exact1074char source saved, live Zhida200 in3884ms answered specific source question. Pet Generate returned202 in1885ms and reused existing import-c45cf629-67b5-40e6-b2ae-14d85945a577; creative relay then reported upstream rate_limit with1char, not a generated game. No automatic retry. Real embedded Zhihu200 login screen rendered at1440. Native article capture awaits real page access. Evidence files workspace-*.json/png in output/zhihu-liukan.

Focused tests encountered a concurrent edit parse error in server/liukan/answer.ts line20: nested conditional lacks empty-string final branch before model field. This turn does not own that new intelligence module. Please repair before final integration build.
