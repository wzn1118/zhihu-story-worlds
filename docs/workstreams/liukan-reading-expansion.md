# Liu Kanshan reading expansion — accepted 2026-09-13

The pet now has a reading notebook with ten actual configured-model tasks: recap, characters, timeline, clues, motives, uncertainties, comparison, game adaptation ideas, dialogue drafts and world rules. Entry points are the pet's 阅读手记 button, its saved-answer card, and the capability panel. Existing Zhihu operations, the 56 action choreographies, tour and game generation remain available.

## Delivery

- New backend: shared/liukan-reading.ts, server/liukan/reading.ts, tests/liukan-reading.test.ts. Contract: docs/workstreams/liukan-reading-api.md.
- New UI: src/LiukanReadingDesk.tsx/.css. App, pet and capability panel are wired to it; server/app.ts shares the verified inbox between the inbox and notebook routers.
- Analytical sections carry exact validated source quotations. Comparison cites each supplied answer. Adaptation and dialogue are visibly marked as invented drafts. Source excerpts remain exact and retain their original source scope. These are local reading notes, not model training.
- GETs never start model work. Durable fingerprints, request IDs and filesystem claims reuse completed work and prevent identical submissions across service processes. Two distinct model requests may run at once per service. Uncertain outcomes remain recorded without automatic resubmission.
- Reading uses the current configured provider, model and reasoning. The relay waiting allowance is 180 seconds for reading and remains 60 seconds for ordinary chat. The prompt asks for concise sections; this does not replace the configured model.

## Real frontend acceptance

The browser selected actual previously saved Zhihu answers and clicked each reading task. No model-response fixtures or API-only submissions counted toward this table. All ten completed results reported gpt-6-astra through the current relay. Each task has a response receipt and screenshot under output/liukan-reading.

| Capability | Actual result | Evidence quotes |
|---|---|---:|
| Recap | completed | 3 |
| Characters | completed | 7 |
| Timeline | completed | 8 |
| Clues | completed | 8 |
| Motives | completed | 6 |
| Uncertainties | completed | 7 |
| Compare | completed, separate narrative-technique question | 4 |
| Adaptation | completed, explicitly invented | 5 |
| Dialogue | completed, explicitly invented | 3 |
| World rules | completed | 7 |

All 58 quotes were additionally checked against the actual saved source strings. Successful frontend request/response times were 64.4–96.3 seconds. Ten notes were visible after reopening the desk. Downloaded Markdown matched the UI export exactly. The original Star Wars answer preview matched all 111 saved characters. A completed recap was reused in 2.185 seconds with the same note ID and no additional attempt directory.

The initial MAIA recap hit the former 60-second deadline. The first comparison request later lost its relay response after approximately 79 seconds. Both uncertain attempts remain; neither was replayed. The successful comparison asked a genuinely different question about narrative viewpoint and withheld information. Clicking the original uncertain recap again returned HTTP 409 in 37 ms, with no new attempt. No missing reply is presented as a note.

## UI and regression checks

Desktop 1440×1000 and mobile 390×844 were exercised in independent headless Edge contexts. Application navigation stayed in one app tab. Edge's internal downloads-hub page appeared during the download test; it was not an app-created content tab and no user's browser sessions were touched.

Screenshots were opened and inspected. Mobile ability buttons were changed to two readable columns. A finished note scrolls into view and receives focus. Source preview traps Tab/Shift+Tab, hides the obstructing notification, and Escape returns to the notebook before closing it. The comparison chip order is numbered and agrees with backend source order. Same-page return to the existing source reader worked. Mobile viewport and document width were both 390 pixels.

The existing Rebirth Week game opened successfully; clicking 确认手机日期 advanced the actual embedded game from 最后几颗安眠药 to 热搜准时塌房 and retained its saved-progress indicator. This was an entry/choice regression, not a full game completion run.

- Initial focused capabilities/inbox/reading suite: 31/31 passed before the final concurrency/timeout additions.
- Backend agent separately passed the concurrency-focused subset and four timeout/prompt/unknown-outcome checks after those additions; these are fixture contract tests, not creative output.
- Final TypeScript noEmit and Vite build passed. Vite retains the existing large-bundle advisory.
- The final bundled web-game browser smoke produced its screenshot/state with no errors file. Its earlier run reported a transient ERR_NETWORK_CHANGED; that receipt remains separate. Live notebook contexts reported zero page errors.

## Runtime and evidence

Accepted preview: http://127.0.0.1:4180/ — PID 40892, scripts/preview-liukan-intelligence.ts --port=4180 --browser-owner=4173. Shared 4173 remains PID 12896 with its existing compiled-preview command; it was not restarted. The source changes are in the shared workspace; 4173's compiled frontend was not replaced by this lane. Use 4180 in the current tab to inspect this increment.

- output/liukan-reading/acceptance.json — aggregate real results and source checks.
- output/liukan-reading/{first,analysis,creative-mobile,compare-technique}/results.json — actual UI request receipts.
- output/liukan-reading/compare-final-1440.png and history-reloaded-390.png — inspected completed notes.
- output/liukan-reading/desk-final-390.png — readable mobile capability picker.
- output/liukan-reading/same-page-source-390.png — existing source reader.
- output/liukan-reading/exported-reading.md — real downloaded note.
- output/liukan-reading/cache-check.json and interaction-checks.json — reuse, focus and source checks.
- output/liukan-reading/game-choice-390.png — existing game choice advancement.

No authored world/art-service code was edited, no illustrations were requested, no creative game jobs were started, and no commit was made. This increment adds reading and drafting capabilities; the preexisting generation jobs and artwork readiness are outside this acceptance.
