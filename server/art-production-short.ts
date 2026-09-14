import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ArtJob, ArtJobKind, ArtWorldInput } from '../shared/production.ts';
import type { SceneNode } from '../shared/types.ts';
import { ART_WORLD_OWNERS } from './art-production-delegates.ts';
import { readArtSourceBook } from './art-production-books.ts';
import { canonical, sha256, type SceneBrief } from './art-production-prompts.ts';

export const SHORT_PROFILE = 'formal-production-20260907';
export const SHORT_FOLDER = `output/imagegen/scene-production/${SHORT_PROFILE}`;
export const SHORT_REPAIR_FILE = `${SHORT_FOLDER}/review-repairs.json`;
export const SHORT_STYLE_REVISION = 'style-first-20260907';
// Bounded visual diagnostics. These revisions address observed identity failures
// without replacing the owner books or changing unrelated assets.
const SHORT_PROMPT_OVERRIDES: Record<string, string> = {
  'blue-blood/__art_character_zhangwei':
    '吸血鬼猎人D画风，当代中国，张薇女28，栗黑内弯齐颌发、宽眼距短鼻五角颌，黑夹克酒红针织，灰底半身像。',
  'online-heir/__art_character_fuyan':
    '吸血鬼猎人D画风，当代中国，傅琰男28，右分黑背发、深眼凸鼻宽方颌，黑夹克酒红针织银表，灰底半身像。',
  'double-pursuit/__art_character_elder':
    '吸血鬼猎人D画风，动画截图平涂硬边，老住户男68，秃额铁灰疏发、垂眼宽鼻圆方颌，黑棉衣酒红开衫，灰底半身像。',
  'velvet-alibi/__art_character_friend':
    '吸血鬼猎人D画风，动画截图平涂硬边，闺蜜女26，栗黑短发露一耳、宽颧菱形颌短凸鼻，黑外套酒红针织，灰底半身像。',
  'rotten-pilgrimage/__art_character_false_guanyin':
    '吸血鬼猎人D画风，动画截图平涂硬边，假观音女38，细长脸、半闭细眼、偏侧微笑，象牙白头巾长袍，无光环，灰底半身像。',
  'ming-whisper/__art_character_father':
    '吸血鬼猎人D画风，中国明代周父男59，秃鬓方脸、短灰胡须，贴头黑布小帽、炭褐交领长袍红腰带铁钥匙，灰底半身像。',
  'ming-whisper/__art_character_wang':
    '吸血鬼猎人D画风，动画截图平涂硬边，明代王承恩男54，瘦长净面、细眼角纹，高软黑帽灰蓝袍黑领红腰带，灰底半身像。',
  'six-roots/__art_character_su':
    '吸血鬼猎人D画风，动画截图平涂硬边，苏砚青男24，宽颧短五角颌、乱黑发小高束、左眉缺口，炭黑交领短袍暗红腰带，灰底半身像。',
  'online-heir/__art_character_jiran':
    '吸血鬼猎人D画风，季然，女26，长黑低马尾宽鬓束细眼短直鼻高颊钝椭圆颌，黑夹克酒红领。灰底腰上像，完整头顶留白。',
  'radish-court/__art_character_xiao':
    '吸血鬼猎人D画风，动画赛璐珞平涂，萧寻男28，高圆额长椭圆颌桃花眼细鼻，黑发束冠，明黄交领常服。灰底腰上像，发冠完整留白。',
  'palace-ledger/__art_character_dowager':
    '吸血鬼猎人D画风，太后，年老女性，长脸、窄颊、额纹、灰黑盘发，墨青中国古代宫装。灰底腰上像，完整盘发留白。',
  // Each correction is pinned to a rejected original and its observations in
  // formal-production-20260907/correction-batch-20260910.json; no global revision bump.
  'palace-ledger/__art_character_empress':
    '吸血鬼猎人D画风，动画赛璐珞平涂，朱玉润成年女，肥胖圆阔脸双下巴小眼睛，黑发高盘，暗红黑中国古代宫装，灰底腰上像，头顶留白。',
  'black-flood/__art_character_black':
    '吸血鬼猎人D画风，动画赛璐珞块面，黑蛟成年小型蛟，短后掠角琥珀眼，炭黑大鳞块，宽大分叉灰蓝尾鳍，灰底单只完整侧身。',
  'tiger-shelter/__art_character_junzhouH':
    '吸血鬼猎人D画风，动画赛璐珞平涂，君洲成年男虎妖人形，宽肩方脸金眼黑短发虎耳虎尾，墨青中国古代短衣，灰底腰上像，头顶留白。',
  'six-roots/__art_character_senior':
    '吸血鬼猎人D画风，大师兄男34，厚方脸宽圆下巴、五组钝厚黑短发，粗前臂，灰交领工作袍黑马甲锈红腰带，中国修仙宗门，灰底腰上像头顶留白。',
  'six-roots/__art_character_sister':
    '吸血鬼猎人D画风，二师姐女29，高颧长方颌平下巴，细长眼小灰褐虹膜，紧凑黑高髻小铁簪，炭蓝交领袍酒红内袖，灰底腰上像完整发髻留白。',
  'black-flood/__art_character_fang':
    '吸血鬼猎人D画风，动画赛璐珞平涂，方霓笙女22，窄椭圆脸长圆下巴，细长眼小棕虹膜，黑发半束两侧长发，浅蓝交领袍黑袖口酒红腰带，灰底头顶留白。',
  'black-flood/__art_character_qing':
    '吸血鬼猎人D画风，动画赛璐珞块面，青鸾成年神鸟，窄鸟首短冠琥珀眼，蓝绿大羽块，两根象牙尖深青长尾羽，灰底单只完整侧身。',
  'tiger-shelter/__art_character_junchaoH':
    '吸血鬼猎人D画风，动画赛璐珞平涂，君潮成年女虎妖人形，结实体格短脸金眼，黑发束起虎耳虎尾，灰绿中国古代短衣，灰底腰上像头顶留白。',
  'harvest-box/__art_character_white_woman':
    '吸血鬼猎人D画风，动画赛璐珞平涂，白衣女子29，高颧近距挑眼细短鼻菱形颌，黑长发高束银簪，纯白宽袖交领衣，灰底腰上像头顶留白。',
  'tiger-shelter/__art_character_junchaoT':
    '吸血鬼猎人D画风，动画赛璐珞块面，君潮成年雌虎妖，四足结实短口鼻金眼黄褐毛块，肩部黑条纹断开，灰底单只完整侧身。',
  'six-roots/__art_character_steward':
    '吸血鬼猎人D画风，守铃执事男38，宽六角颌净面凹下巴短宽间距棕眼，贴头小黑布帽，炭黑中国官衣暗红边灰腰带，手持小铜铃，灰底腰上像帽顶留白。',
  'future-island/__art_character_wencheng':
    '吸血鬼猎人D画风，动画赛璐珞平涂，闻澄女36，高颧长方下巴细长眼灰黑低髻，黑工作衫灰肩片暗红高领，近未来中国职业衣装，灰底腰上像头顶留白。',
  'tiger-shelter/__art_character_wolf':
    '吸血鬼猎人D画风，动画赛璐珞块面，头狼成年灰狼妖，四足灰毛块长口鼻三角耳低垂粗尾，灰底单只完整侧身。',
  'tiger-shelter/__art_character_leader':
    '吸血鬼猎人D画风，动画赛璐珞平涂，封山领队成年男，宽长脸厚眉短黑发束冠，灰白中国古代捉妖服，灰底腰上像完整发冠留白。',
  'double-pursuit/__art_character_attacker':
    '吸血鬼猎人D画风，动画赛璐珞平涂，当代中国追逐者成年男，短乱发宽肩，深色普通短外套，灰底腰上像头顶留白。',
  'future-island/__art_character_cuiyingrui':
    '吸血鬼猎人D画风，动画赛璐珞平涂，崔英睿男29，高额长五角脸钝下巴，后梳黑短发，黑双排扣短外套银腕表，近未来中国，灰底腰上像头顶留白。',
  'future-island/__art_character_zhulingling':
    '吸血鬼猎人D画风，动画赛璐珞平涂，朱玲玲女28，宽椭圆脸细长眼小棕虹膜，齐肩灰黑发左侧别耳，炭黑外套暗红斜围巾，近未来中国，灰底头顶留白。',
  'rotten-pilgrimage/__art_character_wukong':
    '吸血鬼猎人D画风，动画赛璐珞块面，悟空成年男猴形行者，五簇赭色冠毛琥珀眼，瘦韧长臂，炭黑短旅衣暗红腰布，灰底腰上像冠毛完整留白。',
  'tiger-shelter/__art_character_junzhouT':
    '吸血鬼猎人D画风，动画赛璐珞块面，君洲成年雄虎妖，高大四足金眼宽额厚口鼻黄褐毛块清楚黑纹，灰底单只完整侧身。',
  'tiger-shelter/__art_character_oldwolf':
    '吸血鬼猎人D画风，动画赛璐珞块面，老狼一只年老母狼，四足瘦长灰狼身灰白口鼻塌肩钝耳尖，灰底单只完整侧身。',
};
// Explicit role labels follow the exact submitted reference-image order.
// Only the never-submitted wave-41 briefs are changed; other asset revisions remain visible.
const SHORT_SCENE_PROMPT_OVERRIDES: Record<string, string> = {
  "black-flood/fang_request": "吸血鬼猎人D画风，中国仙侠。单幅场景，旧院门口，参考图2方霓笙提空篮递药单，参考图1洛长缨低头先看自己划去的项目，参考图3人形黑蛟倚门不言。",
  "black-flood/arena_newclass": "吸血鬼猎人D画风，中国仙侠。单幅场景，修复练习台边，参考图2执事递课表，参考图1洛长缨停笔，参考图3方霓笙在低阶问重学，参考图4人形黑蛟抱绷带坐泉边。",
  "black-flood/ending_teacher": "吸血鬼猎人D画风，中国仙侠。单幅场景，基础课练习台，参考图1洛长缨指参考图2方霓笙放低木剑踩稳格线，参考图3人形黑蛟在第一排按住翻飞课页。",
  "tiger-shelter/__art_reaction_junzhouT": "吸血鬼猎人D画风，同参考图的成年虎形，警觉神态，灰底单只完整四足。",
  "tiger-shelter/__art_reaction_junchaoT": "吸血鬼猎人D画风，同参考图的成年虎形，警觉神态，灰底单只完整四足。",
  "tiger-shelter/border": "吸血鬼猎人D画风，中国古代。单幅场景，雨后洞外石地，参考图1小橘低头看泥地到石面消失的靴印，参考图2君洲人形在旁指向林边。",
  "tiger-shelter/return_path": "吸血鬼猎人D画风，中国古代。单幅场景，湿林岔口，参考图2君洲人形挡在参考图1小橘前露牙，参考图3白袍青年从树后走出，参考图1小橘缩到腿后。",
  "tiger-shelter/terms": "吸血鬼猎人D画风，中国古代。单幅场景，山道对谈此刻，参考图2君洲人形横尾到参考图1小橘脚边，参考图3白袍青年催上路，参考图1小橘看岩边窄缝。",
  "tiger-shelter/proof": "吸血鬼猎人D画风，中国古代。单幅场景，山道临时谈判处，参考图1小橘抬前爪打断参考图2白袍青年，参考图3君洲人形在旁安静看她，不替她回答。",
  "tiger-shelter/ending_terms": "吸血鬼猎人D画风，中国古代。单幅场景，每月还债后的山道岔口，参考图2君洲人形等候并喊参考图1小橘名字，参考图1小橘沿山路加快脚步跑近。",
  "tiger-shelter/b_inn": "吸血鬼猎人D画风，中国古代。单幅场景，驿站厨房饭时，参考图3厨子端鱼汤，参考图2君洲人形按住碗，参考图1小橘竖耳，碗底黏着一片红鳞。",
  "tiger-shelter/b_gate": "吸血鬼猎人D画风，中国古代。单幅场景，城门验车处，参考图2君洲人形手压交接簿，参考图1小橘在桌边，参考图3白袍青年拦合页，参考图4内侍按剑柄。",
  "tiger-shelter/b_repay": "吸血鬼猎人D画风，中国古代。单幅场景，水门边白日，参考图1小橘扒空地上的随身小布袋，露两片叶和半块饼，抬爪拦参考图2君洲掏钱，参考图3老池丁叹气。",
  "tiger-shelter/b_homeward": "吸血鬼猎人D画风，中国古代。单幅场景，返山官道城门外，参考图3白袍青年改文书名字，参考图2君洲人形掰饼递给参考图1小橘，参考图1小橘伸长脖子看。",
  "tiger-shelter/b_court_small": "吸血鬼猎人D画风，中国古代。单幅场景，暂住山脚驿舍的夜里，参考图1小橘和参考图2君洲人形一起吃完饭，门边行李还没有收走。",
  "tiger-shelter/b_wind": "吸血鬼猎人D画风，中国古代。单幅场景，封山前背阴山坳，参考图2君潮虎形低头嗅狼爪印，参考图1小橘站旁看风绕石壁吹向旧洞。",
  "six-roots/field_0": "吸血鬼猎人D画风，中国仙侠。单幅场景，算术擂台，参考图2庆尧袖角未乱，参考图1苏砚青盯剑气末尾的九划掉旧记，参考图3大师兄握剑脸色发白。",
  "six-roots/puzzle_0": "吸血鬼猎人D画风，中国仙侠。单幅场景，算术台边，参考图1苏砚青用手指在另一掌心逐步算乘除减，参考图2大师兄发抖剑尖逼近同一视线。",
  "six-roots/aftermath_0": "吸血鬼猎人D画风，中国仙侠。单幅场景，剑气散后的台边，参考图2大师兄藏伤手讨算式，参考图3二师姐系衣带，参考图4师父翻瘪钱袋，参考图1苏砚青递纸。",
  "six-roots/field_1": "吸血鬼猎人D画风，中国仙侠。单幅场景，第二擂台，参考图3对手换问句后字母锁住参考图2二师姐衣袖，参考图1苏砚青在台下拢手喊名字，她隔风侧耳。",
  "six-roots/puzzle_1": "吸血鬼猎人D画风，中国仙侠。单幅场景，第二擂台字锁未松，参考图1苏砚青指胸示范回答，参考图2二师姐转看他的嘴，参考图3灰紫衣对手静等答错。",
  "six-roots/b_arena_crack": "吸血鬼猎人D画风，中国仙侠。单幅场景，算错后的台侧，风刃擦参考图1苏砚青肩，参考图2大师兄伸缠布手挡第二阵，参考图3庆尧从对面指出末尾减九。",
  "six-roots/b_arena_language": "吸血鬼猎人D画风，中国仙侠。单幅场景，字阵中央，参考图1苏砚青抬被字母围住的腕，参考图2灰紫衣对手问姓名，台下参考图3二师姐念到一半停住。",
  "six-roots/b_watch": "吸血鬼猎人D画风，中国仙侠。单幅场景，药棚炉房将晓，参考图1苏砚青靠墙坐下，卷袖的参考图2二师姐留在炉边；最后一班药炉尚未交接。",
  "six-roots/b_inn_school": "吸血鬼猎人D画风，中国仙侠。单幅场景，次晨客栈门口，参考图2掌柜端粥递乱货单，参考图1苏砚青把二乘三那行推给身边紧张的参考图3大师兄。",
  "six-roots/b_grain_class": "吸血鬼猎人D画风，中国仙侠。单幅场景，三日后祠堂首课，参考图2大师兄把石子分堆移到秤边，参考图1苏砚青停讲等后排看清重复损耗。",
  "six-roots/b_rain_class": "吸血鬼猎人D画风，中国仙侠。单幅场景，当晚漏雨祠堂，参考图2二师姐端盆接水，参考图3大师兄在干地铺石子，参考图1苏砚青听抱谷袋村民争报修瓦数。",
};
const SHORT_SETTING_OVERRIDES: Record<string, string> = {
  'blue-blood': '当代中国',
  'double-pursuit': '当代中国',
  'happy-home': '当代中国',
  'score-room': '当代中国',
  'online-heir': '当代中国',
  'red-plum': '当代中国乡村',
  'island-broadcast': '当代海岛',
  'future-island': '近未来中国',
  'black-flood': '中国仙侠',
  'hollow-immortals': '中国仙侠',
  'ming-whisper': '中国明末',
  'rotten-pilgrimage': '中国西游',
  'six-roots': '中国仙侠',
  'wrong-realm': '中国仙侠',
  'velvet-alibi': '当代中国',
  'palace-ledger': '中国古代',
  'temple-heart': '中国古代',
  'tiger-shelter': '中国古代',
  'harvest-box': '中国古代',
  'radish-court': '中国古代',
};
export interface ShortAssetPlan {
  worldId: string; owner: string; nodeId: string; kind: ArtJobKind;
  prompt: string; dependencies: string[]; sourceHash: string; sourceFacts: string[];
  blocked?: string;
  referenceFiles?: string[];
}
interface CharacterDirection { prompt: string; sourceFacts: string[] }
interface Beat { beat: string; characterIds: string[]; sourceSnapshotHash?: string; sourceFacts?: string[] }
interface ShortBookWorld {
  setting: string; characters: Record<string, CharacterDirection>; nodes: Record<string, Beat>;
  cover: Beat; environments: { id: string; location: string; beat: string; sourceFacts: string[] }[];
}
export const anchorNodeId = (id: string) => `__art_character_${id}`;
export const sourceSnapshotHash = (world: ArtWorldInput, node: SceneNode) =>
  sha256(JSON.stringify({ worldId: world.id, node, characters: world.characters }));

