# Story world contract

The canonical types are in `shared/types.ts`. `GET /api/worlds/:id` returns a
`GameWorld` directly. `GET /api/stories` returns `{ stories, source, fetchedAt,
warning? }` with `source: 'live' | 'cache'`.

Frontend/root coordination: these files are now on disk and stable. The server
entry is `server/index.ts`, Vite middleware in development, static `dist` in
production, bind `127.0.0.1:4173` and try the next available port. CLI entry is
`scripts/story-cli.mjs`; `scripts/stories.ts` provides the existing npm wrapper.
Current generated assets are recorded in `docs/art/current-delivery.json`.
The current catalog contains 20 real-source worlds. `content/worlds.ts` is the
single registry; `server/story-source.ts` derives playable status and author
metadata from it. The first four worlds plus `catalog-a.ts` and `catalog-b.ts`
contain 379 nodes, 805 choices and 69 endings. Exact source hashes, IDs and
current counts are recorded in `docs/catalog-acceptance.json`.
Blue Blood uses `/assets/blue-blood-cover.webp` in the library and
`/assets/blue-training-room.webp` with separate Fang Nuo sprites in its first two
scenes. `/assets/blue-blood.webp` remains legacy art for later locations pending
replacement. Other worlds' planned asset paths are not delivered artwork; do not
publish the rejected apartment illustration at `/assets/double-life.webp`.

Each world has `nodes: Record<string, SceneNode>`, `startNodeId`, `characters`,
`introduction: string[]`, `player`, `objective`, `cover`, `background`, `summary`,
`source`, `version` and `ink` (compiled Ink JSON).

Characters may provide `portraits.main` and `portraits.reaction`, with `portrait`
as a legacy fallback. A scene may explicitly select `character.id`, `expression`
and `position`; otherwise the frontend matches its speaker to the cast. Character
layer failure must not block choices or dialogue. The actual resolved image and
loading state are exposed in `render_game_to_text()` for browser verification.

Ink uses `VAR resolve = 50`, `VAR trust = 30` and one boolean per clue. Each scene
emits `# node:NODE_ID`. Read that tag to select the corresponding graph node for
location, speaker, chapter, choices and ending metadata. The current visible Ink
choices determine which graph choices are available; each Ink choice emits
`# choice:CHOICE_ID`. The frontend should apply `ChooseChoiceIndex(index)` and
continue until no more text, then use the current node tag. Ink applies effects
and enforces clue requirements. Read resolve/trust from Ink variablesState.
Discovered clues are variables named `clue_<id>`; the `effects.clues` values are
human-readable Chinese strings, mapped by world compilation to stable `clue_0`,
`clue_1`, etc. Worlds additionally include `clueVariables` for this mapping.

Source story choices / asset keys:

- `2025684191967294692`, 蓝血, 桃花先生, world `blue-blood`.
  Adult office worker 方诺, colleague 张薇, unidentified grey-jacket observer.
  Current art: `/assets/blue-blood-cover.webp`, `/assets/blue-training-room.webp`,
  `/assets/fang-nuo-main.webp` and `/assets/fang-nuo-reaction.webp`.
  Scene: fluorescent emergency-training office, disquieting blue blood premise,
  red / cyan monitor light and midnight alley.
- `2025333783608537435`, 李冬原著：同时被两个精神病追杀,
  写小说的秃头老张, world `double-pursuit`.
  Adult tenant 张冬冬, dangerous neighbor 李宇, threatening online stalker.
  Planned art, not yet delivered: `/assets/night-pursuit.webp`.
  Scene: aged apartment corridor, red emergency lighting, closed doors. Gameplay
  is escape / evidence / rescue, excludes sexual coercion and graphic violence.
- `2068540656734180439`, 史密斯装穷夫妇, 年年, world `velvet-alibi`.
  Adult 杜曼笙, boyfriend 林望鹿, former partner 程墨, adult close friend.
  Planned art, not yet delivered: `/assets/double-life.webp`.
  Scene: small rented apartment and upscale night club with burgundy velvet,
  hidden identity, intimacy and voluntary adult relationship choices.
