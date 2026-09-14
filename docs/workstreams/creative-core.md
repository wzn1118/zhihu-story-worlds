# Creative core — 2026-09-06

## All-world continuation / delivered 2026-09-06

Latest user request: continue writing. All **20 authored worlds** now have one
consequential decision, one failed ending and one earned ending deepened:
**60 scenes / 62 rewritten paragraphs / 5,579 characters of revised prose**.
The character count measures replacement text, including punctuation, rather
than net added length. Existing causes, resource pressure and route outcomes
remain intact. No choice labels, IDs, costs, gates, save versions or paragraph
counts changed. Source quotations and adaptation declarations are preserved.

The round replaces abstract explanations with physical action, individual
dialogue and aftermath. Blue's substitution takes away a friend's ordinary
life; pursuit leaves lasting bodily and social effects; the factory order
reaches wages and a tentative later relationship. Failed paths elsewhere retain
lost work, trust, shelter, family contact or a treatment window. Earned endings
continue into shifts, recovery, relocation and work. Root's separate pursuit
fall/island tomb corrections remain intact.

Two multi-entry endings also receive causal copy corrections: `b_return_bad`
accepts capture after solitary waiting, entering the carriage or confronting
the pursuer; it assumes neither companions nor a particular emotion.
`b_depart_bad` accepts both delaying in place and returning to the sect.
The successful shrine route uses a tile under the table, preserving the earlier
destruction of the red contract. No burnt prop is silently restored.

Baseline: `tests/fixtures/worlds-pre-continuation.json.gz`. Readable current-round
draft: **`output/world-continuation/read-through.md`**. The source title, author
and original excerpt link appear beside each world's adapted scene collection.
The all-world art/text handoff is **`output/world-continuation/scene-manifest.json`**,
exported at `2026-09-06T04:10:30.937Z`. This round changes 60 scene hashes while
preserving all 838 scene IDs and illustration target paths. Artwork production
and live-server publication remain with their owners.

The final snapshot also incorporates a concurrent route-owner correction to
`score-room/ending_broken_study`'s first paragraph and its incoming feedback.
Our 62 replacement paragraphs remain intact. Against the frozen baseline, the
merged export therefore has 63 changed paragraphs / 64 visible fields / 5,677
replacement-text characters. The reader includes this latest correction; the
earlier 03:58 export is retained only as browser-evidence history.

### Scene IDs

| World | Decision | Failed Ending | Earned Ending |
|---|---|---|---|
| blue-blood | b_listen | ending_replacement | ending_red_home |
| double-pursuit | p_switch | ending_captured | ending_trap_exposed |
| velvet-alibi | v_mic | ending_friend_lost | ending_factory_dawn |
| future-island | f_voice | ending_borrowed_voice | ending_last_ship |
| happy-home | roof_duplicate | ending_broadcast | ending_roster |
| rotten-pilgrimage | gate_inner_shadow | ending_lost_gate | ending_beacon |
| ming-whisper | escort_rollcall | ending_broken_column | ending_field |
| score-room | wen_receipts | ending_broken_study | ending_class |
| online-heir | dinner_send_confirm | ending_exposed_chat | ending_restart |
| black-flood | arena_original | ending_lost_class | ending_teacher |
| radish-court | market_doublepledge | ending_closed_kitchen | ending_kitchen |
| harvest-box | mill_claims | ending_lost_mill | ending_mill |
| temple-heart | b_shadow | b_shrine_bad | b_shrine_good |
| tiger-shelter | b_signal | b_mountain_bad | b_mountain_good |
| six-roots | b_notice_school | b_school_bad | b_school_good |
| palace-ledger | b_gate_reply | b_merchant_signed | b_merchant_good |
| red-plum | b_ditch | b_ferry_bad | b_ferry_good |
| hollow-immortals | b_broken_cart | b_return_bad | b_return_good |
| island-broadcast | b_camera_stop | b_shore_bad | b_shore_good |
| wrong-realm | b_cooling_realm | b_depart_bad | b_depart_good |

### Verification

