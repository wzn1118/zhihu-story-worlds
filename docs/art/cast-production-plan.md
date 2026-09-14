# Cast Production Plan

Prepared on 2026-09-06 from the current 16-entry authored cast and four cached
source excerpts. This is a production contract, not completed art. Anatomy,
costume and source boundaries are fixed in
[character-bible.md](../character-bible.md); drawing authority is
[art-direction.md](../art-direction.md).

## Current State

- **Existing and fixed:** Fang Nuo's root-reviewed integrated-v3 main/reaction
  pair, installed for user review. Existing source PNGs are 2833 x 3777, not
  newly generated full 4K sprites. No regeneration or identity update is planned.
- **Prepared, not generated:** the other 15 main/reaction pairs, 30 images.
  Zhang Wei's prior submission ended with HTTP 402, insufficient credits, and
  zero delivered images. The observer has an unsubmitted prompt. Previously
  rejected or unapproved scene images are not accepted character mains.
- This pass used local reads and documentation edits only: no paid requests,
  balance checks, network calls or credential access. The unresolved credit
  condition is not permission to retry, change channels or switch providers.
- Resume paid production only after the existing channel's balance and the
  unresolved replenishment condition are resolved. Prepared filenames and
  prompts are neither submissions nor evidence of delivered images.

## Output Contract

Every row uses the exact `Character.id`. Runtime `/assets/<filename>` maps to
`public/assets/<filename>`. For an ungenerated image the planned source is
`output/imagegen/<filename-without-.webp>/<filename-without-.webp>.png`.
These are reservations only; do not put placeholder art at a final filename
and report it as a completed character. Fixed Fang Nuo sources are exceptions:

- `output/imagegen/fang-nuo-main-integrated-v3/fang-nuo-main.png`.
- `output/imagegen/fang-nuo-reaction-integrated-v3/fang-nuo-reaction.png`.

New main requests should specify portrait 3:4, 3072 x 4096, knee-up composition,
complete head/hair/elbows/hands and the listed props. Record actual delivered
pixels; never enlarge a smaller output or call it native 4K. Derive reaction
from the accepted actual main. Freeze frame, face scale, skull, hair, costume,
props, pose and light; change only the specified expression. Reconcile older
unsubmitted prompts with the current bible before any future submission.

Use actual `../references/user-character-full-crop.png` and
`../references/user-character-face.png` as character references. They supply
adult linework and construction, not a reusable face for the whole cast.
Reviewed Fang Nuo may guide hard facial-shadow rendering only. Gothic imagery
belongs to independent painted backgrounds. The rejected rental scene and
earlier reference-character lighting studies are not cast identity masters.

New mains use a firm upper-side key, connected anatomical cheek shadow and a
readable lit eye. Freeze that light for reaction and coordinate the background
before publication. Existing Fang Nuo lighting stays fixed. Alpha cleanup must
retain original face RGB, eye whites and hair gaps, passing inspection against
light and dark backgrounds. Inspect both images together before publishing.

## Exact Cast Mapping

Scene columns are intended uses after acceptance, not claims of existing
runtime wiring. Communication/card restrictions apply even when a node names
the speaker. A mentioned person is not automatically physically present.

