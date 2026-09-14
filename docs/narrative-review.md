# Narrative Review

Reviewed on 2026-09-06 (Asia/Shanghai). Scope: the four existing worlds and the
four locally cached API excerpts. No full original novel was available.

## Prose Pass

- Rewrote 70 of 71 scene/ending text arrays, retaining three paragraphs per node.
  `blue-blood:ending_blend` already conveyed its consequence through the exam,
  folded paper and observer, so its prose was retained.
- Blue Blood now anchors the discrepancy in the observed blue-to-red blood,
  the protagonist's initially red blood, the three exact displaced landmarks,
  and the observer's missing return from a dead-end alley. Zhang Wei is worried
  and skeptical; the observer offers a testable detail without explaining the
  whole world. The return leaves a cost and an unanswered message.
- Double Pursuit now retains the threatening machinery, physical restraint,
  dated surveillance photographs, confiscated rubbish, blocked stairs and an
  endangered older neighbor. Escape and evidence have different aftermaths;
  neither a friendly manner nor the rescue scene resolves the entire case.
  Zhang Dongdong remains the source's male protagonist; age 26 is adaptation.
- The Smith couple's story keeps the source's comic mutual exposure: the egg,
  luxury cake box, both characters' alcohol excuses, and relabeled breakfast.
  The friend is blunt, the parents name their business dependency, and the
  couple's confession takes awkward time. Later reconciliation is lived in
  bills, questions and routines instead of a statement about healthy relations.
- Future Island now puts the choices in specific scenes: an expiring installer
  slot, a flooded loading bay, empty buckets at a reception point, a waterline
  beside a transport vessel, and a contractor absent from player statistics.
  Cui Yingrui's offer has a coercive implication; Zhu Lingling is unsure whether
  others' generosity can be separated from her power. Isolation still works as
  a survival plan, with the loss of contact as an unresolved consequence.

## Source Fidelity

All facts below were checked against `data.content`, not inferred from labels
or generated from the work's title. The cache files are local research inputs;
they were neither edited nor placed into save exports.

| World / Cached Work ID | Verified In The Excerpt | Game Adaptation Or Deliberate Divergence |
| --- | --- | --- |
| Blue Blood / `2025684191967294692` | Fang Nuo; Zhang Wei; manager Wang; training states blood is blue and becomes red in air; Fang Nuo's own blood is initially red; a colleague's bleeding gums show the difference; an individualized test asks blood and newborn hair colors; Oriental Pearl is in Beijing Chaoyang, built before the 2008 Olympics; Lujiazui has Financial Three Pillars; Huangpu flows through Tianjin; the gray-jacket observer disappears into a familiar dead end. | Events originally occupy several days; the current game compresses the early chronology. A minor paper cut replaces the excerpt's deliberate pin test. The misleading door-sign reflection, staff intermediary, observer interview, return mechanism and all three endings are original. The excerpt ends while Fang Nuo is posting her landmark question; it does not establish a second witness or a route home. |
| Double Pursuit / `2025333783608537435` | Zhang Dongdong explicitly identifies himself as male; a comment leads to threats revealing his name/address and a photograph downstairs; a tool-carrying attacker blocks escape; neighbor Li Yu has previously offered cake, restrains him, possesses private surveillance photos and his discarded rubbish; the two attackers clash; an older resident is badly injured; police arrive and provide a callback. | The source uses black comedy, explicit coercion and exaggerated violence. The game uses a more grounded thriller voice. It omits the coerced performance that triggers the source's fight, adds evidence/communication branches and makes the older resident's successful warning possible. The surveillance investigation, move and recovery are original endings; the excerpt cuts off after the police response and remarks about the attacker's strength. |
| The Smith Couple / `2068540656734180439` | Du Mansheng hides her wealth; boyfriend uses Lin Wanglu, is called Lin-ge at a costly club gathering and also hides his position; the two-yuan egg, expensive cake, reciprocal alcohol excuses and relabeled milk/bread expose their staged poverty; friend warns about Cheng Mo; parents favor a match after a repeatedly unfaithful former relationship; excerpt reaches the friend's remark about the Lu family's heir. | The source's opening synopsis promises a Lu-family intervention and the boyfriend carrying her off; the game develops mutual disclosure and choices to reconcile or separate instead. Public-information checks replace the excerpt's private following. The family confrontation, financial agreements, full disclosure and all three endings are original. The excerpt does not provide the complete resolution of the boyfriend's identity. |
| Future Island / `1831621186162937856` | Xi Wei chooses infinite wealth; 300 dead players receive one preparation year and a sole-survivor rebirth promise; IDs 99/100/101; Cui Yingrui chooses mind control and Zhu Lingling chooses receiving love; a remote Pacific island is bought and named Future Island; extensive bunkers, twelve compartments, redundant utilities and NPC construction; island rain stops after two days while mainland flood inundates underground shelters. | The source protagonist acquires huge fleets and satellite assets, destroys outside long-distance transport and intends to outlast opponents alone. The game's constrained additional capacity, surviving logistics, staff contacts, two named NPCs, score/communications audit and collective routes are substantial alternate development, not the source's strategy or continuation. The excerpt stops while she watches the disaster over hotpot; none of the game's four endings is verified original material. |