Final-round files use `output/world-continuation/` and
`output/playwright/world-continuation-final/`, separate from the older prose pass.
Export replays all 185 ending witnesses and preserves all source metadata.

- `story-test-final.log`: **74/74** core-creative, core-prose, all-world prose,
  prose-contract and continuation tests passed. The continuation suite restores
  **1,961** pre-pass Ink save points through both ID and text-only histories:
  **3,922 restores**, with unchanged costs, gates, resources and depletion exits.
- `build-final.log`: production build passed; Vite retains its large-chunk warning.
- `output/playwright/world-continuation-final/report.json`: **120/120** cases,
  covering each world's decision, failed ending and earned ending at 1440x960
  and 320x740. Exact displayed text, vertical reading access, legal choices,
  resources, clues and ending-history access passed. No page errors or horizontal
  overflow. Opened desktop/mobile screenshots, including the refreshed score-room
  ending and the corrected shrine/capture endings.
- `verification.json`: all **838** scene hashes and 20 complete compiled worlds
  match current code; all **34** source anchors match the cached original text.
  It also validates reader content/SHA256, screenshot files/dimensions and the
  archived evidence used for unchanged worlds.
- The unmodified bundled game client ran through the scoped wrapper. Its current
  hollow-immortals screenshot was opened at
  `output/playwright/world-continuation-final/skill-client/shot-0.png`.

The first final browser run stopped after 52 cases when the shared UI's ending
history label changed; the next attempt found both header and ending buttons.
The selector is now scoped to the ending actions. The identical-snapshot resume
completed all 120 cases. The subsequent score-room correction required a fresh
export: **114 cases** from **19 byte-equivalent compiled worlds** were retained,
and **6 score-room cases** rerun. `pre-owner-refresh-manifest.json` and
`pre-owner-refresh-browser.json` retain the old hashes/results. The new report's
`carriedEvidence` is independently checked by the verifier; a changed world never
inherits its old browser acceptance. Logs: `browser-final.log`,
`browser-resume.log`, `browser-resume-scoped.log`, `browser-owner-refresh.log`.

**Repository-wide residual failures:** the latest `full-test-final.log` has
**447 tests / 445 passed / 2 failed**, both outside this prose ownership:
`tests/art-production-prompts.test.ts`'s photographed-cel prefix assertion and
`tests/art-production.test.ts`'s concurrent worker peak assertion (`1 !== 2`).
No art implementation or art test was edited. These failures remain recorded
separately in `verification.json`; the 74-test prose acceptance does not claim a
green repository-wide suite.

Browser delivery uses isolated current-world GET interception against the
existing shared service. This verifies the exported prose, not live-cache
publication or completed illustrations. Historical failure screenshots/logs are
retained; the final report and verification JSON are the current acceptance.

Implementation uses `content/world-continuation.ts` and its core/A/B sentence
tables, reusing `reviseWorldProse`. Exact original-string matches preserve later
route-owner corrections. Catalog route source and direct exports, frontend,
shared and server files were left untouched. No paid requests, service restart
or commit. Generated workshop worlds are outside this authored registry.

Reproduce the continuation checks with `node --import tsx --test tests/world-continuation.test.ts`
and `node --import tsx tests/world-continuation-check.ts export|browser|skill|verify`
(choose one stage at a time). The baseline capture is intentionally one-shot
and rejects an overwrite of the original fixture.

## All-world prose pass / delivered 2026-09-06

Latest user scope: all worlds. The current registry has **20 worlds / 838 scenes**.
The earlier four-world edits remain, along with the root's later onboarding
corrections. This pass reviews the other sixteen worlds and applies exact,
handwritten sentence revisions at the registry boundary. Catalog A/B route
files and their direct exports remain with their owners. Each replacement only
applies while its original sentence still matches, preserving newer concurrent
corrections. Original quotations, IDs, gates, costs and save versions stay intact.

This turn revised **129 visible fields / 104 scenes / 5 choice labels** in the
sixteen catalog worlds. The four previously polished core worlds were included
in the audit and replay checks. Across the complete registry, monitored
expressions fell from **133 to 33**. The indicator counts `不是`, `不只是`,
`真正`, `并非` and `而是` in visible prose, including introductions and challenge
text; source quotations, legacy aliases and duplicate ending metadata are
excluded. Necessary warnings and natural disagreement remain. Revisions use
concrete events and character actions while retaining each ending's outcome.

