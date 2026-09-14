import type { GameWorld, SceneNode } from '../shared/types';

export type SceneBackdropKind = 'warehouse' | 'modern-room' | 'corridor' | 'traditional-hall' | 'courtyard' | 'forest' | 'street' | 'coast' | 'ship' | 'camp';
export type SceneBackdropPeriod = 'modern' | 'traditional';

export interface SceneBackdrop {
  /** Local stage scenery; this is separate from the reviewed artwork catalogue. */
  src: string;
  kind: SceneBackdropKind;
  period: SceneBackdropPeriod;
  backgroundColor: string;
}

type BackdropWorld = Pick<GameWorld, 'id'> & Partial<Pick<GameWorld, 'title' | 'subtitle'>>;
type BackdropNode = Partial<Pick<SceneNode, 'location' | 'title'>>;
type PaletteName = 'slate' | 'clay' | 'sage' | 'coastal';
type Palette = { sky: string; light: string; wall: string; side: string; floor: string; shade: string; ink: string; accent: string; distance: string };

const palettes: Record<PaletteName, Palette> = {
  slate: { sky: '#abbac0', light: '#e6dec9', wall: '#8f9b9a', side: '#667b80', floor: '#8c8c83', shade: '#546569', ink: '#37484b', accent: '#b48b73', distance: '#7f969b' },
  clay: { sky: '#c1bdb0', light: '#e9d6b6', wall: '#b5aa95', side: '#8f8777', floor: '#a59681', shade: '#706a60', ink: '#4e504a', accent: '#a36350', distance: '#919a8c' },
  sage: { sky: '#b5c2b8', light: '#e2dec4', wall: '#a4ab96', side: '#778b80', floor: '#a3a48b', shade: '#5f7369', ink: '#3f5750', accent: '#b69770', distance: '#8ba498' },
  coastal: { sky: '#bac9c6', light: '#ede1c5', wall: '#a9b6ac', side: '#758f91', floor: '#b3aa8e', shade: '#627d7e', ink: '#415e61', accent: '#b58e6e', distance: '#8eafae' },
};

const traditionalWorlds = new Set([
  'rotten-pilgrimage', 'ming-whisper', 'black-flood', 'radish-court', 'harvest-box',
  'temple-heart', 'tiger-shelter', 'six-roots', 'palace-ledger', 'hollow-immortals', 'wrong-realm',
]);
const naturalWorlds = new Set(['black-flood', 'tiger-shelter', 'six-roots', 'hollow-immortals', 'wrong-realm', 'island-broadcast']);
const courtWorlds = new Set(['ming-whisper', 'radish-court', 'palace-ledger']);

const storage = /仓|库房|分仓|货架|物资库|封存库|公库|储藏|储备间|装卸|粮库|粮储/;
const passage = /走廊|长廊|外廊|内廊|廊道|过道|楼梯|电梯|楼道|检修梯|玄关|消防门/;
const ship = /船舱|甲板|船上|舱内|艇内|驾驶舱|船尾|船头/;
const shore = /海域|海边|海岸|沙滩|浅滩|岸边|渡口|河渡|码头|船坞|水域|裂潮|水边|河口|海面|湖畔/;
const camp = /病棚|军营|营地|点兵桌|营帐/;
const interior = /室|房|屋|家|厅|殿|阁|庙|帐|堂|厨房|灶|寝宫|内宫|工位|课桌|书桌|餐桌|饭桌|茶水|桌边|床|柜|账|办公室|会客|便利店|餐馆|磨坊|小窗|窗边|窗前|棚内|茅屋/;
const natural = /山|林|竹|洞|岭|溪|潭|涧|悬崖|灌木|云台|灵泉|崖|荒野|旷野/;
const courtyard = /院|宫门|宫外|殿外|殿门|宗门|山门|擂台|比武台|练功|练习台|结契|裁判|药棚|田|菜地|土垄|晾晒|农场|石桌|石阶|井边|庙外|屋檐/;
const outdoors = /街|巷|路|楼外|门外|门前|城门|营地|棚|站外|楼前|广场|站台|场地|车边|车前|台阶|关口|村南|村口|村道/;