Cache files checked:

- `.local/zhihu-cache/story-2025684191967294692.json`
- `.local/zhihu-cache/story-2025333783608537435.json`
- `.local/zhihu-cache/story-2068540656734180439.json`
- `.local/zhihu-cache/story-1831621186162937856.json`

## Validation And Save Compatibility

- Before and after the prose pass, SHA-256 of the complete authored-world
  structure with only narrative text values removed was identical:
  `e83d14e13d08bcf93fec6f6837157ae6d620726427c58bc95711b734211cfe5f`.
  This includes choice text, IDs, order, transitions, numeric effects, gates,
  clue names, versions, source attribution, characters and image references.
  Paragraph counts were included in that structural comparison. There remain
  71 nodes, 129 choices and 13 endings across four worlds, all at `1.0.0`.
  This comparison was captured before root's separate Blue Blood gate repair;
  that later additive clue changes the structural hash and is not a prose edit.
- Captured 24 actual saves before editing (start plus five transitions in each
  world). All 24 restored after recompilation with node, paragraph index, clues,
  resolve and trust preserved. Rendered prose was rebuilt from the new world,
  and every sample with choices could continue. This specifically exercises
  old compiled Ink state against new prose, beyond same-build round trips.
- Ran `npx tsx --test tests/backend-worlds.test.ts tests/save-transfer.test.ts`.
  The first run passed all seven portable-save tests and exposed Blue Blood's
  two existing unreachable gated choices under root's strengthened check:
  `observer:share_proof` and `coordinate:cross_with_reference`. Root then added
  the observer itinerary clue to `alley:save_alley`. The repeat run passed all
  12 tests, with state counts 778 / 2055 / 673 / 8359 and all 129 choices and
  13 endings reachable. Runtime files and this graph repair are root's work.
- A prose edit can alter compiled Ink choice source paths if paragraph/control
  structure changes. This pass retained the three-paragraph shape and exact
  choice strings, and all captured old-state samples passed the current strict
  restoration checks. These samples do not establish compatibility for every
  historical binary or for subsequent graph changes made during integration.
- A separate compatibility probe recreated the pre-repair `save_alley` effects
  using the current prose, followed the route through `accept_exam`,
  `record_test`, `search_landmarks`, `save_map`, `protect_zhang`, `visit_diner`,
  `record_alley`, `save_alley`, then restored its `home` save into root's revised
  graph. Strict restoration rejected it with a state/history mismatch because
  the old save lacks the newly awarded observer itinerary. This is a confirmed
  integration migration/versioning issue at that checkpoint, separate from the
  24 passing prose compatibility samples. The final disposition is below.

### Final Integration By Root

Blue Blood is now 1.0.1 with explicit compatibility for 1.0.0. Existing decisions
are replayed into the corrected world; the missing observation record is awarded
only to a history that preserved the timestamped photograph. Unknown revisions,
invalid history and malformed Ink JSON remain rejected. Four focused route and
migration tests pass in `tests/blue-route.test.ts`.

Root captured a genuine 1.0.0 save from the old running server before replacing
it: `output/playwright/blue-proof-route-20260906/legacy-blue-blood.json`. The
browser imported it into 1.0.1, preserved home paragraph 2/3 and all seven prior
choices, then traversed meet_observer -> share_proof -> cross_with_reference ->
ending_return. The imported manual slot kept its original savedAt. Evidence:
`output/playwright/blue-proof-route-20260906/verification.json`. The narrow
migration risk identified during review is resolved in the current build.

The Smith-couple chronology is also repaired. Scene clocks are reconstructed
from the actual path: a delayed morning conversation moves the subsequent
late-night agreement and family response one day later. `tests/story-clock.test.ts`
has six passing cases, including restoration of saves from content without clock
metadata. No save format or Ink choice structure changed. In the browser, the
same consent_rule choice after a Friday agreement displays Saturday 18:10; after
a Saturday agreement it displays Sunday 18:10. Both imported sessions preserve
paragraph 2/3. Current evidence:
`output/playwright/story-clock-20260906/verification.json`.

## Remaining Weaknesses

- The source snippets are truncated. Their full endings, later reveals and
  complete character motivations remain unknown.
- Blue Blood's observer-photo branch and 1.0.0 save migration are now repaired
  and verified as described above; all 129 current choices are reachable.
- Smith-couple day transitions now follow the chosen path, as verified above.
  Other worlds retain their authored labels and chronology compression.
- The pursuit graph always reaches rescue and has no failed-escape ending;
  consequences differ mainly through evidence and the older neighbor. The
  prose increases pressure without inventing a death/failure state the engine
  cannot represent. Physical travel between the apartment door and water-meter
  recess remains compressed.
- Future Island is an alternate ethics/logistics story built from the source
  premise. Unlimited purchasing versus finite installer/transport capacity is
  now clearer in scene, but still relies on authored constraints rather than
  an economy simulation. Several resource and evidence decisions leave later
  prose shared, so not every earlier decision receives a unique callback.
- Choice wording, some titles and character descriptions still state abstract
  principles. Their text was intentionally preserved for existing saves and
  the current art/character contract.