**Versions unchanged; no new, renamed or removed scene/choice IDs.** Existing
paragraph counts, routes, resources, costs, gates, source links and adaptation
claims remain intact. The five renamed choices retain exact `legacyTexts`.
The pre-pass fixture is `tests/fixtures/worlds-pre-prose.json.gz`.

Current-turn evidence:

- `output/world-prose-full-test.log`: **389/389** repository tests passed.
  The new all-world tests restore **1,961** real pre-pass Ink save points with
  both ID-based and text-only histories, totaling **3,922 restores**. Each legal
  graph edge has a replay witness; gameplay/resource contracts are unchanged.
- `output/world-prose-build.log`: production build passed.
- `output/world-prose/scene-manifest.json`: all **20 worlds / 838 scenes**,
  per-field before/after text, current scene hashes, source/adaptation metadata,
  full-world exports and **185** successfully replayed ending witnesses. All
  IDs and existing illustration target paths are preserved. Use this all-world
  snapshot for this prose handoff; earlier core-only snapshots below are history.
- `output/playwright/world-prose/report.json`: **40/40** cases, one scene per
  world at 1440x960 and 320x740 with 22px text. Each compares the visible paragraph
  exactly and clicks a legal choice, checking next scene, resources and clues.
  No page errors or horizontal overflow. Opened desktop and narrow screenshots
  for A/B prose inspection. The bundled game client also ran and its screenshot
  was opened at `output/playwright/world-prose/skill-client/shot-0.png`.
- `output/world-prose/verification.json`: all **838** exported scene hashes
  match current code; all **34** source anchors occur verbatim in the cached
  excerpts. Source text SHA256 is separate from the mutable cache envelope.
  Browser screenshot files and their dimensions were verified.

The first browser attempt timed out waiting for the page `load` event; its log
is `output/world-prose-browser.log`. The complete rerun uses DOM readiness and
is logged in `output/world-prose-browser-rerun.log`. Browser checks receive the
current exported world through isolated GET interception. The shared service
was left running; this evidence does not assert a refreshed live server cache.
Missing illustration assets remain production work, separate from prose checks.
Generated workshop drafts are outside the 20-world authored registry audited here.

Implementation: `content/world-prose.ts`, `world-prose-a.ts`, `world-prose-b.ts`
and the final registry adapter in `content/worlds.ts`. Catalog A/B route files
and their direct exports were left untouched. Exact matches also preserve later
route-owner corrections, with an explicit regression test for that behavior.
No frontend/shared/server changes, server restart, paid art requests or commits.

Reproduce with `node --import tsx --test tests/world-prose.test.ts`, then
`tests/world-prose-export.ts`, `tests/world-prose-browser.ts`,
`tests/world-prose-skill-client.mjs` and `tests/world-prose-verify.ts` through
`node --import tsx`. The sections below describe earlier core-only work.

## Delivered core / integration notice

### Earlier: four-world prose revision

Latest request: reduce formulaic negation, contrast pairs and emphatic wording
such as `不是……而是`, `不只是` and `真正的`. This pass edits core narration,
titles and choice labels while preserving route IDs, effects and original source
quotes. The exact pre-revision worlds are captured in
`tests/fixtures/core-pre-prose.json.gz`; changed choices retain their old labels.
Art scene IDs remain frozen. **62 scenes** were revised and **3 choice labels**
received exact save aliases. Versions, routes, costs, gates, paragraph counts,
source quotations and source links are unchanged.

- Visible authored text contains **13** occurrences of the monitored expressions,
  down from **76**: blue 22 to 4, pursuit 19 to 5, velvet 16 to 3, island 19 to 1.
  This indicator excludes source quotations and legacy aliases. Natural dialogue
  and necessary warnings remain; prose was reviewed in context.