- `1831621186162937856`, 末世我靠钞能力躺赢, 苏青瓷, world `future-island`.
  Adult cast, altered present/future communication, resource and evidence routes.
  Fifty-one scenes and six endings; matching art remains pending.

The API supplies incomplete story excerpts that end mid-sentence. All branches
and endings are explicitly game adaptations based on those excerpts, never
represented as the original ending. Unsupported real stories return HTTP 409
`WORLD_NOT_PREPARED`; their original detail remains readable.
All 20 currently returned stories now have adaptations. HTTP 409 is retained
for future catalog additions that have not actually been authored.

Portable save files use `{ format: 'redleaf-save', version: 1, game: SavedGame }`
and a 1 MiB UTF-8 limit. Restoration checks story/world/content version, loads the
Ink state, and replays recorded choices against the current world before using a
canonical session. UI imports are previewed before explicit manual-slot writing.
Rejected files must leave current sessions and stored slots unchanged.

A world may explicitly declare `compatibleSaveVersions`. For these revisions,
restoration still validates the imported structure, Ink JSON and recorded path,
then uses the current world's replayed effects and choices. This is only for
revisions retaining existing choice texts and legal paths, not arbitrary version
upgrades. Blue Blood 1.0.1 accepts 1.0.0: its timestamped photograph now also
records the observer's itinerary, opening the previously unreachable proof
route. Old saves receive that fact only if their recorded decisions earned it.
New saves use the current version. Unknown revisions remain rejected.
The four original worlds first advanced to 1.1.0 and accept their previous
versions. Added resource costs leave all original choices affordable; optional
evidence-review branches add one ending each without changing old path IDs or
choice text. Migration reconstructs new balances by replay, not by trusting
imported display metadata.

Optional `calendar.firstWeekday` and per-node `clock.minuteOfDay` /
`clock.notBeforeDay` define story chronology without parsing display text.
The runtime replays the visited node sequence, rolls an earlier clock time into
the following day, and respects a node's earliest day. `Session.timeLabel` is
computed for the current route and exposed in the UI and browser diagnostics.
Worlds without a calendar and epilogues keep their authored `time` label.
The Smith couple starts on Thursday; the club is Friday and the family event
cannot precede Saturday. Late alternate conversations can move the later family
response to Sunday. This display metadata leaves Ink choices, effects, content
versions and old save formats unchanged.

Gameplay expansion contract (2026-09-06): a world can declare `resources` with
`{ id, label, initial, min, max, description }`; IDs use lowercase letters,
digits and underscores. All values are safe integers. Choices change them via
`effects.resources`. Negative deltas require enough units before the choice is
available; gains clamp at the declared maximum. Costs never silently spend
below the minimum. The Ink compiler enforces these gates and effects.

`requires` adds `allClues`, `anyClues`, `noneClues`, `resources: { id: { min?, max? } }`,
`resolve: { min?, max? }` and `trust: { min?, max? }`. Existing `requiresClue`
remains supported. All conditions combine with AND except the members of
`anyClues`. `noneClues` requires every listed clue to be absent. Every non-ending node must retain a legal route for every reachable
state; a depleted resource needs a retreat, alternate tactic or earned failure
ending. At least one legal path must reach every authored choice.

`mechanics: { title, description, beginnerTip }` defines each world's specific
play loop. A scene may provide `challenge: { kind, prompt, hint }`, where kind
is investigation, deduction, negotiation or resource. These are story-specific
objectives and optional hints, not substitutes for actual gated decisions.
Resources live in actual Ink state, runtime Session and exported saves; old
resource-free saves remain readable. Content updates that change existing
decisions/effects require explicit version/migration review.

Action feedback and rewind (2026-09-06): optional choice `feedback` contains
`{ tone: 'success' | 'setback' | 'neutral', text }`. It describes that specific
action, not a fact automatically true on every incoming route. Runtime
`lastOutcome` uses actual before/after Ink balances, including caps, and only
newly earned clues. Save restoration derives this feedback from authored data.

