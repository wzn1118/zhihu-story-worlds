# Core Source Passage Review

Date: 2026-09-06

This review covers source-location metadata in `content/source-passages-core.ts`.
It adds no scenes, choices, routes, API requests, or generated art, and does not
modify the cached source files.
Every quote is taken from the corresponding local cache's `data.content`; the
notes distinguish the original premise from investigations and endings authored
for the game. The cached API text is an excerpt, not a complete original work.

## Source Inputs

| World | Cache | Anchors |
| --- | --- | ---: |
| `blue-blood` | `.local/zhihu-cache/story-2025684191967294692.json` | 5 |
| `double-pursuit` | `.local/zhihu-cache/story-2025333783608537435.json` | 4 |
| `velvet-alibi` | `.local/zhihu-cache/story-2068540656734180439.json` | 4 |
| `future-island` | `.local/zhihu-cache/story-1831621186162937856.json` | 5 |

## Adaptation Boundaries

- Blue Blood: differing tests, geographic anomalies, the observer's disappearance,
  and the narrator's hypothesis come from the excerpt. Saved photos, reflective
  boundaries, nighttime investigation, independent handoffs, and endings are game
  additions. The hypothesis remains unconfirmed.
- Double Pursuit: exposed private information, shelter with a dangerous neighbor,
  intrusive photographs, and arriving police come from the excerpt. Evidence
  preservation, identity checks, earlier warnings, and follow-up outcomes are game
  additions. The metadata does not diagnose characters from their actions.
- Velvet Alibi: mutual concealment, expensive packaging, disguised breakfast, and
  family pressure come from the excerpt. Consent checks, refusal, relationship
  agreements, and independent endings are game additions.
- Future Island: game rules, NPC construction workers, water systems, announced
  transport destruction, and flooding come from the excerpt. Retaining a limited
  workboat explicitly diverges from the original destruction of boats and planes.
  Cargo capacity, contacts, manifests, receipts, equipment trials, maintenance
  cooperation, and all associated rescue outcomes are game additions.

## Verification

Verification loads the TypeScript export with Node and `tsx`, parses each JSON
cache with `JSON.parse`, and checks the final `authoredWorlds` objects after their
existing gameplay extensions. Checks cover a single exact quote occurrence within
one source paragraph, quote length, unique anchor IDs, existing scene IDs, and
clues emitted by actual `choices[].effects.clues`. No source excerpts are copied
into this review.

The structured Node check passed with these concrete totals:

| World | Unique exact quotes | Scene references | Distinct scenes | Clue references | Quote lengths |
| --- | ---: | ---: | ---: | ---: | --- |
| `blue-blood` | 5 | 24 | 23 | 10 | 19-43 |
| `double-pursuit` | 4 | 16 | 16 | 3 | 19-38 |
| `velvet-alibi` | 4 | 19 | 19 | 5 | 22-62 |
| `future-island` | 5 | 37 | 35 | 16 | 22-54 |
| Total | 18 | 96 | 93 | 34 | 19-62 |

All 18 anchor IDs are globally distinct. All 34 clue references are distinct
within their world and exist among actual choice effects. Scene counts are
scoped by world; repeated links to the same scene are counted once in the
distinct-scene column. Quote lengths use JavaScript string length. Each quote
has exactly one occurrence and is fully contained within one source paragraph.
