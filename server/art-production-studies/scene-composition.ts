import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { ArtDirectionContext, DelegatedArtDirection } from '../art-production-delegates.ts';
import { vhdReferences, VHD_REFERENCE_DIRECTION } from '../art-production-references.ts';
import { buildFilmDirection } from '../art-production-film.ts';

type Shot = [cast: string[], action: string];
interface WorldSheet { actors: Record<string, string>; shots: Record<string, Shot> }
const ownedWorlds = new Set([
  'velvet-alibi', 'radish-court', 'harvest-box', 'temple-heart', 'tiger-shelter', 'palace-ledger',
]);
async function buildCohortDirection({ root, world, node }: ArtDirectionContext): Promise<DelegatedArtDirection | undefined> {
  // Read current data on every call; the persistent service caches this module.
  const sheet = JSON.parse(await readFile(path.join(root,
    'output/imagegen/scene-production/art-team/scene-composition/v1-selected-20260906',
    `${world.id}-direction.json`), 'utf8')) as WorldSheet;
  const shot = sheet?.shots[node.id];
  if (!sheet || !shot) return undefined;
  const [cast, action] = shot;
  if (!Array.isArray(cast) || new Set(cast).size !== cast.length || !action?.trim()
    || cast.some(id => !sheet.actors[id])) {
    throw new Error(`INVALID_C_SCENE_DIRECTION:${world.id}/${node.id}`);
  }
  const identities = cast.map(id => sheet.actors[id]).join('');
  return {
    references: [], prompt: `${identities}${action}吸血鬼猎人D画风。`,
  };
}