| World ID | Character ID / Name | Main Filename | Reaction Filename | Intended Main Scenes | Intended Reaction Scenes | Status |
| --- | --- | --- | --- | --- | --- | --- |
| `blue-blood` | `fangnuo` / 方诺 | `fang-nuo-main.webp` | `fang-nuo-reaction.webp` | `training` (integrated) | `test` (integrated) | Existing, fixed, root-reviewed for user review |
| `blue-blood` | `zhangwei` / 张薇 | `zhang-wei-main.webp` | `zhang-wei-reaction.webp` | `zhang` | `zhang` at the memory question, after an expression cue exists | Prepared; main attempt HTTP 402, no image |
| `blue-blood` | `observer` / 灰夹克 | `observer-main.webp` | `observer-reaction.webp` | `observer`; optional distant identity cameo at `transit` | `observer` at the alley question, after an expression cue exists | Prepared, not generated |
| `double-pursuit` | `dongdong` / 张冬冬 | `zhang-dongdong-main.webp` | `zhang-dongdong-reaction.webp` | `landing`; `evidence` as face crop | `photographs`; `stairwell` as face crop only | Prepared, not generated; male identity corrected |
| `double-pursuit` | `liyu` / 李宇 | `li-yu-main.webp` | `li-yu-reaction.webp` | `neighbor` before the exchange tightens | `neighbor` after the phone demand; `photographs` | Prepared, not generated |
| `double-pursuit` | `elder` / 老住户 | `elder-main.webp` | `elder-reaction.webp` | `hallway` at the open doorway before warning | Character-detail/voice portrait at `elder`, not a sprite outside the locked door | Prepared, not generated |
| `double-pursuit` | `operator` / 接警员 | `operator-main.webp` | `operator-reaction.webp` | Character detail; remote portrait at `phone` | Remote portrait at `policecheck` | Prepared, not generated; original role visualization |
| `velvet-alibi` | `mansheng` / 杜曼笙 | `du-mansheng-main.webp` | `du-mansheng-reaction.webp` | `boundary`; `distance` in a standing composition | `confession` as dialogue face crop | Prepared, not generated |
| `velvet-alibi` | `wanglu` / 林望鹿 | `lin-wanglu-main.webp` | `lin-wanglu-reaction.webp` | `dinner`; `agreement` as dialogue portrait crops | `confession`; `rebuild` as dialogue portrait crops | Prepared, not generated |
| `velvet-alibi` | `friend` / 闺蜜 | `friend-main.webp` | `friend-reaction.webp` | `friend` at the car | `friend` after marriage message, after an expression cue exists | Prepared, not generated |
| `velvet-alibi` | `chengmo` / 程墨 | `cheng-mo-main.webp` | `cheng-mo-reaction.webp` | `invitation` at the family room | `invitation` after refusal, only with a pre-exit expression cue | Prepared, not generated |
| `future-island` | `xiwei` / 郗未 | `xi-wei-main.webp` | `xi-wei-reaction.webp` | `coin` after acquiring the coin; character detail | `outage` as dialogue face crop | Prepared, not generated |
| `future-island` | `cuiyingrui` / 崔英睿 | `cui-yingrui-main.webp` | `cui-yingrui-reaction.webp` | Character detail; remote portrait at `control_offer` | Remote portrait at `council` or refusal within `control_offer` | Prepared, not generated |
| `future-island` | `zhulingling` / 朱玲玲 | `zhu-lingling-main.webp` | `zhu-lingling-reaction.webp` | Character detail; remote portrait at `council` | Voice/remote portrait at `stranger_signal`; no invented live video | Prepared, not generated |
| `future-island` | `duanduo` / 段铎 | `duan-duo-main.webp` | `duan-duo-reaction.webp` | `island_plan` in the pre-disaster shed | `ledger` before return departure | Prepared, not generated; original NPC |
| `future-island` | `wencheng` / 闻澄 | `wen-cheng-main.webp` | `wen-cheng-reaction.webp` | `depot` before disaster; remote portrait at `triage` later | Remote portrait at `evac` or `council` | Prepared, not generated; original NPC |

The baseline graph has scene-level character expressions at the two Fang Nuo
opening nodes. Where a new main/reaction shares a node, the reaction is prepared
for the named beat and the character gallery until a suitable expression cue
exists. Do not imply an unimplemented within-scene transition already works.
Use original world/node IDs and preserve the save-compatible narrative contract.

## Scene And Costume Boundaries

### Blue Blood

- Fang Nuo's notebook belongs to the fixed sprite. Bathroom, seated home or
  transit scenes can need their own pose/prop variant. The existing pair is not
  an automatic full-body illustration of every node.
- Zhang Wei's mug fits `zhang`. Training requires seated/cropped staging. Her
  concern does not establish that she remembers Fang Nuo's original world.
- The observer's still, empty-handed pose fits the public `observer` meeting;
  the paper cup belongs on the table. `diner` concerns
  his disappearance down the alley; do not fill that empty alley with a large
  omnipresent portrait. His employer, powers and motives remain unknown.

### Double Pursuit

- The protagonist is an adult man. Do not reuse the old female tenant design
  or an unapproved youthful corridor face. Li Yu and the online attacker are
  different men; the latter is not an additional authored cast record.
- Li Yu's main/reaction is dialogue art without a visible weapon. A `kitchen`
  or conflict illustration must stage the described danger separately, without
  using the neutral sprite to deny an event in the text.
- `elder` occurs after the older resident locks his door. Use a voice portrait,
  not a person outside it. A visible healthy later portrait is conditional on
  the warning branch; the excerpt's older resident is injured.
- The operator is remote. On-site police and the reception worker are not
  established as that same person. Do not place her beside the tenant in
  `policecheck`, `rescue` or at the evidence table.
- `stairwell` explicitly seats the protagonist behind the door. A face crop
  may use reaction; a full staged illustration requires a seated variant.

### The Smith Couple

- `dinner` is the cramped rental table, noodles, egg and crumpled earnings.
  Retire the old folded-receipt opening. Full scene art needs seated bodies;
  standing sprites can provide dialogue face crops only.
- `club` mentions Mansheng's dress and jewelry. Reserve `du-mansheng-club`, a
  separate wardrobe/pose variant with identical head, hair and ring, charcoal
  high-neck long-sleeved winter dress, opaque gray tights, restrained silver
  jewelry and black coat. This is a future need, not generated art or a new
  main identity. Do not claim the default trousers fulfill that scene.
- `cake` has Wanglu in rider uniform. Reserve `lin-wanglu-rider`, with the
  same face/watch, an ordinary charcoal winter rider jacket, broad wine-red
  functional panel and unlettered cake box. Do not use the default wool coat
  to stand in for the uniform. Invent no real platform logo.