export async function buildShortPlans(root: string, worlds: ArtWorldInput[]): Promise<ShortAssetPlan[]> {
  const repairs: Record<string, { prompt: string; referenceFiles: string[] }> = await readFile(path.join(root, SHORT_REPAIR_FILE), 'utf8')
    .then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return {}; throw error; });
  const books = new Map<string, { worlds: Record<string, ShortBookWorld> }>();
  for (const owner of new Set(Object.values(ART_WORLD_OWNERS))) {
    const book = await readArtSourceBook<{ profile: string; worlds: Record<string, ShortBookWorld> }>(root, owner);
    if (book.profile !== 'short-production-20260907') throw new Error('SHORT_BOOK_PROFILE_MISMATCH');
    books.set(owner, book);
  }
  const plans: ShortAssetPlan[] = [];
  for (const world of worlds) {
    const owner = ART_WORLD_OWNERS[world.id];
    const book = books.get(owner)?.worlds[world.id];
    if (!book) throw new Error(`SHORT_BOOK_WORLD_MISSING:${world.id}`);
    const base = { worldId: world.id, owner };
    const add = (nodeId: string, kind: ArtJobKind, prompt: string, dependencies: string[], facts: string[], source: unknown, blocked?: string) => {
      const repair = repairs[`${world.id}/${nodeId}`];
      prompt = repair?.prompt ?? SHORT_SCENE_PROMPT_OVERRIDES[`${world.id}/${nodeId}`] ?? prompt;
      if (!prompt.startsWith('吸血鬼猎人D画风，') || prompt.length > 90) throw new Error(`SHORT_PROMPT_INVALID:${world.id}/${nodeId}`);
      if (new Set(dependencies).size !== dependencies.length) throw new Error('SHORT_DUPLICATE_CHARACTER_REFERENCE');
      for (const id of dependencies) if (!book.characters[id]) throw new Error(`SHORT_CHARACTER_MISSING:${world.id}/${id}`);
      plans.push({ ...base, nodeId, kind, prompt, dependencies: dependencies.map(anchorNodeId),
        sourceFacts: facts, sourceHash: sha256(canonical({ profile: SHORT_PROFILE, worldId: world.id, source, prompt })),
        // A scoped style reference precedes the unchanged, individually bound cast anchors.
        ...(repair ? { referenceFiles: repair.referenceFiles } : {}),
        ...(blocked ? { blocked } : {}) });
    };
    for (const [id, character] of Object.entries(book.characters)) {
      const repair = repairs[`${world.id}/${anchorNodeId(id)}`];
      const characterPrompt = repair?.prompt ?? SHORT_PROMPT_OVERRIDES[`${world.id}/${anchorNodeId(id)}`] ?? character.prompt;
      add(anchorNodeId(id), 'character-anchor', characterPrompt, [], character.sourceFacts,
        { ...character, prompt: characterPrompt });
      add(`__art_reaction_${id}`, 'character-reaction',
        '吸血鬼猎人D画风，同参考人物，警觉表情，灰底半身像。', [id], character.sourceFacts, character);
    }
    const setting = SHORT_SETTING_OVERRIDES[world.id] ?? book.setting.split(/[；。]/)[0].split(/[，,、]/)[0].trim();
    const scenePrompt = (beat: Beat) => '吸血鬼猎人D画风，' + setting + '。' +
      (beat.characterIds.length ? '同参考人物，' : '') + beat.beat;
    for (const [id, node] of Object.entries(world.nodes)) {
      const beat = book.nodes[id];
      if (!beat) throw new Error(`SHORT_NODE_MISSING:${world.id}/${id}`);
      const changed = sourceSnapshotHash(world, node) !== beat.sourceSnapshotHash;
      add(id, 'scene', scenePrompt(beat), beat.characterIds, beat.sourceFacts ?? [], { node, cast: world.characters, beat },
        changed ? 'SOURCE_CHANGED_REQUIRES_OWNER_REFRESH' : beat.characterIds.length > 6 ? 'MORE_THAN_SIX_VISIBLE_IDENTITIES' : undefined);
    }
    add('__art_cover', 'cover', scenePrompt(book.cover), book.cover.characterIds, book.cover.sourceFacts ?? [], book.cover,
      book.cover.characterIds.length > 6 ? 'MORE_THAN_SIX_VISIBLE_IDENTITIES' : undefined);
    for (const environment of book.environments) {
      // Location/time are authored structured fields; generic layout checklists stay out of the image prompt.
      const nodeId = environment.id.startsWith(`${world.id}-`) && environment.id.endsWith('-environment')
        ? environment.id.slice(world.id.length + 1, -'-environment'.length) : undefined;
      const node = nodeId ? world.nodes[nodeId] : undefined;
      const subject = [environment.location, node?.time].filter(Boolean).join('，');
      add(`__art_environment_${environment.id}`, 'environment',
        '吸血鬼猎人D画风，' + setting + '。' + subject + '，单幅无人场景。',
        [], environment.sourceFacts, environment);
    }
  }
  if (new Set(plans.map(p => `${p.worldId}/${p.nodeId}`)).size !== plans.length) throw new Error('SHORT_DUPLICATE_ASSET_ID');
  return plans;
}