- `output/core-prose-test.log`: **71/71 passed**. New tests replay **424** real
  pre-revision save points with both ID and text-only histories, **848 restores**,
  and verify identical graph/resource contracts and canonical revised prose.
- `output/core-prose-build.log`: production build passed.
- `output/playwright/core-prose/report.json`: **38/38** browser cases passed,
  covering all 26 new endings at 1440px and all 12 Bad Ends at 320px. Every case
  opened history review. The blue homecoming and pursuit captured screenshots
  were also opened for text inspection. Browser-local current-world responses
  were used; the shared service stayed running.
- Re-exported `output/creative-core/scene-manifest.json` at
  **2026-09-06T02:26:21.801Z**, plus all four worlds and 47 ending saves.
  All **204 scene hashes** match current authored nodes. This is the default
  text/ID handoff for art; scene illustration targets retain their paths.

The checkpoints below describe the earlier story-expansion pass. For this prose
revision, use the logs and browser evidence above. The full repository suite
was left to the integration owner; this pass ran focused core regression.

Owner: this conversation. Only core content/adapters/tests and this report are
being changed. No catalog A/B, frontend, shared/server edits, server restart,
commit or paid art request. The running server may still hold the earlier graph.

Baseline captured **before edits**, including authored text and choices:
`tests/fixtures/core-pre-creative.json.gz`.

| World | Previous version | Delivered version | Previous nodes / ends |
|---|---|---|---|
| blue-blood | 1.2.0 | 1.3.0 | 32 / 7 |
| double-pursuit | 1.1.0 | 1.2.0 | 20 / 4 |
| velvet-alibi | 1.1.0 | 1.2.0 | 20 / 4 |
| future-island | 1.2.0 | 1.3.0 | 51 / 6 |

Old node/choice IDs, transitions, costs and gates remain legal. Changes are
additive branches; edited option wording records exact `legacyTexts`. Existing
replay migration is used, with real pre-edit Ink worlds compiled from the
fixture for verification. New branch route markers are exclusive and permanent.

## Source review and dramatic treatments

Read all four `.local/zhihu-cache/story-{storyId}.json` excerpts and all 18
`content/source-passages-core.ts` anchors. Each excerpt is incomplete (3,000
characters); none supplies the endings below. Keep original URLs and quotations.

### 蓝血 / blue-blood

- Question: returning home is possible, but which part of you arrives?
- Source: blue blood, directed examination, displaced landmarks, grey-jacket
  disappearance; observation of reactions is the narrator's hypothesis.
- Adaptation: a boundary machine uses remembered details to maintain an identity;
  grey jacket is a stranded previous returnee, not the explanation of the novel.
- Fang Nuo wants her old life; Zhang Wei wants tomorrow's friend to recognize her;
  the observer wants someone to take his place. A delayed echo and a duplicate
  shadow foreshadow the return toll. Choice of return, destruction or exchange
  is irreversible. Attention preserves the sequence; contact reserve anchors a
  living witness. Reckless crossing traps the body; erasing the wrong anchor
  erases the self; buying passage with a friend replaces that friend.
- Reserved scene IDs: `b_signal`, `b_measure`, `b_fork`, `b_anchor`, `b_cross`,
  `b_blackout`, `b_counter`, `b_burn`, `b_price`, `b_listen`, `b_chamber`.
- Reserved endings: `ending_red_home`, `ending_glass`, `ending_erased`,
  `ending_replacement`, `ending_blind_city`, `ending_blue_exile`.

### 双重追踪 / double-pursuit

- Question: can you get out without letting two pursuers choose who pays?
- Source: male tenant Zhang Dongdong, two distinct pursuers, photo wall,
  endangered elderly neighbor, arriving police. No sexualized threat or diagnosis
  is needed for this thriller adaptation.
- Adaptation: a broken roof access, a meter-room shutter and the pursuer's
  counterfeit reassurance become three physical routes, not three speeches.
- Dongdong wants daylight; Li Yu wants possession; the elder fears opening his
  door to the wrong voice. A missing roof landing, exposed battery and sticking
  shutter are shown before commitments. Stamina enables controlled movement;
  battery enables a timed signal. Falls, a late warning and surrendering the only
  contact produce different losses. Staying behind cover remains a free exit.