function classify(location: string, period: SceneBackdropPeriod): SceneBackdropKind | undefined {
  // The last location segment is the actual room (e.g. old street / convenience store).
  const text = location.split(/[·•]/).at(-1)?.trim() ?? '';
  if (storage.test(text)) return 'warehouse';
  if (passage.test(text)) return 'corridor';
  if (ship.test(text)) return 'ship';
  if (camp.test(text)) return 'camp';
  if (shore.test(text)) return 'coast';
  // An open palace gate and a kitchen in that palace need different compositions.
  if (period === 'traditional' && /宫门|宫外|殿外|殿门|院门|庙外|屋檐/.test(text)) return 'courtyard';
  if (/楼外|楼前|店外|店门前|茅屋外|茅屋前|家门外|门外|门前|台阶|车边|车前/.test(text)) return 'street';
  if (interior.test(text)) return period === 'traditional' ? 'traditional-hall' : 'modern-room';
  if (natural.test(text)) return 'forest';
  if (courtyard.test(text)) return 'courtyard';
  if (outdoors.test(text)) return 'street';
  return undefined;
}

/** A scenery-only safety net. Callers retain the original art state and retry controls. */
export function sceneBackdrop(world: BackdropWorld, node: BackdropNode = {}): SceneBackdrop {
  const worldText = `${world.title ?? ''} ${world.subtitle ?? ''}`;
  const period: SceneBackdropPeriod = traditionalWorlds.has(world.id)
    || (!knownModernWorlds.has(world.id) && /修仙|修真|宗门|后宫|皇后|宫廷|大明|西游|仙魔|古代/.test(worldText))
    ? 'traditional' : 'modern';
  const kind = classify(node.location ?? '', period) ?? classify(node.title ?? '', period)
    ?? (world.id === 'future-island' ? 'coast'
      : naturalWorlds.has(world.id) ? 'forest'
        : courtWorlds.has(world.id) ? 'traditional-hall'
          : period === 'traditional' ? 'courtyard' : 'modern-room');
  const palette: PaletteName = kind === 'coast' || kind === 'ship' ? 'coastal'
    : kind === 'forest' || world.id === 'red-plum' || world.id === 'island-broadcast' ? 'sage'
      : period === 'traditional' || world.id === 'velvet-alibi' ? 'clay' : 'slate';
  const cave = kind === 'forest' && /洞|山缝/.test(node.location ?? '');
  const key = `${kind}:${period}:${palette}:${cave}`;
  const cached = backdropCache.get(key);
  if (cached) return cached;
  const p = palettes[palette];
  const drawing = renderScene(kind, period, p, cave);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1000" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${p.sky}"/><stop offset="1" stop-color="${p.light}"/></linearGradient><linearGradient id="floor" x2="0" y2="1"><stop stop-color="${p.floor}"/><stop offset="1" stop-color="${p.side}"/></linearGradient></defs><rect width="1600" height="1000" fill="url(#sky)"/><g stroke="${p.ink}" stroke-width="2" stroke-linejoin="round">${drawing}</g></svg>`;
  const result = { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, kind, period, backgroundColor: p.wall };
  backdropCache.set(key, result);
  return result;
}

const knownModernWorlds = new Set(['blue-blood', 'double-pursuit', 'velvet-alibi', 'future-island', 'happy-home', 'score-room', 'online-heir', 'red-plum', 'island-broadcast']);
const backdropCache = new Map<string, SceneBackdrop>();

function windowPanel(x: number, y: number, width: number, height: number, p: Palette, traditional = false): string {
  return `<rect x="${x - 10}" y="${y - 10}" width="${width + 20}" height="${height + 20}" fill="${p.shade}"/><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${p.light}"/><path d="M${x} ${y + height * .65}l${width * .3} ${-height * .18} ${width * .2} ${height * .08} ${width * .5} ${-height * .2}v${height * .35}H${x}Z" fill="${p.distance}" stroke="none" opacity=".58"/><path d="M${x + width / 2} ${y}v${height}M${x} ${y + height / 2}h${width}${traditional ? `M${x + width / 4} ${y}v${height}M${x + width * .75} ${y}v${height}M${x} ${y + height / 4}h${width}M${x} ${y + height * .75}h${width}` : ''}" stroke="${p.shade}" stroke-width="${traditional ? 6 : 9}"/>`;
}