- Cheng Mo physically appears at `invitation`. `family` is private discussion
  with parents; `boundary` is outside after leaving. Do not relocate him just
  to gain a second place for a reaction sprite.
- Keep `wanglu` / 林望鹿 as the character ID/name; the excerpt does not complete
  his legal name. The confidante stays unnamed, without a fabricated family
  connection or conclusively assigned factory ownership.

### Future Island

- `coin` has the three named players at initial selection. A future group
  illustration uses graduated adults. IDs 99/100/101 remain source metadata;
  abilities do not justify uniforms, large magic effects or sexualized posing.
- After `coin`, Cui Yingrui and Zhu Lingling participate remotely. Their
  portraits do not place bodies on the island. `stranger_signal` is a voice
  message and cannot be turned into an asserted live-video feed by the art.
- Duan Duo physically belongs to pre-disaster `island_plan` and `ledger`.
  Later files and old photographs do not establish survival or location. A
  historical portrait is presented through the story's archive framing. NPCs
  receive no player ID badges.
- Wen Cheng is on the island at `depot`, but `storm` explicitly sends her
  request from the mainland. Later logistics/council portraits remain remote.
- Xi Wei's coin-in-hand main fits `coin` after acquisition. `last_decision`
  places the coin beside the keyboard/on the paper; full scene art needs a
  changed prop pose, not an unnoticed second coin in her hand.
- Winter layers follow the requested art direction. The source does not
  establish snow, a northern setting or gothic ruins on the island. Depict
  coastal rain/flood conditions and functional utility equipment coherently.

## Resume Order

After the credit condition is resolved, preserve Fang Nuo and proceed one
accepted identity at a time, deriving its reaction only from that accepted main:

1. Blue Blood: Zhang Wei, then observer. Compare forehead, eye spacing, nose,
   jaw and connected cheek shadows directly against fixed Fang Nuo.
2. Double Pursuit: male protagonist, Li Yu, older resident, operator. Verify
   face separation and the locked-door/remote restrictions before publishing.
3. Smith couple: Mansheng, Wanglu, friend, Cheng Mo. Accept base identities
   before wardrobe/pose variants. The rejected rental image is never a master.
4. Future Island: Xi Wei, Cui Yingrui, Zhu Lingling, Duan Duo, Wen Cheng.
   Inspect a five-person comparison sheet without implying an in-world meeting.

For each result, preserve receipt, actual pixels and provenance; inspect face,
adult anatomy and anchors before any narrow correction. Compare main/reaction,
then alpha cleanup, then accepted WebP publication and current-scene browser
verification. Never blindly resubmit an unknown-outcome request.

The remaining 15 pairs are 30 baseline character images. Additional pose,
costume and scene illustrations are separate work. Those 30 files alone would
not establish correct current-scene art across all 71 nodes.

## Acceptance And Fidelity

Each future acceptance record needs exact world/character ID, source-backed
role, original-design age, at least five fixed anchors and at least three bone
differences from every other cast face. Inspect at native pixels and dialogue
size: nose/cheek geometry, lit eye, line-weight variation, matte grouped hair,
adult lower-face length and opaque skin colors. Confirm readable face placement
clear of text/controls at desktop and mobile viewports.

Reaction must preserve actual eye spacing, nose length, skull/jaw, hairline,
props, seams, frame and light direction. Record only the planned expression
changes. A documentation check does not constitute image or browser acceptance.

| Source Check / Contradiction | Consequence |
| --- | --- |
| Zhang Dongdong explicitly identifies as male in source section 1; old bible said woman. | Corrected to adult man, 26; future art preserves male identity. |
| Police callback has no identified face, sex or age. | Female operator, 35, is original role visualization, always remote, without invented rank. |
| Smith opening is an egg/noodle exchange, not folded receipts. | Old opening staging retired; full table scenes need seated bodies. |
| Club dress and rider uniform conflict with universal trousers/wool coat. | Separate variants specified; no false all-scene coverage claim. |
| Source uses 林望鹿 and nickname 霖哥; full real identity is incomplete. | Keep current name/ID; no invented full Lu-family name or crest. |
| Factory friend and nightclub confidante are not conclusively the same person. | Portrait does not assert factory ownership. |
| Classmates have no numeric source age; two named NPCs are absent. | Keep game adult ages/graduated status and explicit original-NPC labels. |
| Later island contact is remote; archive records do not establish survival. | Maintain mainland/voice/archive framing, not invented co-presence or survival. |
| Zhang Wei ended HTTP 402; observer has no submitted image. | Prepared, not generated; no new provider calls in this pass. |

Local source inputs: `.local/zhihu-cache/story-2025684191967294692.json`,
`.local/zhihu-cache/story-2025333783608537435.json`,
`.local/zhihu-cache/story-2068540656734180439.json`, and
`.local/zhihu-cache/story-1831621186162937856.json`. Their cached `data.content`
was read directly and not modified. Public provenance may include source
attribution and design labels, never credentials, private recovery records or
signed delivery URLs.
