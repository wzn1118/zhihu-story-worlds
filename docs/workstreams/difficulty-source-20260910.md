# Difficulty and original-source delivery — 2026-09-10

Request: increase gameplay difficulty and let players open the original work; user requested parallel conversations.

Implemented by three parallel owners: difficulty_engine handled Ink resources and save/rewind rules; difficulty_review handled the UI and desktop/mobile acceptance; root handled original-source research, links and integration. Both independent owners subsequently reviewed the integrated source handling without finding a new blocking defect.

New games default to challenge. Spendable opening budgets decrease by one where this preserves the world's explicit capacity requirements and a legal opening action. Challenge runs have three successful rewinds, with the remaining allowance preserved through save/export/load. Challenge choices retain numeric costs and requirements but hide solution hints and undiscovered clue names. Classic remains selectable in the introduction, and saves created before this change retain classic rules.

Original-work links now appear in story details, excerpt readers, in-game source/ending panels and imported-source readers. Links open a new tab while the game's session remains intact. API `sourceUrl` values and original excerpt text are preserved separately from `originalUrl`.

The official Zhihu search CLI verified 15 of 20 catalogue works using matching authors and passage anchors, or the original author's link to a paid section with the exact work ID. Evidence: `output/source-links-20260910/research.json`; mapping: `shared/original-links.ts`. Five works have no verified direct URL and explicitly offer a title/author search: 西游之众佛腐烂, 穿越大明，我被崇祯偷听心声, 学科修仙, 00后整顿后宫, 杀仙成道. Reading on Zhihu remains subject to the original page's login/subscription requirements. No invented direct URLs or substituted full text are used.

Validation:

- `npm test`: 799 passed, zero failed; log `output/difficulty-source-tests-20260910.log`.
- `npm run build`: passed, retaining the existing large-bundle warning; log `output/difficulty-source-build-20260910.log`.
- `scripts/verify-challenge-worlds.ts`: 23 authored/published worlds, 44,257 reachable states and 211 reachable endings; no modeled resource softlock, at least one hopeful ending per world, every discovered ending path replayed through actual challenge Ink and restored from a save. Report: `output/challenge-20260910/reachability.json`.
- Original-link browser acceptance: desktop 1440x1000 and mobile 390x844, original text equality against the served API, real popup navigation to Blue Blood's original answer, return-to-game state unchanged, honest unverified fallback, and an existing imported article's actual URL. Both passed with zero page errors. Report and inspected screenshots: `output/playwright/original-links-20260910/`.
- Difficulty UI acceptance passed on the final shared 4173 service: desktop/mobile challenge/classic selection, real initial budgets, three rewinds, disabled exhausted controls, hidden solution hints, resource restrictions and zero rewinds after reload. Report and inspected screenshots: `output/playwright/difficulty-20260910/`. Navigation waits for DOM readiness and the relevant controls; waiting for every third-party image had timed out in the earlier run.
- Unmodified develop-web-game client ran against the shared service with a valid challenge save and installed Edge. The final screenshot/state shows `case_desk`, focus 0, three rewinds and legal rest/exit choices, without console/page errors. Evidence: `output/playwright/difficulty-source-20260910-skill/`. The first short capture ended before loading the saved game; the final client allows the real API response to settle and asserts the resulting game state.

Service: root restarted only its own 4173 development service once to load all 15 mappings. The subsequent API check returned 20 stories in `live` mode with all 15 `originalUrl` fields; `output/source-links-20260910/runtime.json` records the follow-up cached response with that same upstream fetch timestamp and no warning. Root's server remains running on 4173/PID75008; the owned temporary 4175 test listener was stopped after verification. Existing missing scene illustrations and art-production gates are outside this change; no paid generation or historical supervisor was started or modified.