export function augmentedShortWorld(world: ArtWorldInput, plans: ShortAssetPlan[]): ArtWorldInput {
  const nodes = { ...world.nodes };
  for (const plan of plans.filter(p => p.worldId === world.id && p.kind !== 'scene')) {
    if (nodes[plan.nodeId]) throw new Error('SHORT_ANCILLARY_NODE_COLLISION');
    nodes[plan.nodeId] = { id: plan.nodeId, chapter: 'Art asset', title: plan.nodeId,
      location: '', time: '', background: '', text: [plan.prompt], choices: [] };
  }
  return { ...world, nodes };
}

export async function shortBrief(root: string, plan: ShortAssetPlan, jobs: ArtJob[]): Promise<SceneBrief | undefined> {
  if (plan.blocked) return undefined;
  const references: string[] = (plan.referenceFiles ?? []).map(file => path.resolve(root, file));
  for (const nodeId of plan.dependencies) {
    const anchor = jobs.find(job => job.worldId === plan.worldId && job.nodeId === nodeId && !job.stale
      && job.assetKind === 'character-anchor' && job.review?.decision === 'approved'
      && job.asset && !job.asset.duplicate);
    if (!anchor?.asset) return undefined;
    const filename = path.join(root, 'public/generated-art', `${anchor.id}.png`);
    if (sha256(await readFile(filename)) !== anchor.asset.sha256) throw new Error('SHORT_ANCHOR_HASH_CHANGED');
    references.push(filename);
  }
  const hashes = [];
  for (const filename of references) hashes.push(sha256(await readFile(filename)));
  return { prompt: plan.prompt, sourceHash: plan.sourceHash, references,
    ...(plan.kind === 'character-anchor' || plan.kind === 'character-reaction' ? { aspectRatio: '2:3' as const } : {}),
    referenceHash: sha256(canonical({ profile: SHORT_PROFILE, hashes,
      ...(plan.kind === 'character-anchor' || plan.kind === 'character-reaction' ? { aspectRatio: '2:3' } : {}) })) };
}
