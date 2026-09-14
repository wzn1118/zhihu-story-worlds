# Liu Kanshan expansion V2 — active 2026-09-13

Latest user request: add more capabilities after the ten reading tasks were accepted. This increment adds six source-based tasks, continuation from a saved reading note, and a same-page activity desk with actual project statuses and saved game memories. No authored content edits, art requests, commits, shared-server restarts or new user tabs.

Ownership: reading backend owns shared/liukan-reading.ts, server/liukan/reading.ts and its tests; reading UI owns LiukanReadingDesk.tsx/.css; activity UI owns new LiukanActivityDesk.tsx/.css and pure presentation helpers/tests. Root owns App/pet wiring, general-chat affordance copy, runtime and actual browser acceptance.

## Shared reading interface (fixed for parallel implementation)

Add skill IDs `ask`, `choice-design`, `ending-design`, `storyboard`, `pitch`, `style`. Labels: 接着问看山 / 设计几个选择 / 把结局写完整 / 安排场景节奏 / 整理制作提纲 / 让这段更好读. `ask` is analytical, accepts 1–3 sources, requires a nonempty question; all other new skills are explicitly invented, one source. All preserve exact source quotes and scope.

LiukanReadingRunInput optionally accepts `parentNoteId?: string`. LiukanReadingNote optionally adds `parentNoteId?: string` and `question?: string`. A saved parent is retrieved/validated server-side and its source IDs/hashes must match the new request, including current source freshness; never accept client-supplied parent prose. Parent prose is context, not original evidence. Continued notes remain individually persisted. Existing note fingerprints/cache/read format must keep working; no old failed fingerprint replay due to version bump. Reading provider/model/reasoning unchanged.

## Activity desk interface

Export `LiukanActivityDesk` with props `{ playerId?: string; onClose: () => void; onProject: (project: WorkshopProject) => void; onOpenMemories?: () => void; onReadPost?: (post: LiukanInboxPost) => void }`. It reads existing GET workshop projects, inbox and player memories. Poll only while visible and actionable work is running; stop on unmount. Searching/status filters, actual art readiness, links to existing project, searchable visited scenes/choices, local Markdown export. No hidden generation or model submission. No fake journey records, no unseen scene fetching. Errors are visible. Use fresh API public types, inspect source contracts before implementation.

Acceptance pending. Use independent browser contexts and current verified preview ownership; browser owner was released on 4178/PID61884 per newest coordination record, shared4173 remains untouched.

## Integration checkpoint

2026-09-13: reading V2 backend and UI landed. A follow-up capability pass now exposes 19 skills: 9 source-reading skills and 10 writing/review skills, including 人物关系网、伏笔有没有回响、先替我试玩审稿. The reading desk has a fallback icon for newly returned skill IDs, so the catalogue cannot blank when the backend grows first. Activity desk is wired from the pet quick tools, capability panel and App, using local-player identity.

Root checks: focused reading/activity/view tests pass 34/34 and `tsc --noEmit` passes. Isolated preview 4191 was started with browser owner 4173; shared 4173 was untouched. Real browser acceptance used one desktop page: the 19-skill catalogue rendered, a saved single-source hand-written note continued through the relay in 61.6s with HTTP 200, model `gpt-6-astra`, source `relay`, parent note retained, four sections, and every quote matched the saved source exactly. The activity desk read 14 real workshop projects. Screenshots: `output/liukan-reading/v3-live/reading-capabilities-1440.png`, `continued-ask-1440.png`, `activity-projects-1440.png`. The run kept one page open and made one POST only.

Mobile activity verification reached the memories tab but the current mobile CSS had no `.lad-memory-card` for the isolated `local-player` page after the real project refresh; no fake memory was inserted. The API does have real saved memories for `local-player` (including the ongoing sample), so this is a follow-up mobile selector/visibility check rather than a model or art failure. Art remains separately pending wherever the project card says so; no image request was submitted by this increment.