- Reserved scenes: `p_latch`, `p_receiver`, `p_split`, `p_roof_stair`,
  `p_roof_door`, `p_gutter`, `p_roof_signal`, `p_roof_descent`, `p_meter`,
  `p_old_door`, `p_shutter`, `p_hold`, `p_decoy`, `p_listening`, `p_bait`, `p_switch`.
- Reserved endings: `ending_roof_alive`, `ending_floor_alive`, `ending_trap_exposed`,
  `ending_fall`, `ending_silence`, `ending_captured`, `ending_pursuit_loss`.

### 史密斯装穷夫妇 / velvet-alibi

- Question: when the disguise stops being amusing, what do you refuse to sell?
- Source: mutually staged poverty, egg/cake/milk details, the friend's factory,
  a family-imposed marriage and the boyfriend's concealed wealthy identity.
- Adaptation: the family's factory collateral gives the banquet a concrete
  deadline. Keep romantic irony, deepen into a social suspense story, not an
  unrelated science-fiction plot. The boyfriend's family can rescue the factory
  only by taking it over. Friend/worker losses matter independently of romance.
- Public rupture, private separation and a joint factory rescue are exclusive
  routes. Preparation and private time buy verified figures / a place to stay;
  trusting the theatrical rescue, humiliating a friend or continuing the double
  lie ends in captivity by money, broken friendship or an empty relationship.
- Reserved scenes: `v_invite`, `v_box`, `v_deadline`, `v_fork`, `v_stage`,
  `v_mic`, `v_backstage`, `v_exit`, `v_room`, `v_budget`, `v_platform`,
  `v_factory`, `v_nightshift`, `v_offer`, `v_payday`, `v_lastmeal`.
- Reserved endings: `ending_own_name`, `ending_small_room`, `ending_factory_dawn`,
  `ending_gilded`, `ending_empty_table`, `ending_friend_lost`, `ending_factory_closed`.

### 未来岛 / future-island

- Question: does endless money buy a future or a perfectly supplied tomb?
- Cast: 郗未 wants an actual second life, not merely an expensive imitation;
  崔英睿 wants an obedient system and conceals its cost behind relief from fear;
  朱玲玲 wants her ability to sustain people rather than consume their last food;
  闻澄 wants promises small enough to deliver; 段铎 has to confront the common
  failure hidden inside his reassuring redundancy diagrams.
- Source: one-winner rule, infinite wealth, mental-control/love abilities,
  engineered island, destroyed transport and the unexpected flood.
- Adaptation: maintain the existing limited-workboat divergence. A corroded
  common intake creates a failure shared by redundant machines; the rule's final
  offer tempts the owner to abandon others. Three exclusive endings of the crisis:
  save the inhabited upper island, evacuate and scuttle the asset, or claim the
  lonely prize. Emergency allocation buys one more attempt, never infinite time.
- Reserved scenes: `f_alarm`, `f_intake`, `f_fork`, `f_divers`, `f_bulkhead`,
  `f_surface`, `f_convoy`, `f_ballast`, `f_beacon`, `f_crown`, `f_voice`, `f_receipt`.
- Reserved endings: `ending_highwater`, `ending_last_ship`, `ending_salt_tomb`,
  `ending_white_room`, `ending_borrowed_voice`, `ending_empty_harbor`.

## Art handoff

The IDs above are frozen and match the verified final manifest below. New
content uses independent per-scene target paths, not a claim of generated
illustrations. Existing art IDs and cast IDs are preserved.
Native 4K generation/review belongs solely to the art-production conversation.

## Verification — final checkpoint 2026-09-06 10:05 Asia/Shanghai

Implementation is now on disk. All reserved scene/end IDs above exist; **no ID
was renamed or removed**. Core counts: blue 49 nodes / 13 ends, pursuit 43 / 11,
velvet 43 / 11, island 69 / 12. These include respectively 36, 32, 32, 57
non-ending decision scenes. Every world adds three explicitly dark Bad Ends.