function crate(x: number, y: number, width: number, height: number, p: Palette): string {
  return `<path d="M${x} ${y}l${width * .16} -${height * .15}h${width}l-${width * .16} ${height * .15}Z" fill="${p.light}"/><path d="M${x + width} ${y}l${width * .16} -${height * .15}v${height}l-${width * .16} ${height * .15}Z" fill="${p.shade}"/><rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${p.accent}"/><path d="M${x + width * .16} ${y}v${height}m${width * .68} 0v-${height}M${x} ${y + height * .25}h${width}M${x} ${y + height * .78}h${width}" fill="none" stroke="${p.ink}" opacity=".48"/>`;
}

function roomShell(p: Palette): string {
  return `<path d="M0 0H1600V660H0Z" fill="${p.wall}"/><path d="M0 0L340 128V615L0 810Z" fill="${p.side}"/><path d="M1600 0L1350 128V615L1600 810Z" fill="${p.floor}"/><path d="M340 128H1350V615H340Z" fill="${p.wall}"/><path d="M0 810L340 615H1350L1600 810V1000H0Z" fill="url(#floor)"/><path d="M0 0L340 128H1350L1600 0Z" fill="${p.shade}"/><path d="M340 615L10 1000M1350 615L1590 1000M640 615L530 1000M1080 615L1220 1000M195 696H1470M74 779H1583M0 907H1600" fill="none" stroke="${p.ink}" opacity=".2"/><path d="M339 610H1351" stroke="${p.shade}" stroke-width="10"/>`;
}