New history entries record both `choiceId` and canonical `choice` text. Existing
text-only saves remain supported. A narrowly corrected option may declare exact
`legacyTexts`; replay accepts only its canonical text or those declared aliases,
and checks the ID when present. Current Ink choices normalize only declared
aliases during validation. IDs, costs, requirements and route structure must
remain unchanged for this text-only compatibility path.

`rewindSession(session, historyIndex)` creates a fresh Ink session and replays
decisions before that index. It preserves the original session, resets the target
to its decision page, removes future rewards/history and restores its actual
clock, resources and clues. UI confirmation updates automatic progress; manual
saves and the separately stored ending collection remain unchanged. Invalid or
stale targets fail without replacing the current session.

Investigation/logistics expansion (2026-09-06): Blue Blood and Future Island are
now 1.2.0, accepting their 1.1.0 and earlier declared versions. Their registry
adapters preserve old choices and add optional branches. Blue Blood permits
free-order evidence review; Future Island adds a four-slot cargo resource.
Its limited workboat is an explicit adaptation divergence from the source's
destruction of long-distance transport, not a claim about the original ending.

`Choice.repeatable` emits an Ink sticky choice (`+`); ordinary choices remain
once-only (`*`). Repeatable navigation must not grant unlimited rewards. Use
`noneClues` completion markers for once-only work and finite costs for repeatable
rest. Resource exhaustion must preserve a retreat or truthful partial ending.

`Session.outcomes` aligns with completed history decisions and retains their
actual effects and feedback in the journal. It is derived by replay, not loaded
as trusted save data. Rewind truncates it along with future decisions. The
existing 500-entry save bound is enforced before another action mutates Ink;
499 completed actions remain saveable, and journal rewind allows continuation.

Scene art only uses the authored scene/world background, never a library cover
as an automatic replacement. Missing art remains unavailable and retryable;
portrait expression fallback within the same identity remains supported.

Graph verification merges only states equivalent for future routing: it keeps
exact resource values, any stats used by gates, and clues read at any reachable
gate or ending assertion. Each authored edge and ending is additionally replayed
through real Ink. This does not mean every full display-state combination was
individually replayed. The current verification record is
`docs/investigation-logistics-verification.md`.

Operation journals (2026-09-06): optional `operationJournals` define read-only
progress for already-entered branches. `nodeIds` controls when a journal first
appears in the visited history. Later matching `stages` supersede earlier ones;
all/any clue requirements refer to real earned facts. Empty requirements and
unknown clues/nodes/resources fail compilation. A recorded review with missing
proof must retain a gap status, not become verified.

The journal is derived from the canonical current session on every display;
no independent saved completion flags exist. Closing a branch marks unperformed
steps as such. Historical cargo loads remain separate from restored current
capacity, and loading is distinct from signing or testing. This presentation
metadata does not change Ink or require a new content version.

`render_game_to_text()` exposes `operationJournals` only while the journal's
progress tab is visible. Other tabs retain existing clues, notes and history.
Current verification: `docs/operation-journal-verification.md` (126 tests).

Source lookup (2026-09-06): optional `sourcePassages` contain an ID, short label,
exact single-paragraph `quote`, related `nodeIds`, optional earned `clues`, and
an adaptation-boundary `note`. IDs must be unique within the world; quote length
is 12-240 UTF-16 units, with no surrounding whitespace. Empty labels/notes and
unknown nodes/clues fail compilation. Quote provenance is separately checked
against the actual API excerpt, never manufactured by the compiler.

Journal visibility follows visited nodes or earned clues and is reconstructed
from the current session after rewind/load. Reader annotations do not grant
evidence or alter Ink/save state. Every search highlight slices the original
content. Missing or ambiguous quotations must be reported as such. Opening the
reader from a journal preserves its tab, scroll and exact trigger on return.

Current source lookup verification: `docs/source-lookup-verification.md`
(138 tests). The preceding operation-journal record is the earlier iteration.