Current focused regression: **69/69 passed**, including
all pre-edit edges replayed from the compressed baseline through actual old Ink,
text-only save restoration, all new endings, route exclusivity, exact costs,
rewind-before-commitment and depleted-state exits. Existing backend route audit
also passed for all four core worlds. Production build passed.

Browser runner: `tests/core-creative-browser.ts`. The final expanded run passed
38 cases with fresh Ink at 1440/320 widths, after an earlier 26-case smoke run at
1440/390. Both use browser-local API interception and genuine full-prefix saves.
**The shared server was not restarted and this is not a claim that its cached
graph has refreshed.** Dispatch now helps brace the pursuit route; choosing rest
in the independent route really ends the evening instead of immediately converging.

Historical integration snapshot, superseded by the final results below: the run in
`output/creative-core/full-tests.log` has 219 tests, 208 passed / 11 failed.
The 11 failures are outside core: eight old resource-count assertions now see
three resources in catalog B, tiger-shelter has an unreachable `b_repay/borrow`,
and two catalog-B provenance notes lack the test's required adaptation wording.
Core does not edit these catalog files or their tests. Two earlier core migration
assertions were corrected to compare canonical current prose, not old prose;
actual decision sequences/resources remain identical. The new comprehensive
baseline migration test verifies that invariant for every old edge.

Art manifest: `output/creative-core/scene-manifest.json` (204 core nodes, including
81 additions). It contains final IDs, titles, locations, text, ending tone,
choices/costs/gates and source cache hashes. All 81 new target paths are
`/assets/scenes/{worldId}/{nodeId}.webp`. They are targets, **not generated art**.
Please use final manifest text when producing independent native 4K scenes.

### Final results (supersede the intermediate snapshots above)

| World | Version | Nodes | Non-ending scenes | Endings | New Bad Ends |
|---|---|---:|---:|---:|---:|
| blue-blood | 1.3.0 | 49 | 36 | 13 | 3 |
| double-pursuit | 1.2.0 | 43 | 32 | 11 | 3 |
| velvet-alibi | 1.2.0 | 43 | 32 | 11 | 3 |
| future-island | 1.3.0 | 69 | 57 | 12 | 3 |

- **81 added nodes; 26 new resolved endings; 12 Bad Ends; three exclusive new
  routes per world.** Older low-risk epilogues also receive life/event closure,
  rather than ending only with an intention to investigate tomorrow.
- **420 authored edges** replay through actual Ink. Routing-equivalent state
  exploration retains resource/gate facts; not every display-only state is
  separately replayed. Explicit ending assertions check earned anchors, safe
  neighbors, public withdrawal, cargo and isolation. Prior safety evidence may
  not be forgotten just to force a Bad End.
- **257 pre-edit save points**, each restored both with choice IDs and with
  text-only histories. Old IDs/transitions/costs/gates remain intact. Current
  prose is rebuilt canonically. All new decisions additionally receive actual
  zero-resource Ink fixture checks, not just a visual disabled-button check.
- Core regression: `output/creative-core/final-core-regression.log` — **69/69**.
  Separate existing all-route audit: `output/creative-core/core-routing.log` —
  **4/4**. Build: `output/creative-core/final-build.log` — passed; TypeScript was
  rerun after adding the final narrow-screen control test and passed.
- Expanded browser verification is now complete: **38 cases** = all 26 new
  endings at 1440px plus all 12 Bad Ends at 320px / 22px text. Unlike the earlier
  two-decision smoke run, this run clicks from each new branch entry through its
  ending. `output/playwright/creative-core/report.json` is the new default browser
  evidence; `output/creative-core/browser/report.json` is the earlier 26-case
  1440/390 smoke run. Both were executed in this turn; do not mix their counts.
- The bundled develop-web-game client was run and its screenshot opened:
  `output/creative-core/skill-client/shot-0.png`. It checks the shared frontend's
  source-reader surface, not publication of the new cached server graph.