/** Artist C: individually staged cuts; all other nodes retain the shared fallback. */
export async function buildArtDirection({ root, world, node }: ArtDirectionContext): Promise<DelegatedArtDirection | undefined> {
  const film = await buildFilmDirection({ root, world, node }, 'scene-composition');
  if (film) return film;
  if (world.id === 'temple-heart' && node.id === 'b_kitchen') {
    const frozen = JSON.parse(await readFile(path.join(root,
      'output/imagegen/scene-production/art-team/scene-composition/named-style-20260906/frozen-unknown-directions.json'), 'utf8'));
    return frozen['temple-heart/b_kitchen'];
  }
  if (world.id === 'palace-ledger' && node.id === 'b_old_ledger') {
    const first = JSON.parse(await readFile(path.join(root,
      'output/imagegen/scene-production/art-team/scene-composition/v1-selected-20260906/first-direction.json'), 'utf8'));
    if (first.worldId !== world.id || first.nodeId !== node.id || first.references.length !== 0) {
      throw new Error('INVALID_C_V1_FIRST_DIRECTION');
    }
    return { prompt: first.prompt, references: [] };
  }
  if (world.id === 'velvet-alibi' && node.id === 'dinner') {
    const frozen = JSON.parse(await readFile(path.join(root,
      'output/imagegen/scene-production/art-team/scene-composition/calibrated-20260906/frozen-dinner-direction.json'), 'utf8'));
    return { prompt: frozen.prompt, references: vhdReferences(root), quality: frozen.quality, pixelSize: frozen.pixelSize };
  }
  // Submitted literal studies below remain history; current cuts use the user-selected V1 format.
  if (ownedWorlds.has(world.id)) {
    return buildCohortDirection({ root, world, node });
  }
  if (world.id === 'harvest-box' && node.id === 'mill_wheel') {
    return {
      quality: 'high',
      references: vhdReferences(root),
      prompt: `${VHD_REFERENCE_DIRECTION}

An original scene from the authored Chinese rural-fantasy story: Chen, the 27-year-old owner of a small farm, and Shen Xiong, the silver-haired adult man she found in a box, inspect an abandoned riverside grain mill. The waterwheel is caught on one old timber. Shen has put aside brute force and is pulling the timber free with an ordinary iron hook while Chen points out the vulnerable axle behind it. Exactly these two people; the practical repair, their hands and their faces are the subject.

CORRECTION C1: a newly drawn complete composition using only the three original film-frame references. Full working two-shot from the grassy riverbank, with both adults' complete bodies and every shoe inside the frame. Chen occupies the left third and Shen the center, while the wooden wheel fills the right middle ground. Their grounded stances occupy separate lanes: Chen's two brown cloth shoes stay fully to the left of Shen's two black shoes, with a clear patch of grass between the nearest shoes. Both pairs have visible soles, supported heels and coherent contact shadows; neither person steps on the other's foot. Avoid tangencies between legs, hems, post and shoes. Leave useful grass below their soles rather than cropping the feet.

Chen rests her left hand on a sound post and points her right index finger toward the exposed vulnerable wooden axle, visible above the wedged timber. Make the line from fingertip to axle legible through open background, rather than aim at the low log or tool. Shen grips the ordinary iron hook's long shaft at two separated places, his nearer hand around the middle and rear hand near the butt, with bent elbows protecting his injured chest. The J-shaped iron end passes beyond the timber's far edge and curls visibly under it; show a short dark contact edge where the hook bites the wood, not a hook tip floating against its face. Its shaft leads continuously back to both grips. Shen draws it toward his own stance as the timber begins to shift. Distinguish this low hook/log contact from the higher axle Chen indicates. Faces, wrists and tool joints remain unobstructed; favor useful head size within this complete-body layout.

Chen: warm sun-browned skin, practical strong forearms with an old healed scar, medium-high broad forehead, level brows, slightly wide-set narrow eyes with small irises, compact straight nose with a broad drawn underside, angular cheek turn and short rounded-square chin. Black hair in a low working bun. Roomy charcoal cross-collar farm clothes with a muted wine-red waist sash and tied sleeves; plain brown cloth shoes. Her alert glance follows her pointing finger to the axle, and her mouth is making one brief instruction. Mature economical eye construction: firm tapered upper lid, a short selected lower-lid mark and restrained small iris. The speaking mouth is a simple broken ink edge and flat interior, without a plump outlined lower lip, gloss or softly blended cheek.
Shen: adult appearance about 30, source-supported exceptional height and broad shoulders, credible working anatomy. Silver hair resolves into six to eight primary interlocking matte masses, with only a few selective overlap lines and one flat cool shadow color. Leave broad clean interiors; no comb-like parallel strands, repeated thin light ribbons or gradients. Long narrow forehead, heavy low brows, deep-set restrained eyes, long straight constructed nose, high cheekbones, wide angular jaw and flat-ended chin. His pale skin and longer skull differ from Chen's compact warm face. Borrowed charcoal period clothes sit tight across his shoulders, with a modest deep-red inner layer and plain black shoes. His old chest injury is covered here; the careful bent elbows show that he has accepted a lighter repair task. His mouth is compressed with concentration, not a glamour pose.

Clear afternoon side light from upper left. Preserve the working large facial planes: a substantial continuous cool hard shadow through the far brow/socket, nose-side and cheek turn into the jaw/neck, shaped differently by each head's angle. Skin and cloth remain smooth, closed, opaque paint. Every large cloth base is a spatially constant single color, including Chen's skirt and Shen's chest, thighs and trouser legs; every main shadow is a second constant flat color bounded by a drawn hard edge. Broad fold shadows turn at the sash, knee, compressed elbow and shoulder, without a brightness ramp inside either swatch. No airbrushed modeling or atmospheric wash across the figures. Large near-black clothes retain selected blue-gray hard fold planes while skin and silver hair remain clearly separate local colors.

Paint the old Chinese timber mill, worn axle, iron hook, river stones and green riverbank in broad gouache brushwork on paper. Light green grass, clear blue-green water and cooler distant trees form three readable depth planes. The saturated daylight landscape stays bright while the dark figures read firmly against it. The scene is a working rural mill, with quiet bank and shoe shapes along the lower edge. Entirely new source-specific staging.

Current source node: ${JSON.stringify({ id: node.id, title: node.title, location: node.location, text: node.text })}`,
    };
  }
  if (world.id === 'palace-ledger' && node.id === 'arrival') {
    return {
      quality: 'high',
      references: [
        path.join(root, 'docs/references/user-character-face.png'),
        path.join(root, 'docs/references/user-anime-reference.png'),
        path.join(root, 'output/imagegen/scene-production/references/user-living-light-20260906.png'),
        path.join(root, 'output/imagegen/scene-production/references/user-kitchen-light-20260906.png'),
      ],
      prompt: `One original full narrative animation cut, landscape 16:9, genuinely native 4K output with fine authored drawing at delivery resolution. C3 / PALACE LEDGER / ARRIVAL. No text, panels, border, watermark or interface.

THE ACTUAL SCENE
An ancient Chinese palace bedchamber. Zhu Yurun, an ADULT empress, stops giving away her family's money. Her adult maid Xiaoying has halted before the seated elderly Empress Dowager; the older senior attendant stands beside the Dowager. Exactly FOUR women, no emperor or romantic partner. Depict the instant AFTER Yurun has put all the banknotes back inside her own sleeve and closed the gift box. The banknotes are now out of sight. Xiaoying still supports the single closed box; Yurun's firm palm remains on its lid. The Dowager is demanding more, and the senior attendant fixes Xiaoying with a pointed look. This is quiet, unequal social pressure and a practical refusal to surrender money, not a shouting caricature or ceremonial gift successfully delivered.

INDEPENDENT LAYOUT AND ACTING
Camera at standing chest height, medium-wide asymmetric four-person cut. Yurun in the foreground left-center, three-quarter view facing right but torso beginning to turn away; Xiaoying beside her at center, half a step nearer the daybed. Dowager seated farther right on a low Chinese wooden daybed, senior attendant standing behind its right arm. Keep all four complete faces clearly separated against simpler background fields: Yurun's head about 20 percent of frame height, Xiaoying's 18 percent, both older women's at least 14 percent. Show Yurun and Xiaoying down to their knees, the seated Dowager's whole clothed silhouette, and the senior attendant's upper body. No face blocked by another head, box, hand or ornament.
The closed rectangular cloth-covered gift box is horizontal at Xiaoying's waist. Her two hands support its left and right underside, fingers visibly curling around separate bottom edges. Yurun's RIGHT forearm reaches from her right shoulder in one clear bent chain; her right palm presses lightly on the TOP of the lid, all fingers pointing toward the far lid edge, anatomically separate from Xiaoying's hands. Yurun's LEFT hand holds her own right cuff close to her torso, where she has secured the banknotes. No exposed money, duplicate box, passing coins or mysterious extra hands. Yurun looks directly at the Dowager with a small level speaking mouth, neither coy nor triumphant. Xiaoying turns her eyes toward Yurun, mouth stopped mid-breath, adult narrow lids rather than round shocked eyes. Dowager leans on one forearm and lifts her chin; her other hand rests on the daybed arm. Senior attendant keeps her hands clasped and eyes on Xiaoying. All feet are clothed or below the frame; no massage or unrelated source incident.

FOUR DIFFERENT ADULT SKULLS AND BODIES
Yurun: source-supported genuinely fat, broad, substantial adult body, full upper arms, thick torso and broad hips; do not slim her waist or idealize her into a slender heroine. Production age design: early thirties. Broad medium-height forehead, low straight heavy brows, small narrow eyes with small dark irises, a short strong nose with a wide clearly drawn underside, broad cheek structure under full cheeks, wide rounded-square lower jaw and broad blunt chin. The bony nose, cheek turn and jaw must still be constructed beneath facial fullness, not an undifferentiated circular baby face. Medium warm skin. Black hair in a low wide gathered coil with one simple old-silver pin. Roomy opaque charcoal cross-collar palace robe, substantial wine-red inner facing and sash, small cool off-white undercollar. No beauty blush, exaggerated comic teeth or ornamental crown.
Xiaoying: production age design mid-twenties, average build, visibly narrower shoulders than Yurun. Low narrow forehead, straight modest brows, slightly wider eye spacing, short straight slender nose, high cheek turn, oval lower face with a short flat-ended chin. Medium-light warm skin distinct from Yurun. Black center-parted hair in a compact rear coil with two broad side masses; plain muted wine-red servant jacket over a charcoal skirt, cool gray collar. Her small eyelid opening and drawn nose underside must read adult, not a doll.
Dowager: production age design sixties, long high forehead, a longer gently hooked nose, narrow deep-set eyes, pronounced cheekbones, longer angular jaw and narrow level chin. Spare mature facial lines follow lower lids, cheek crease and mouth corner, without all-over crosshatching. Lighter warm-gray skin. Gray-black hair in a low formal knot, two restrained silver fasteners. Charcoal robe with broad deep oxblood lapel and cuff, no glowing jewelry. Her face is neither Yurun's broad short skull nor Xiaoying's compact oval.
Senior attendant: production age design fifties, broad low forehead, heavy angled brows, broad straight nose with a flatter tip, widely set eyes, short square jaw and a receding small chin; weathered adult lower lids and compressed lips. Darker muted skin than the Dowager. Tight black-gray hair coil; plain black-brown outer robe, narrow dark-red waist strip, gray collar. She is solid and upright, not a grotesque villain. These precise age, hair and costume choices are original production designs, not claims that the source gives exact ages.

DRAWING AND COLOR SEPARATIONS
Use Vampire Hunter D: Bloodlust-era mature drawing discipline: constructed skulls, restrained narrow eyelids/small irises, explicit nose bridges and undersides, sharp cheek and jaw turns, tapered brown-black or red-black douga contours. Transfer the DRAWING language, not film characters, a pale pointed beauty face, gothic costumes or elongated fashion-model bodies. Reference 1 controls facial construction and cleanup, never cast identity. Outer silhouette line is weighty and pressure-varied, internal structure medium, nostril/ear/mouth marks very fine. Hair uses five to seven broad interlocking ink groups, solid paint with only overlap lines; NO parallel shiny hair strands or glossy highlight bands.
MANDATORY LARGE FACE SHADOWS: every visible face uses one closed opaque base and one solid, connected shadow shape covering approximately one third of the visible face. Start inside the far brow/socket; physically CONNECT it down the side of the nose, across the far cheek plane, around the jaw and into the neck. An angular hard boundary divides the two perfectly flat paint colors. Keep the near eye and nose bridge lit and readable. Little isolated nose marks, under-chin shading, or a mostly unshadowed face are not this drawing. Full cheeks still have a coherent side plane. At most one tiny overlap level. Hands and each clothing material follow the same base-plus-connected-hard-shadow rule. Absolutely no skin gradients, airbrush, shiny skin, blush, textured lips or soft reflected-light modeling. Characters have CLOSED SMOOTH OPAQUE CEL PAINT: no paper texture on skin, clothing or hair, no woven fabric, crosshatch or mottled brush marks. Folds explain sleeve tension, the box-bearing elbows and seated robe weight; they are not decorative all-over stripes.

PAINTED SET AND PHOTOGRAPHED COMPOSITE
Paint a source-specific Chinese palace interior, not a gothic hall or transplanted rental kitchen. Gray-white plaster, old red-brown structural posts, restrained lattice windows on upper left, a dark wooden daybed at right with dull red cushion, a folding screen behind it, and a gray stone or wood floor. Clear perspective and convincing contact shadows at the box, daybed, feet and table legs; no floating furnishings. Architecture and furniture alone show paper-painted gouache/poster-color brushwork and selective aged surface detail. References 2-4 inform this background craft and light/material separation only. No modern appliances, cathedral arches, railway objects or copied reference room.
Motivated late-afternoon window light from upper camera-left creates warm flat character bases and large cooler hard shadows on far planes; sky-lit recesses stay gray-blue. Preserve readable charcoal, wine-red, off-white, skin tones and the cool window field. Strong structured shadows do not mean underexposure or a blanket brown grade. No bloom, bokeh, global grain, canvas overlay or digital beauty light. Leave the lowest band quieter with floor and simple hems, never a black vignette. The image should read as hand-cleaned opaque character cels photographed over a separately painted room, with weight, acting and an unmistakably withheld gift.

Current authored node data, for story facts only, never render these words: ${JSON.stringify({ id: node.id, title: node.title, location: node.location, time: node.time, text: node.text })}`,
    };
  }
  if (world.id === 'radish-court' && node.id === 'arrival') {
    return {
      quality: 'high',
      references: [
        path.join(root, 'docs/references/user-character-face.png'),
        path.join(root, 'docs/references/user-anime-reference.png'),
        path.join(root, 'output/imagegen/scene-production/references/user-living-light-20260906.png'),
        path.join(root, 'output/imagegen/scene-production/references/user-kitchen-light-20260906.png'),
      ],
      prompt: `An original widescreen animation scene in an old Chinese palace courtyard on Xie Mingzhu's first afternoon there. Exactly three adults: Mingzhu, a woman of 24; Fushun, a male attendant of 32; Qingxing, a woman attendant of 26. Mingzhu has put her radish seed packet on a small stone table and is deciding to clear the entrance path. She is quietly pleased with the space; her attendants are still apprehensive.

Standing-eye-height medium-wide composition, figures shown to below the knees. Mingzhu stands center-left, a step forward, looking toward the overgrown path at camera-right. Her head occupies one fifth of the image height. Her RIGHT hand grips and rolls her LEFT sleeve above the elbow, with clear thumb, fingers, wrist and cloth contact. Her broad stance is planted and her mouth slightly open in matter-of-fact speech. Fushun stands behind-left with lowered head and hands clasped at his waist, resting a little less weight on his left leg. Qingxing stands at the right gate leaf, one hand on its edge, asking where to begin. Their faces and hands remain spatially separate. One folded plain paper seed packet rests on the foreground stone table.

Mingzhu has genuinely dark warm-brown skin, broad shoulders, thick strong forearms, substantial torso and hips, and sturdy legs. Her broad low forehead, straight heavy brows, narrow eyes with small irises, broad cheek planes, strong medium-length straight nose and wide square-blunt jaw form a distinctive adult face. Black hair is gathered in a compact high coil with a plain pin. Her roomy charcoal cross-collar robe has broad wine-red facing and sash, a small cool off-white collar and a partly rolled left sleeve.
Fushun is lean with ordinary adult proportions: a high narrow forehead, long gently convex nose, deep-set narrow eyes, oblong jaw with rounded corners and a narrow level chin. He wears a plain black-gray robe with a dark-red collar edge and a simple soft black cap.
Qingxing has a low narrow forehead, wider eye spacing, short straight slender nose, high cheek turn, oval jaw and short blunt chin. Her warm skin is lighter than Mingzhu's. Black hair is gathered low; a muted wine-red servant jacket sits over a charcoal skirt. Her restrained adult lids and interrupted mouth carry her apprehension.

Draw these original people with Vampire Hunter D-era mature anatomy and tapered brown-black douga linework: weighted outer contours, economical structural lines, fine nostril and mouth marks, clearly drawn nose undersides and cheek/jaw turns. Hair consists of five to seven solid interlocking masses. Skin and costumes are smooth opaque cel paint. Each face has a large CONNECTED hard-edged shadow covering about one third of its visible area: far brow and socket connect down the nose side, across the far cheek and around the jaw into the neck. Keep the nearer eye and nose bridge lit. Base and shadow are two perfectly flat paint colors. Hands and clothing use the same closed flat color separation. Folds explain the sleeve grip, elbows and sash tension.

Behind the cels, a separate paper-painted gouache background: an open weathered vermilion wooden gate, clear traditional joinery, peeling gray-white plaster, dull exposed bricks, low tiled eaves and tall gray-green weeds flanking a narrow flagstone path. Sparse paper brushwork belongs to architecture, stone and vegetation. Upper-left afternoon sunlight gives the characters readable warm planes and hard cooler shadows; the gate recess receives blue-gray sky light. Keep charcoal, wine-red, brown skin, gray plaster and green weeds distinct. Finish as opaque animation cels photographed over painted paper, with quiet paving and hems along the lower edge. A complete unlettered 16:9 scene at native 4K.`,
    };
  }
  if (world.id !== 'velvet-alibi' || node.id !== 'dinner') return undefined;

  return {
    pixelSize: '4096x2304',
    references: [
      path.join(root, 'docs/references/user-character-face.png'),
      path.join(root, 'output/imagegen/scene-production/references/user-kitchen-light-20260906.png'),
      path.join(root, 'output/imagegen/scene-production/references/user-living-light-20260906.png'),
      path.join(root, 'docs/references/user-anime-reference.png'),
    ],
    prompt: `Use case: illustration-story. One complete original narrative animation cut, landscape 16:9, native 4096 x 2304 pixels. No writing, panels, frame, logo or interface.

REVISION C2: REPAINT CHARACTER COLOR SEPARATIONS, NOT A SOFT SHADED ILLUSTRATION
This is a new drawing from the original four reference inputs, never from a prior scene. The controlling production correction is to paint BOTH faces and every jacket as smooth solid cel paint. For each visible face, cover roughly one third of the camera-near cheek with ONE unbroken muted clay shadow patch: its top encloses the outer eye socket, its inner boundary runs down the side of the nose, turns sharply across the cheek plane, then joins the jaw-to-neck shadow. This substantial opaque region must be visibly different from the light skin color at thumbnail size. Leave a clean narrow light plane on the nose bridge and a readable lit sclera. The cheek's shadow boundary is a hand-drawn angular edge. There is NO gradient anywhere within the skin base or shadow. Neck-only shading and little nose marks on an otherwise uniform face do not fulfill this drawing. Skin paint has exactly two flat swatches, with one optional tiny overlap beneath the chin. For both coats use a lighter readable solid charcoal base and one near-black closed shadow shape, absolutely no crosshatch, woven texture, paper grain, mottling or individual fibers. Hair consists of broad solid black groups without stroke-filled shine. Woman's eyes are low horizontal adult almond shapes, upper-to-lower-lid opening reduced and irises small with visible sclera, not big round surprised doll eyes. Preserve her high cheekbone and compact blunt adult chin. On the man's reaching hand, separate thumb, index, middle and the two curled supporting fingers; the two chopstick TIPS grip opposite outer sides of the egg white, never both touching the center of its yolk. His watch remains on his NON-REACHING left wrist. Keep exactly two egg halves and the same man-to-woman action.

DIRECT THE SHOT, NOT A BEAUTY PORTRAIT
An ordinary cramped Chinese rental supper at 20:40. Two adults, Lin Wanglu (man, 27) and Du Mansheng (woman, 25). He gives HER half of their SINGLE soft-boiled egg. This is a small practical action over cooled tangled noodles, not a romantic advertising pose. Photograph the impression of opaque, hand-inked late-1990s commercial-animation cels registered over a paper-painted interior. Start with human pencil layout and physical acting, not a digital painting subsequently darkened.

LAYOUT AND ACTION
Camera from the open side of a 70cm square battered laminate table, seated eye height with a slight downward view sufficient to read both bowl interiors. A natural medium-wide two-shot: man on image LEFT, woman on image RIGHT, both seated on plain stools and seen three-quarter, from head to upper thighs. Their heads each occupy about 19 percent of picture height. Close practical shoulder-to-table distance, shoulders relaxed, elbows bent at credible joints; the man's torso is compact and his sturdy neck emerges naturally from his collar. The table's front edge runs diagonally, rather than a symmetrical date-night composition. Both faces, the man's entire reaching arm and both bowls remain unobstructed. Keep the bottom 15 percent visually quiet: table apron and restrained trouser shapes, not a black vignette.

THE EGG INVENTORY IS EXACTLY TWO HALVES TOTAL
Half A remains cut-side up in the man's LEFT-side bowl of noodles. Half B, the other half of that SAME egg, is visibly pinched between the two tips of a single pair of wooden chopsticks held by the MAN'S RIGHT HAND, suspended just above the woman's RIGHT-side bowl. Half B shows its intact yellow-orange yolk. Her bowl contains noodles only until he places half B; there is NO egg already in her bowl. Exactly two white egg-half silhouettes and exactly two yolk centers across the entire picture. No plate of eggs, third half, duplicate floating food or yellow food garnish.
Trace the transfer clearly from the man's right shoulder through his bent elbow, wrist, fingers and two chopsticks to half B above her bowl. His left hand steadies his OWN bowl. He looks down at the placement, mouth making a small matter-of-fact speaking shape. She is receiving, never feeding him: one hand rests against her bowl's outer rim; her other rests beside a small crumpled bundle of ordinary banknotes on her side of the table. Her own chopsticks lie unused on the table to her right. She watches his practical generosity with a stopped, slightly uneven mouth and held breath; no blush or adoring big eyes. No simultaneous cash handover, embrace or tears. The money is secondary and unlettered.

TWO DISTINCT ADULT SKELETONS
Wanglu: high BROAD rounded exposed forehead; short dark hair swept back in seven angular masses, slight right-temple break; thick level brows with a small upward outer finish; narrow deep-set eyes at normal spacing, small flat irises, firm lower lids. Long subtly convex narrow nose, firm central cheek planes, visibly SQUARE jaw corners and a medium-broad LEVEL chin. Broad enough lower skull to avoid a tapered model face. Credible adult neck and shoulders, not elongated fashion anatomy. Matte charcoal jacket drawn as solid opaque CEL PAINT, compact folded collar, black high-neck layer, narrow oxblood inner collar seam, straight charcoal trousers; restrained square silver watch on NON-REACHING left wrist. No jacket zipper, visible wool fibers or textile crosshatch; quiet simple folded-collar structure.
Mansheng: LOW NARROW forehead; long black hair gathered at the nape in five overlapping masses, two tapered face-framing locks; precise shallow-arch brows; standard-spaced LOW HORIZONTAL almond eyes with modestly raised outer lids and small dark-brown irises; adult firm lower eyelids, no round doll eyes. COMPACT straight nose with slender base and drawn nostril plane, defined HIGH upper cheek turn, TAPERED OVAL jaw and small BLUNT adult chin. Not a reduced copy of his square face. Black waist-length wrap coat, fully tucked crimson scarf, charcoal straight trousers, thin old-silver ring. Plain black bag tucked beside her stool. Their forehead height, nose length and lower-jaw width differ visibly, independent of hair and lighting.

SEPARATE INK, CEL PAINT, AND BACKGROUND PAINT
Character drawing follows reference 1's structural nose, restrained eyelids, contour economy and substantial matte hair, not its identity or hairstyle. Heavy pressure-varied brown-black outer contour; medium joint/cloth/cheek structure lines; very fine nostril, ear and mouth lines. Closed large opaque skin and clothing flats. Each material has ONE connected hard-edged main shadow, with at most one small overlap shadow. Face base swatch is plain light peach; main shadow is flat cool clay, a substantial connected brow/socket-to-nose-side-to-cheek-turn shape joining the jaw/neck cast shadow, covering one third of the visible face while retaining a readable lit eye and sclera. No gradients, sprayed blush, pore texture, lustrous lips, skin rim glow, or soft modeled noses. Hair reads as solid ink masses with a few overlap lines, no silver glossy bands or rows of tiny highlight strokes. Clothing folds originate at seams and compressed elbows; no evenly spaced decorative wrinkles. Only a pinprick eye highlight and a tiny hard watch edge may shine. Skin, hair and fabric remain SMOOTH OPAQUE CELS without paper grain, woven cloth or canvas texture. Make smooth face/jacket paint plainly contrast with the background's paper brushwork.

The background is a separately made poster-color/gouache painting on paper. Translate references 2 and 3's believable joinery, chipped tile, aged wood, cool opening versus local lamp into a SMALL inexpensive rental: low ceiling, an aluminum-framed window on back left, blue-gray close neighboring apartments at night, one short counter and old white sink immediately behind the table, exposed ordinary pipe, mismatched off-white tiles, worn muted gray-green cupboard door, one hanging towel, kettle and stacked everyday crockery. Tight clear perspective, objects meet their supporting surfaces, modest lived-in density, no lavish library or giant antique kitchen. Reference 4 contributes disciplined layering and architectural drawing only; no gothic station, costumes, cathedral or red rain.

COLOR COMPOSITE
The cool window establishes a muted blue-gray background field and a discrete cool lit plane on the man's window-facing side. One small warm utilitarian pendant above the table motivates the warm flat faces, bowls and table patch. Shadow boundaries on characters are actual drawn edges, not global dimming. Keep ceramic off-white, cupboard muted gray-green, cool window blue, scarf crimson and jackets charcoal clearly separate. Paper brushwork belongs only to architecture and furniture, never character faces. Avoid blanket brown grading, overall underexposure, volumetric glow, shallow-focus bokeh, CG material rendering and modern glossy romance-comic faces. The result should first read as a workaday animated story moment whose tiny egg-sharing gesture matters, not a polished couple illustration.

Current authored node data, for factual grounding only (do not render any text): ${JSON.stringify({ id: node.id, title: node.title, location: node.location, time: node.time, text: node.text })}`,
  };
}