function renderScene(kind: SceneBackdropKind, period: SceneBackdropPeriod, p: Palette, cave: boolean): string {
  if (kind === 'camp') {
    return `<path d="M0 462L195 354 375 402 557 319 731 431 931 370 1102 438 1305 352 1600 438V683H0Z" fill="${p.distance}" stroke="none"/>
      <path d="M0 613L270 575 526 619 821 570 1090 608 1337 584 1600 619V1000H0Z" fill="url(#floor)"/>
      <path d="M547 651L828 595 983 626 869 741 1079 1000H464L665 786Z" fill="${p.light}" stroke="none" opacity=".32"/>
      <path d="M828 585L965 389 1103 577Z" fill="${p.wall}"/><path d="M965 389L1204 429 1310 601 1103 577Z" fill="${p.side}"/>
      <path d="M921 578L968 457 1019 580Z" fill="${p.shade}"/><path d="M965 389L1103 577M1204 429L1310 601" fill="none" stroke="${p.shade}" stroke-width="3"/>
      <path d="M0 577L245 235 469 550 439 722 0 777Z" fill="${p.light}"/><path d="M245 235L523 316 661 614 617 751 439 722 469 550Z" fill="${p.wall}"/>
      <path d="M122 752L245 371 350 735Z" fill="${p.shade}"/><path d="M122 752L245 371 209 651Z" fill="${p.floor}"/><path d="M245 371L350 735 280 666Z" fill="${p.side}"/>
      <path d="M245 237L469 550M523 317L661 614M469 550L439 721" fill="none" stroke="${p.shade}" stroke-width="3"/>
      <path d="M18 561L5 823M469 550L557 849M661 614L739 796" fill="none" stroke="${p.ink}" stroke-width="3"/><path d="M555 830V871M740 779V814" stroke="${p.ink}" stroke-width="9"/>
      <path d="M1101 286L1474 315 1600 416 1194 385Z" fill="${p.light}"/><path d="M1194 385L1600 416V440L1192 405Z" fill="${p.wall}"/>
      <path d="M1108 289V612M1472 315V684M1200 387V715M1580 419V786" stroke="${p.shade}" stroke-width="13" fill="none"/><path d="M1200 387L1108 289M1200 405L1580 438" stroke="${p.ink}" stroke-width="5" fill="none"/>
      <path d="M1270 568L1439 559 1530 597 1348 613Z" fill="${p.floor}"/><path d="M1305 595V661M1489 608V672" stroke="${p.shade}" stroke-width="11"/>
      <path d="M1141 691L1433 647 1575 727 1265 788Z" fill="${p.accent}"/><path d="M1141 691V714L1265 813V788ZM1265 788L1575 727V750L1265 813Z" fill="${p.shade}"/>
      <path d="M1176 733V912M1516 767V937" stroke="${p.ink}" stroke-width="17"/><path d="M1230 682L1460 674M1192 713L1498 673" stroke="${p.shade}" opacity=".55" fill="none"/>
      <path d="M1243 691L1323 678 1380 706 1296 722Z" fill="${p.light}"/><path d="M1440 683V645h27v38q-14 10-27 0Z" fill="${p.wall}"/>
      <path d="M973 751l-29-17 8-24 31-12 24 18 39-10 20 27-15 30Z" fill="${p.shade}"/><path d="M943 688q7 61 67 61t67-61Z" fill="${p.ink}"/><ellipse cx="1010" cy="688" rx="67" ry="17" fill="${p.side}"/>
      <path d="M941 699q-27-8-17-28l21-3M1078 698q25-8 15-28l-18-2" fill="none" stroke="${p.ink}" stroke-width="6"/><path d="M993 663q-24-26-5-46t-4-41M1024 661q23-30 6-51" stroke="${p.light}" stroke-width="8" fill="none" opacity=".45"/>
      <path d="M70 878L233 838 402 935 234 1000H0Z" fill="${p.shade}" stroke="none" opacity=".34"/><path d="M976 817l60-16 54 13M772 918l45-6 24 10M468 859l34-9 25 7" stroke="${p.shade}" fill="none" opacity=".5"/>`;
  }
  if (kind === 'warehouse') {
    return `${roomShell(p)}${windowPanel(657, 165, 328, 161, p, period === 'traditional')}<path d="M673 336L1010 327L1500 787L717 693Z" fill="${p.light}" stroke="none" opacity=".24"/><path d="M120 112L325 170V721L120 841ZM1100 180H1350V660H1100Z" fill="${p.shade}"/>${[224, 409, 594].map(y => `<path d="M106  ${y}l233 49v27L106 ${y + 25}ZM1083 ${y + 14}h286v20h-286Z" fill="${p.side}"/>`).join('')}${crate(133, 475, 105, 133, p)}${crate(184, 300, 111, 120, p)}${crate(1130, 470, 142, 145, p)}${crate(1155, 294, 96, 112, p)}${crate(1274, 541, 104, 120, p)}<path d="M107 122V842M330 178V733M1094 177V677M1362 126V723" stroke="${p.ink}" stroke-width="17" fill="none"/>${period === 'modern' ? `<path d="M435 0V109H1510" stroke="${p.side}" stroke-width="31" fill="none"/><path d="M439 0V104H1509" stroke="${p.floor}" stroke-width="16" fill="none"/><rect x="398" y="383" width="128" height="127" fill="${p.side}"/>${[405, 423, 441, 459, 477].map(y => `<path d="M414 ${y}h95" stroke-width="6" stroke="${p.shade}"/>`).join('')}` : `<path d="M320 95H1390M566 116V42M1088 116V42" fill="none" stroke="${p.ink}" stroke-width="24"/>`}<path d="M70 914L387 769L496 846L244 1000H0Z" fill="${p.shade}" stroke="none" opacity=".45"/>`;
  }
  if (kind === 'modern-room') {
    return `${roomShell(p)}${windowPanel(431, 184, 386, 301, p)}<path d="M444 489H818L1220 843L573 880Z" fill="${p.light}" stroke="none" opacity=".32"/><path d="M967 210H1188V614H967Z" fill="${p.shade}"/><path d="M982 223H1172V614H982Z" fill="${p.side}"/><path d="M1005 246H1147V462H1005Z" fill="${p.wall}"/><path d="M1141 498h18" stroke="${p.light}" stroke-width="5"/><path d="M1025 695L1380 629L1502 700L1132 793Z" fill="${p.floor}"/><path d="M1025 695V717L1132 815V793ZM1132 793L1502 700V726L1132 815Z" fill="${p.shade}"/><path d="M1085 750V946M1450 728V878" stroke="${p.ink}" stroke-width="15"/><path d="M1199 670l122 -14 64 36-130 23Z" fill="${p.light}"/><path d="M1300 630v-95l-35 -30" stroke="${p.ink}" stroke-width="8" fill="none"/><path d="M1216 502q50 -68 82 18Z" fill="${p.accent}"/><path d="M160 637h111l-15 109h-79Z" fill="${p.accent}"/><path d="M214 640c-77 -57-68 -138-32 -149 0 52 17 86 31 90-15-87 20-143 54-142-7 68-19 117-47 154 46-43 80-33 91-4-33 22-56 30-94 40Z" fill="${p.shade}"/><path d="M1165 165h136" stroke="${p.floor}" stroke-width="8"/>`;
  }
  if (kind === 'corridor') {
    const timber = period === 'traditional';
    return `<path d="M0 0H1600V1000H0Z" fill="${p.wall}"/><path d="M0 0L650 228V609L0 1000Z" fill="${p.side}"/><path d="M1600 0L1090 228V609L1600 1000Z" fill="${p.floor}"/><path d="M0 0L650 228H1090L1600 0Z" fill="${p.shade}"/><path d="M650 609H1090L1600 1000H0Z" fill="url(#floor)"/>${windowPanel(723, 272, 283, 277, p, timber)}<path d="M726 553H1007L1318 945L459 1000Z" fill="${p.light}" stroke="none" opacity=".29"/>${[0, 1, 2].map(i => { const x = 72 + i * 191; const y = 125 + i * 45; const h = 610 - i * 136; return `<path d="M${x} ${y}l${136 - i * 18} ${42 - i * 6}v${h}l-${136 - i * 18} ${80 - i * 18}Z" fill="${p.shade}"/><path d="M${x + 14} ${y + 24}l${109 - i * 18} ${34 - i * 6}v${h - 48}l-${109 - i * 18} ${65 - i * 18}Z" fill="${p.wall}"/>`; }).join('')}<path d="M1440 100V900M1266 177V747M1149 228V654M615 206V635" stroke="${p.ink}" stroke-width="${timber ? 22 : 9}" fill="none"/><path d="M1102 304L1600 119V159L1102 332ZM1102 477L1600 551V581L1102 500Z" fill="${p.shade}"/><path d="M0 98L650 280M0 922L650 599M1600 941L1090 599M650 609L364 1000M1090 609L1285 1000M413 751H1275M180 890H1457" stroke="${p.ink}" fill="none" opacity=".32"/>${timber ? `<path d="M270 0L726 228M1285 0L1018 228" stroke="${p.floor}" stroke-width="30" fill="none"/>` : `<path d="M448 0L750 213H899L733 0Z" fill="${p.floor}"/><path d="M553 69L705 162H820L723 69Z" fill="${p.light}"/>`}`;
  }
  if (kind === 'traditional-hall') {
    return `${roomShell(p)}${windowPanel(430, 175, 343, 352, p, true)}${windowPanel(920, 175, 343, 352, p, true)}<path d="M438 532H759L1197 887L348 1000Z" fill="${p.light}" stroke="none" opacity=".23"/><path d="M342 127H1351V173H342ZM342 563H1351V613H342Z" fill="${p.shade}"/><path d="M347 107V667M842 122V624M1339 109V667" stroke="${p.ink}" stroke-width="27" fill="none"/><path d="M0 57L366 155M1238 133L1600 30" stroke="${p.accent}" stroke-width="21" fill="none"/><path d="M997 648L1294 613L1392 669L1080 721Z" fill="${p.accent}"/><path d="M1080 721L1392 669V692L1080 748ZM997 648V674L1080 748V721Z" fill="${p.shade}"/><path d="M1031 685V851M1344 700V836" stroke="${p.ink}" stroke-width="18"/><path d="M1092 653l100-12 56 23-100 13Z" fill="${p.light}"/><path d="M1220 627v-45h34v47q-16 16-34-2Z" fill="${p.wall}"/><path d="M146 252L233 282V627L146 678Z" fill="${p.floor}"/><path d="M158 274L217 292V590L158 617Z" fill="${p.light}"/><path d="M174 498l15-136 19 81-8 69Z" fill="${p.distance}" stroke="none"/><path d="M29 923L487 729L540 798L229 1000H0Z" fill="${p.shade}" stroke="none" opacity=".38"/>`;
  }
  if (kind === 'courtyard') {
    return `<path d="M0 465L272 242 424 374 680 241 882 382 1082 282 1344 416 1600 278V669H0Z" fill="${p.distance}" stroke="none"/><path d="M0 605H1600V1000H0Z" fill="url(#floor)"/><path d="M0 401L497 453V681L0 749Z" fill="${p.wall}"/><path d="M1600 352L1112 429V675L1600 748Z" fill="${p.wall}"/><path d="M0 375L497 438V463L0 424ZM1600 323L1112 413V446L1600 378Z" fill="${p.shade}"/><path d="M497 466H1112V682H497Z" fill="${p.wall}"/><path d="M626 671V433Q808 309 989 433V671Z" fill="${p.shade}"/><path d="M650 677V444Q808 335 966 444V677Z" fill="${p.light}"/><path d="M650 546L742 482 820 532 884 486 966 557V677H650Z" fill="${p.distance}" stroke="none"/><path d="M596 679H1019L1399 1000H138Z" fill="${p.light}" stroke="none" opacity=".35"/><path d="M547 747H1100M418 857H1231M773 681L672 1000M868 681L1010 1000" stroke="${p.shade}" opacity=".38" fill="none"/><path d="M1333 0l-22 348 55 338 26-4-39-338 43-344Z" fill="${p.ink}"/><path d="M1352 334l-95-100-112-34 15-18 124 20 76 80 75-173 23 13-49 170Z" fill="${p.shade}"/><path d="M1150 65l91-64h359v147l-67 41-129-29-32 60-113-20-51-51-88 18-51-43Z" fill="${p.side}"/><path d="M1427 179l-18 144-20 8 16-143Z" fill="${p.shade}"/><path d="M1104 735l124-26 187 49-129 44Z" fill="${p.wall}"/><path d="M1153 767V883M1351 783V878" stroke="${p.shade}" stroke-width="24"/><path d="M1104 735v24l182 69 129-46v-24l-129 44Z" fill="${p.shade}"/><path d="M0 788l180-33 171 80-30 165H0Z" fill="${p.side}"/><path d="M69 798l-26-69 34 23 19-45 30 82 38-33 21 49" fill="${p.distance}" stroke="${p.shade}"/>`;
  }
  if (kind === 'forest') {
    return `<path d="M0 452L122 375 244 449 466 238 651 423 873 255 1078 409 1291 298 1600 429V705H0Z" fill="${p.distance}" stroke="none"/><path d="M0 526L274 491 493 557 771 484 1000 566 1276 462 1600 531V1000H0Z" fill="${p.side}" stroke="none"/><path d="M0 731L254 634 531 682 823 588 1034 663 1321 610 1600 721V1000H0Z" fill="${p.floor}"/><path d="M815 590L950 601 784 726 1038 887 927 1000H320L725 814 631 734Z" fill="${p.light}" stroke="none" opacity=".66"/><path d="M78 0l76 60 45 409-9 287-53 8-12-305Z" fill="${p.ink}"/><path d="M170 400L345 249 499 222l10 18-148 36-174 175Z" fill="${p.shade}"/><path d="M1294 0h52l-13 352 69 297-40 6-71-295Z" fill="${p.shade}"/><path d="M1413 0h73l-48 412 32 325-56-8-37-304Z" fill="${p.ink}"/><path d="M1348 367l-193-191-99-29 11-21 123 27 152 140Z" fill="${p.shade}"/><path d="M0 0h711l-91 79-107-6-110 91-181-31-66 78L0 157ZM1600 0h-582l40 97 133 22 57 84 168-11 34 70 150-28Z" fill="${p.shade}"/><path d="M0 97l172 37 136-57 71 63-120 125-192-29L0 312ZM1600 127l-111 77-88-14-86 98-150-79 24-70 116 20 79-67 136-37Z" fill="${p.side}"/><path d="M0 892l149-70 185 40 130 138H0ZM1191 1000l109-185 91-33 86 61 123 22v135Z" fill="${p.shade}"/><path d="M78 875l81-42 98 21-40 22ZM1331 836l62-30 58 38-91 7Z" fill="${p.distance}" stroke="none"/><path d="M319 773l45-96 48-5-17 45 78 42-56 37ZM1140 713l41-83 67 41-8 36Z" fill="${p.side}"/>${cave ? `<path d="M0 0H1600V1000H1462L1370 718 1277 507 1132 326 872 237 590 294 389 454 242 716 156 1000H0Z" fill="${p.shade}"/><path d="M0 0H1600L1331 143 1081 86 766 176 422 121 193 261 0 417Z" fill="${p.side}"/><path d="M0 694L177 441 278 386 235 658 111 1000H0ZM1600 648L1411 426 1352 406 1429 729 1517 1000H1600Z" fill="${p.ink}"/><path d="M125 907l167-92 102 32-126 57ZM1232 877l144-25 67 92-99 19Z" fill="${p.wall}"/>` : ''}`;
  }
  if (kind === 'street') {
    const old = period === 'traditional';
    return `<path d="M0 563L226 383 413 423 652 357 853 436 1110 391 1318 477 1600 390V744H0Z" fill="${p.distance}" stroke="none"/><path d="M0 705L712 570H988L1600 705V1000H0Z" fill="url(#floor)"/><path d="M0 46L490 254V659L0 831Z" fill="${p.side}"/><path d="M490 254L654 323V602L490 659Z" fill="${p.wall}"/><path d="M1600 107L1160 306V654L1600 820Z" fill="${p.wall}"/><path d="M1160 306L1016 354V603L1160 654Z" fill="${p.floor}"/><path d="M0 745L715 582M1600 748L988 582M299 1000L789 582M1391 1000L965 582M461 786H1242M150 916H1492" fill="none" stroke="${p.ink}" opacity=".35"/><path d="M60 326l169 52v269L60 700Z" fill="${p.shade}"/><path d="M255 389l165 54v150l-165 53Z" fill="${p.light}"/><path d="M1315 416l211-93v320l-211-76Z" fill="${p.shade}"/><path d="M1179 451l100-37v128l-100-30Z" fill="${p.light}"/>${old ? `<path d="M0 49L445 206 518 256 675 300 655 336 477 279 0 105Z" fill="${p.ink}"/><path d="M1600 83L1198 257 1151 299 998 337 1015 371 1173 331 1600 159Z" fill="${p.shade}"/><path d="M259 463l160 24M304 405V630M359 423V612M1230 432V525" stroke="${p.side}" stroke-width="6"/><path d="M58 751L247 684 302 721 112 806Z" fill="${p.accent}"/>` : `<path d="M0 261L454 415V455L0 304Z" fill="${p.accent}"/><path d="M259 542l158 11M335 417V620" stroke="${p.side}" stroke-width="8"/><path d="M1438 41V816M1438 97l-107 37" fill="none" stroke="${p.ink}" stroke-width="12"/><path d="M1284 146l112-46-7 28-98 38Z" fill="${p.light}"/><path d="M632 330V596" stroke="${p.shade}" stroke-width="6"/>`}<path d="M0 949L518 713 576 772 274 1000H0Z" fill="${p.shade}" stroke="none" opacity=".36"/><path d="M1510 743l-34-65-44 7-4 49-34-20-38 6-11 65 165 69Z" fill="${p.side}"/>`;
  }
  const water = `<path d="M0 390L174 335 335 360 503 310 620 358 865 335 1068 375 1300 341 1600 370V526H0Z" fill="${p.distance}" stroke="none"/><path d="M0 468H1600V1000H0Z" fill="${p.side}"/><path d="M0 484H1600M264 516H816M901 550H1491M77 582H517M620 635H1324M0 711H498M888 783H1600" fill="none" stroke="${p.light}" stroke-width="3" opacity=".47"/><path d="M0 640l288-29 394 20 284-24 371 22 263-19v38l-263 19-371-22-284 24-394-20L0 679Z" fill="${p.distance}" stroke="none" opacity=".4"/>`;
  if (kind === 'ship') {
    return `${water}<path d="M0 814L1600 618V1000H0Z" fill="url(#floor)"/><path d="M0 868L1600 654M0 935L1600 701M252 1000L1600 780M901 1000L1600 881" fill="none" stroke="${p.shade}" opacity=".6"/><path d="M0 558L1600 478M0 697L1600 571" fill="none" stroke="${p.ink}" stroke-width="15"/>${[120, 470, 820, 1170, 1510].map(x => `<path d="M${x} ${562 - x * .05}V${844 - x * .123}" stroke="${p.shade}" stroke-width="19"/>`).join('')}<path d="M1382 0h42l-6 704-48 7Z" fill="${p.ink}"/><path d="M1407 27L873 607M1407 23L1589 613" stroke="${p.shade}" stroke-width="5" fill="none"/><path d="M0 103L304 159V637L0 683Z" fill="${p.wall}"/><path d="M0 91L325 145V172L0 129Z" fill="${p.shade}"/><path d="M118 260l116 18v138l-116 3Z" fill="${p.light}"/><path d="M120 429l114 10" stroke="${p.shade}" stroke-width="8"/>${crate(61, 699, 181, 151, p)}<ellipse cx="1280" cy="815" rx="70" ry="24" fill="none" stroke="${p.accent}" stroke-width="12"/><ellipse cx="1280" cy="815" rx="51" ry="14" fill="none" stroke="${p.accent}" stroke-width="7"/>`;
  }
  return `${water}<path d="M0 756L232 636 419 635 575 681 796 707 987 800 1189 825 1600 936V1000H0Z" fill="${p.floor}"/><path d="M0 816L232 673 403 673 564 711 786 742 976 831 1183 855 1600 963" fill="none" stroke="${p.light}" stroke-width="16" opacity=".65"/><path d="M966 625L1599 741V1000L832 738Z" fill="${p.accent}"/><path d="M965 638L1599 756M939 661L1599 788M909 686L1599 827M877 715L1599 873M1237 695L1106 831M1483 740L1399 931" fill="none" stroke="${p.shade}" stroke-width="3"/><path d="M844 701V844M981 600V741M1367 690V916M1583 752V1000" stroke="${p.ink}" stroke-width="20"/><path d="M847 620L1580 777M981 559L1583 658" stroke="${p.shade}" stroke-width="7" fill="none"/><path d="M0 0l87 82 47 358 30 367-32 21-60-378L11 104Z" fill="${p.shade}"/><path d="M0 0h429l-104 83-82-17-52 84-130-10L0 190Z" fill="${p.side}"/><path d="M0 850l150-61 80 54 124-4 90 80-132 81H0Z" fill="${p.shade}"/><path d="M10 850l139-40 59 50-98 16ZM241 868l107-9 66 64-111-16Z" fill="${p.distance}" stroke="none"/>`;
}