- Opened and inspected all-ending/choice contact sheets and individual 390px
  screenshots, then the four current 320px Bad End screenshots. Text wraps and
  remains readable. Missing illustrations stay visibly unfinished. Ending
  buttons below the fold were separately scrolled into view and clicked:
  `output/creative-core/ending-controls.json` — **4/4**, returning to each world's
  actual opening with zero decisions. Screenshots: `output/creative-core/browser/*-ending-controls-320.png`.
- Latest full-suite snapshot: `output/creative-core/final-full-tests.log` —
  **237 tests, 229 passed / 8 failed**. The remaining eight are catalog-B worlds
  in `tests/backend-worlds.test.ts`, whose old assertion expects exactly two
  resources while catalog B now supplies three. The earlier unreachable-edge
  and provenance-note failures are absent in this later snapshot. No catalog
  edits were made by this conversation; final integration belongs to its owner.
- Current machine-readable summary: `output/creative-core/final-verification.json`.
  Every manifest scene hash was compared against the current authored node after
  export; all matched. All 38 current screenshot files were checked to exist.

### Reproduction and handoff

- Core tests: `node --import tsx --test tests/core-creative.test.ts`.
- Manifest, all 47 ending saves and four complete compiled worlds:
  `node --import tsx tests/core-creative-export.ts`.
- Browser: `tests/core-creative-browser.ts`. The final run used the installed
  Edge channel via a process-local `chromium.launch` wrapper; the shared server
  stays at port 4173. Only isolated browser GET responses receive current Ink.
- Narrow controls: `node --import tsx tests/core-creative-ending-controls.ts`.
- Code: `content/core-dramatic.ts`, `core-story-kit.ts`, the four
  `core-story-{blue,pursuit,velvet,island}.ts` modules, `core-epilogues.ts` and
  the core registry pipeline in `content/worlds.ts`. Exact existing option
  wording aliases are added by `renameChoice`, not guessed at import time.
- The default art handoff is the **final** `output/creative-core/scene-manifest.json`,
  whose `worlds[].scenes` include final text, IDs, source anchors and hashes;
  `worlds[].paths` include real ending paths/resources/clues. Four `.world.json`
  exports and 47 `.save.json` files beside it are executable fixtures, not art.
- No paid requests, shared-server restart, catalog A/B edits, frontend/shared/
  server edits, or commit were made. Core narrative implementation is complete;
  native 4K scene production and normal server-cache refresh remain with the
  designated owners. This is not a claim that the whole game/art project is done.

### Latest closure verification

- Current browser evidence: `output/playwright/creative-core/report.json`,
  generated **2026-09-06T02:11:51.483Z**. All **38/38** route cases passed,
  including all 26 new endings on desktop and all 12 Bad Ends at 320px.
  Every case also clicked **回看这条路** and checked the full Ink history.
  One preceding run timed out locating that control; the complete rerun passed
  after adding explicit scroll-to-control and failure-state capture. Its cause
  is not established, and the earlier incomplete run is not the default evidence.
- Separately reran `tests/core-creative-ending-controls.ts`: **4/4** narrow-screen
  replay controls returned to the genuine opening with zero decisions.
- Latest complete suite: `output/core-creative-full-test.log` — **279 tests,
  271 passed / 8 failed**. All eight failures are the unchanged catalog-B
  `3 !== 2` resource-count assertion in `tests/backend-worlds.test.ts:116`.
  Core focused regression remains **66/66** in
  `output/core-creative-focused-test.log`; this is a different selection from
  the earlier 69-test log. Latest build: `output/core-creative-build.log` — passed.
- Compared all **204** manifest scene hashes against current compiled nodes and
  restored all **47** exported ending saves. All matched. Verified the existence
  of all 38 screenshots and inspected the previously timed-out factory ending
  and a 320px ending-control screenshot. No horizontal overflow or page errors
  were recorded by the complete route run.
- Live GET `/api/worlds/2025684191967294692` still returns **1.2.0**; disk content
  is **1.3.0**. The shared service was left running as instructed. Integration
  owner must refresh its cached registry in their normal coordinated process.
- Art handoff remains `output/creative-core/scene-manifest.json`: final IDs and
  full text, **81 added scenes / 26 new endings / 12 new Bad Ends**. No paid art
  requests or native-4K completion claims were made by creative core.
