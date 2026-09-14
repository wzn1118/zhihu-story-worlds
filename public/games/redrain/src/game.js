import {
  PROLOGUE,
  STAT_DEFS,
  ROUTE_RHYTHMS,
  INITIAL_STATS,
  SCENES,
  COMPANIONS,
  ENDING_DEFS,
  PATH_COUNT,
  BRANCH_SEQUENCE_COUNT,
  applyEffects,
  getSceneForRoute,
  getBranchTrail,
  getDominantStat,
  getRouteRhythm,
  getRouteSignature,
  resolveEnding
} from "./content.js";
import { RebirthWeekAudio } from "./audio.js";
import { getDecisionArt } from "./decision-art.js";
import { RETRO_ASSETS } from "./retro-assets.js";
import { createReadingPages } from "./reading.js";
import { ReaderReveal, READING_SPEEDS } from "./reader-reveal.js";
import { BAD_ENDINGS, DANGER_ROUTE_COUNTS, getDanger, getPreparation, preparationsAt, resolveDanger } from "./danger.js";
import { BAD_END_ART } from "./bad-end-art.js";
import { CHARACTER_ROLES, getSpeakerIdentity, getCharacterPortrait, getReadingPortrait } from "./character-art.js";

import { EMBEDDED, createRedleafBridge } from "./platform-bridge.js";

let bridge = null;
let redleafResumeAudio = false;
const SAVE_KEY = "doomsday-45-degree-save-v2";
const ENDINGS_KEY = "doomsday-45-degree-endings-v2";
const READING_PREFS_KEY = "doomsday-45-degree-reading-v1";
const AUDIO_PREFS_KEY = "doomsday-45-degree-audio-v1";
const ALL_ENDING_DEFS = [...ENDING_DEFS, ...BAD_ENDINGS];

const retroIcons = ["inventory", "map", "relations", "research"];
const legacyIconNames = ["inventory", "map", "relationship", "research"];
for (const [index, module] of retroIcons.entries()) {
  const replacement = RETRO_ASSETS[`ui-${module}`];
  if (!replacement) continue;
  document.querySelectorAll(`img[src$="icon-${legacyIconNames[index]}.png"]`).forEach(image => {
    image.src = replacement;
  });
}

const elements = {
  prologueView: document.querySelector("#prologue-view"),
  prologueCopy: document.querySelector(".prologue-copy"),
  gameView: document.querySelector("#game-view"),
  endingView: document.querySelector("#ending-view"),
  storyStage: document.querySelector(".story-stage"),
  dialogueZone: document.querySelector(".dialogue-zone"),
  dialogueCopy: document.querySelector(".dialogue-copy"),
  readingPrev: document.querySelector("#reading-prev"),
  readingAdvance: document.querySelector("#reading-advance"),
  readingAnnouncement: document.querySelector("#reading-announcement"),
  readingSpeed: document.querySelector("#reading-speed"),
  readingReducedMotion: document.querySelector("#reading-reduced-motion"),
  readingProgress: document.querySelector("#reading-progress"),
  readingLogBtn: document.querySelector("#reading-log-btn"),
  readingDialog: document.querySelector("#reading-dialog"),
  readingDialogTitle: document.querySelector("#reading-dialog-title"),
  readingTranscript: document.querySelector("#reading-transcript"),
  stageBackground: document.querySelector("#stage-background"),
  propStage: document.querySelector("#prop-stage"),
  characterStage: document.querySelector("#character-stage"),
  speakerName: document.querySelector("#speaker-name"),
  speakerRole: document.querySelector("#speaker-role"),
  dialogueProgress: document.querySelector("#dialogue-progress"),
  prologueImage: document.querySelector("#prologue-image"),
  prologueNumber: document.querySelector("#prologue-number"),
  prologueKicker: document.querySelector("#prologue-kicker"),
  prologueTitle: document.querySelector("#prologue-title"),
  prologueExcerpt: document.querySelector("#prologue-excerpt"),
  prologueBody: document.querySelector("#prologue-body"),
  prologueSensory: document.querySelector("#prologue-sensory"),
  prologueCta: document.querySelector("#prologue-cta"),
  prologuePrev: document.querySelector("#prologue-prev"),
  prologueNext: document.querySelector("#prologue-next"),
  dayLabel: document.querySelector("#day-label"),
  sceneProgress: document.querySelector("#scene-progress"),
  statList: document.querySelector("#stat-list"),
  routeSignature: document.querySelector("#route-signature"),
  branchSpace: document.querySelector("#branch-space"),
  sceneKicker: document.querySelector("#scene-kicker"),
  sceneTitle: document.querySelector("#scene-title"),
  sceneLocation: document.querySelector("#scene-location"),
  sceneTime: document.querySelector("#scene-time"),
  decisionCode: document.querySelector("#decision-code"),
  decisionMotif: document.querySelector("#decision-motif"),
  branchLabel: document.querySelector("#branch-label"),
  sceneBody: document.querySelector("#scene-body"),
  sceneQuote: document.querySelector("#scene-quote"),
  choiceList: document.querySelector("#choice-list"),
  outcomePanel: document.querySelector("#outcome-panel"),
  outcomeText: document.querySelector("#outcome-text"),
  outcomeNext: document.querySelector("#outcome-next"),
  signalText: document.querySelector("#signal-text"),
  companionList: document.querySelector("#companion-list"),
  rainMeterFill: document.querySelector("#rain-meter-fill"),
  endingGrade: document.querySelector("#ending-grade"),
  endingTitle: document.querySelector("#ending-title"),
  endingEpilogue: document.querySelector("#ending-epilogue"),
  endingSignature: document.querySelector("#ending-signature"),
  endingDominant: document.querySelector("#ending-dominant"),
  endingCount: document.querySelector("#ending-count"),
  badEndArt: document.querySelector("#bad-end-art"),
  badEndImage: document.querySelector("#bad-end-image"),
  badEndImageStatus: document.querySelector("#bad-end-image-status"),
  badEndReview: document.querySelector("#bad-end-review"),
  badEndReason: document.querySelector("#bad-end-reason"),
  badEndHint: document.querySelector("#bad-end-hint"),
  retryFailure: document.querySelector("#retry-failure-btn"),
  retryPreparation: document.querySelector("#retry-preparation-btn"),
  failureRecords: document.querySelector("#failure-records-dialog"),
  failureRecordList: document.querySelector("#failure-record-list"),
  failureRecordPreview: document.querySelector("#failure-record-preview"),
  failureRecordImage: document.querySelector("#failure-record-image"),
  failureRecordTitle: document.querySelector("#failure-record-title"),
  failureRecordBody: document.querySelector("#failure-record-body"),
  restartBtn: document.querySelector("#restart-btn"),
  copyRouteBtn: document.querySelector("#copy-route-btn"),
  tutorialDialog: document.querySelector("#tutorial-dialog"),
  tutorialIndex: document.querySelector("#tutorial-index"),
  tutorialTitle: document.querySelector("#tutorial-title"),
  tutorialIcon: document.querySelector("#tutorial-icon"),
  tutorialBody: document.querySelector("#tutorial-body"),
  tutorialPoints: document.querySelector("#tutorial-points"),
  tutorialDots: document.querySelector("#tutorial-dots"),
  tutorialPrev: document.querySelector("#tutorial-prev"),
  tutorialNext: document.querySelector("#tutorial-next"),
  tutorialStart: document.querySelector("#tutorial-start"),
  soundConsent: document.querySelector("#sound-consent"),
  guideBtn: document.querySelector("#guide-btn"),
  moduleDialog: document.querySelector("#module-dialog"),
  moduleTabs: document.querySelector("#module-tabs"),
  moduleTitle: document.querySelector("#module-title"),
  moduleIntro: document.querySelector("#module-intro"),
  moduleContent: document.querySelector("#module-content"),
  moduleLauncher: document.querySelector(".module-launcher"),
  sourceDialog: document.querySelector("#source-dialog"),
  archiveBtn: document.querySelector("#archive-btn"),
  sourceBtn: document.querySelector("#source-btn"),
  menuDialog: document.querySelector("#menu-dialog"),
  menuBtn: document.querySelector("#menu-btn"),
  soundBtn: document.querySelector("#sound-btn"),
  fullscreenBtn: document.querySelector("#fullscreen-btn"),
  volumeSlider: document.querySelector("#volume-slider"),
  musicTrackInfo: document.querySelector("#music-track-info"),
  musicTrackName: document.querySelector("#music-track-name"),
  musicTrackMeta: document.querySelector("#music-track-meta"),
  resetBtn: document.querySelector("#reset-btn"),
  toast: document.querySelector("#toast"),
  canvas: document.querySelector("#fx-canvas")
};

const RELATION_CAST = Object.freeze([
  "屠亦娆", "楼绎", "燕思静", "俞深", "崔语心", "阮子扬", "尹灏泽"
].map(name => ({ name, role: CHARACTER_ROLES[name] })));

const MAP_MILESTONES = Object.freeze([
  { index: 0, label: "机场" },
  { index: 3, label: "安全屋" },
  { index: 30, label: "断电" },
  { index: 41, label: "避难所" },
  { index: 46, label: "研究所" }
]);

const SCENE_ART = {
  classroom: { src: "./public/assets/v2/scenes/classroom.png", label: "X大学生物工程课堂", cg: true },
  canteen: { src: "./public/assets/v2/scenes/canteen.png", label: "X大学食堂", cg: true },
  airport: {
    src: "./public/assets/v2/scenes/airport.png",
    label: "机场停车场",
    cg: true,
    objectPosition: "center 20%"
  },
  returnStop: {
    src: "./public/assets/v2/scenes/fcity.png",
    label: "返程停车点外侧道路",
    cg: true,
    objectPosition: "center 58%"
  },
  safehouse: { src: "./public/assets/v2/scenes/safehouse.png", label: "二十楼安全屋", cg: false },
  fcity: { src: "./public/assets/v2/scenes/fcity.png", label: "F市封锁线", cg: true },
  tower: { src: "./public/assets/v2/scenes/tower.png", label: "二十楼窗外的丧尸高塔", cg: true },
  window: { src: "./public/assets/v2/scenes/window-king.png", label: "智慧感染者敲响二十楼窗户", cg: true },
  cold: { src: "./public/assets/v2/scenes/cold-night.png", label: "停电后的寒夜", cg: true },
  helicopter: { src: "./public/assets/v2/scenes/helicopter.png", label: "无国旗直升机逼近高层住宅", cg: true },
  shelter: { src: "./public/assets/v2/scenes/shelter-letter.png", label: "避难所里的父亲来信", cg: true },
  lab: { src: "./public/assets/v2/scenes/lab-corridor.png", label: "国家病毒研究所走廊", cg: false },
  eighth: { src: "./public/assets/v2/scenes/eighth-floor.png", label: "研究所八楼核心实验室", cg: true },
  stockedSafehouse: {
    src: "./public/assets/prologue/05-safehouse.png",
    label: "完成囤货后的二十楼安全屋",
    cg: true,
    objectPosition: "center 54%"
  },
  warning: { src: "./public/assets/prologue/01-warning.png", label: "重生预警与城市路线", cg: true },
  redRain: { src: "./public/assets/prologue/02-red-rain.png", label: "暴雨覆盖城市天际线", cg: true },
  fourCalls: { src: "./public/assets/prologue/04-four-calls.png", label: "四条联络线路同时接通", cg: true }
};

const SCENE_ART_KEY_BY_ID = Object.freeze({
  "proof-cui-record": "classroom",
  "proof-hospital-watch": "canteen",
  "proof-death-account": "returnStop",
  "stock-food-line": "stockedSafehouse",
  "stock-medical-line": "stockedSafehouse",
  "stock-recon-line": "stockedSafehouse",
  "cui-call-forensics": "fourCalls"
});

const SCENE_ART_KEY_BY_ROOT_ID = Object.freeze({
  "f-city-alert": "redRain",
  "zombie-tower": "tower",
  "window-knock": "window",
  "glass-dialogue": "window",
  "window-king": "window",
  "phone-gift": "window",
  "cold-sick": "cold",
  "city-blackout": "cold",
  "cold-night-talk": "cold",
  "military-channel": "fourCalls",
  "false-army": "helicopter"
});

const PROP_ART = Object.freeze({
  carKeys: {
    src: "./public/assets/v2/props/prop-car-keys.png",
    label: "阮子扬带走的车钥匙"
  },
  techBag: {
    src: "./public/assets/v2/props/prop-louyi-tech-bag.png",
    label: "楼绎的无人机设备包"
  },
  medicalKit: {
    src: "./public/assets/v2/props/prop-medical-kit.png",
    label: "燕思静整理的医疗包"
  },
  goBoard: {
    src: "./public/assets/v2/props/prop-yushen-go-board.png",
    label: "俞深留下的围棋盘"
  }
});

const PROP_KEYS_BY_ID = Object.freeze({
  "stock-medical-line": ["medicalKit"],
  "stock-recon-line": ["techBag"],
  "departure-lockdown-line": ["carKeys"],
  "drone-signal-trace": ["techBag"],
  "rescue-triage": ["medicalKit"]
});

const PROP_KEYS_BY_ROOT_ID = Object.freeze({
  "empty-garage": ["carKeys"]
});

const TUTORIAL_STEPS = [
  {
    title: "先读，再选",
    icon: "./public/assets/v2/ui/continue-indicator.png",
    body: "每章先读完屠亦娆眼前的事，再选一个动作。结果会立刻写在正文下方，确认后进入下一章。",
    points: ["按 1 / 2 / 3 选择", "按 Enter 收下结果", "五十步走完一轮旅程"]
  },
  {
    title: "看舞台与说话的人",
    icon: "./public/assets/v2/ui/foreground-frame-corner.png",
    body: "场景区保留人物与地点，底部承接正文与对白。箭头翻阅段落，顶栏书本打开本章全文，选择会带来新的行动结果。",
    points: ["场景左侧放选择", "手机端向下查看选项", "每段保留说话人的姓名"]
  },
  {
    title: "五项状态",
    icon: "./public/assets/v2/ui/progress-marker.png",
    body: "同伴、储备、情报、研究、行动会随选择增减。它们记录你走过的路，也决定最后落在哪个结局。",
    points: ["状态栏显示当前数值", "行动后续通过剧情呈现", "单项数值再高也会留下短板"]
  },
  {
    title: "上一章会改变下一章",
    icon: "./public/assets/v2/ui/transition-texture.png",
    body: "你刚做的动作会在下一章留下痕迹。同一处危机，同行、筹备和求证三种走法会带来各自的地点、对话与难题。",
    points: ["上一章的结果会接进正文", "每章仍有三个可做的动作", "第五十次选择通向结局"]
  },
  {
    title: "打开生存档案",
    icon: RETRO_ASSETS["ui-map"] || "./public/assets/v2/ui/icon-map.png",
    body: "档案用来回看手上的东西、走过的地方、同行者和研究线索。打开后仍留在当前剧情。",
    points: ["物资页看余量", "地图页看节点", "关系与研究页随章节更新"]
  },
  {
    title: "关系与研究",
    icon: RETRO_ASSETS["ui-relations"] || "./public/assets/v2/ui/icon-relationship.png",
    body: "关系页记录同行者的联系强度，研究页收拢病毒、智慧感染者与伪军线索。两页都供你回看线索，当前剧情会从原处接续。",
    points: ["关系强度来自同行与选择", "研究进度读取情报与研究值", "档案内容跟着章节更新"]
  },
  {
    title: "保存与回看",
    icon: RETRO_ASSETS["ui-inventory"] || "./public/assets/v2/ui/icon-inventory.png",
    body: "浏览器会记住当前章节和走法。顶栏可打开引导、档案、来源与控制台，回来后可以接着读。",
    points: ["F 键切换全屏", "问号重看引导", "控制台可调音量或清除当前存档"]
  }
];

const MODULE_COPY = {
  inventory: { title: "物资档案", intro: "把储备换成眼下能用的水、药、电与食物，给下一步留一眼余地。" },
  map: { title: "路线地图", intro: "标出当前地点、危机烈度和已走节点，帮你记住队伍走到了哪里。" },
  relations: { title: "人物关系", intro: "记录同行者的联系强度，看看谁在靠近，谁还隔着一句话。" },
  research: { title: "研究档案", intro: "收拢病毒、智慧感染者和伪军线索，进度来自你走过的正文。" }
};

let tutorialStep = 0;

function renderTutorial() {
  const step = TUTORIAL_STEPS[tutorialStep];
  elements.tutorialIndex.textContent = `${String(tutorialStep + 1).padStart(2, "0")} / ${String(TUTORIAL_STEPS.length).padStart(2, "0")}`;
  elements.tutorialTitle.textContent = step.title;
  elements.tutorialIcon.src = step.icon;
  elements.tutorialBody.textContent = step.body;
  elements.tutorialPoints.replaceChildren(...step.points.map((point, index) => {
    const item = document.createElement("p");
    item.innerHTML = `<b>${String(index + 1).padStart(2, "0")}</b><span></span>`;
    item.querySelector("span").textContent = point;
    return item;
  }));
  elements.tutorialDots.replaceChildren(...TUTORIAL_STEPS.map((_, index) => {
    const dot = document.createElement("i");
    dot.classList.toggle("active", index === tutorialStep);
    return dot;
  }));
  elements.tutorialPrev.disabled = tutorialStep === 0;
  const last = tutorialStep === TUTORIAL_STEPS.length - 1;
  elements.tutorialNext.hidden = last;
  elements.tutorialStart.hidden = !last;
}

function getCompanionLink(index) {
  const routeAffinity = state.route.reduce((sum, value, routeIndex) => sum + ((value + routeIndex + index) % 3 === 0 ? 3 : 0), 0);
  return Math.min(99, Math.round(28 + state.stats.trust * 0.12 + routeAffinity));
}

function createModuleArtGallery(type, scene) {
  let artwork = [];
  let mode = "transparent";
  if (type === "inventory") {
    const collected = [
      [1, "手机"], [4, "门禁卡"], [7, "棋盒与画板"], [15, "绒里手套"],
      [17, "素描本"], [24, "补给袋"], [27, "旧手机"], [32, "U盘"],
      [33, "对讲机"], [35, "行李"], [44, "父亲的信"], [46, "纸条"]
    ];
    artwork = collected.filter(([decision]) => decision <= state.sceneIndex + 1)
      .map(([decision, label]) => ({ src: RETRO_ASSETS[`d${String(decision).padStart(2, "0")}-prop`], label }))
      .filter(item => item.src).slice(-6);
    if (!artwork.length) artwork = Object.values(PROP_ART).map(({ src, label }) => ({ src, label }));
  }
  if (type === "relations") {
    artwork = RELATION_CAST.map((item) => ({
      src: getCharacterPortrait(item.name, state.sceneIndex).source,
      label: item.name,
      initial: item.name[0]
    }));
  }
  if (type === "research") {
    const discoveries = [[3, "联络记录"], [18, "人物履历"], [32, "父母留下的U盘"], [33, "录音"], [44, "家书"], [47, "培养皿"]];
    artwork = discoveries.filter(([decision]) => decision <= state.sceneIndex + 1)
      .map(([decision, label]) => ({ src: RETRO_ASSETS[`d${String(decision).padStart(2, "0")}-prop`], label }))
      .filter(item => item.src).slice(-4);
  }
  if (type === "map") {
    artwork = [{ src: getDecisionArt(state.sceneIndex).background, label: scene.location }];
    mode = "opaque map";
  }

  const gallery = document.createElement("div");
  gallery.className = `module-art-gallery ${type} ${mode}`;
  gallery.dataset.moduleArt = type;
  gallery.replaceChildren(...artwork.map(({ src, label, initial }) => {
    const figure = document.createElement("figure");
    const caption = document.createElement("figcaption");
    caption.textContent = label;
    if (src) {
      const image = document.createElement("img");
      image.src = src;
      image.alt = label;
      image.loading = "eager";
      image.decoding = "async";
      figure.append(image);
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "module-art-placeholder";
      placeholder.textContent = initial;
      placeholder.setAttribute("aria-label", label + "暂缺单独立绘");
      figure.append(placeholder);
    }
    figure.append(caption);
    return figure;
  }));

  if (type === "map") {
    const routeMap = document.createElement("div");
    routeMap.className = "module-route-map";
    const currentMilestonePosition = MAP_MILESTONES.reduce(
      (active, milestone, index) => state.sceneIndex >= milestone.index ? index : active,
      0
    );
    const currentMilestone = MAP_MILESTONES[currentMilestonePosition].index;
    routeMap.style.setProperty(
      "--route-progress",
      `${Math.round(currentMilestonePosition / (MAP_MILESTONES.length - 1) * 100)}%`
    );
    routeMap.replaceChildren(...MAP_MILESTONES.map((milestone) => {
      const node = document.createElement("span");
      const dot = document.createElement("i");
      const label = document.createElement("b");
      node.classList.toggle("reached", state.sceneIndex >= milestone.index);
      node.classList.toggle("current", currentMilestone === milestone.index);
      label.textContent = milestone.label;
      node.append(dot, label);
      return node;
    }));
    gallery.append(routeMap);
  }
  return gallery;
}

function renderModule(type) {
  const definition = MODULE_COPY[type] || MODULE_COPY.inventory;
  const scene = getCurrentScene() || SCENES[0];
  elements.moduleTitle.textContent = definition.title;
  elements.moduleIntro.textContent = definition.intro;
  elements.moduleTabs.querySelectorAll("[data-module]").forEach((button) => {
    button.classList.toggle("active", button.dataset.module === type);
  });
  let rows = [];
  if (type === "inventory") rows = [
    ["安全屋余量", `${state.stats.supply}%`],
    ["眼下能用", state.stats.supply >= 55 ? "水、药与电力够用" : "先补水、药与电力"],
    ["下一次核对", "净水 / 药品 / 电力"]
  ];
  if (type === "map") rows = [
    ["当前位置", scene.location],
    ["危机烈度", `${scene.rain}%`],
    ["已走章节", `${state.sceneIndex + 1} / ${SCENES.length}`]
  ];
  if (type === "relations") rows = RELATION_CAST.map((item, index) => [item.name, `${getCompanionLink(index)}% · ${item.role}`]);
  if (type === "research") rows = [
    ["情报完整度", `${state.stats.memory}%`],
    ["研究进度", `${state.stats.signal}%`],
    ["当前线索", scene.signal]
  ];
  const gallery = createModuleArtGallery(type, scene);
  elements.moduleContent.replaceChildren(gallery, ...rows.map(([label, value]) => {
    const row = document.createElement("div");
    row.className = "module-row";
    row.innerHTML = "<b></b><span></span>";
    row.querySelector("b").textContent = label;
    row.querySelector("span").textContent = value;
    return row;
  }));
}

function openModule(type) {
  renderModule(type);
  elements.moduleDialog.showModal();
}

function getSceneArtKey(scene) {
  const id = scene.id || "";
  const rootId = id.split("--")[0];
  const title = scene.title || "";
  const location = scene.location || "";
  const explicitKey = scene.artKey || SCENE_ART_KEY_BY_ID[id] || SCENE_ART_KEY_BY_ROOT_ID[rootId];
  if (explicitKey && SCENE_ART[explicitKey]) return explicitKey;
  if (id === "eighth-floor" || /八楼|咖啡|停电/.test(title)) return "eighth";
  if (/研究所|实验室/.test(location)) return "lab";
  if (/避难所/.test(location) || /照片背面|信件|父亲/.test(title)) return "shelter";
  if (/直升机|伪军/.test(title)) return "helicopter";
  if (/断电|寒夜|录音/.test(title)) return "cold";
  if (/窗外有人敲|旧手机|智慧个体/.test(title)) return "window";
  if (/丧尸.*梯|人形高塔|塔/.test(title)) return "tower";
  if (/城际服务区|返程停车点/.test(location)) return "returnStop";
  if (/F市|封锁线/.test(location + title)) return "fcity";
  if (/机场|停车场|越野车/.test(location)) return "airport";
  if (/食堂/.test(location)) return "canteen";
  if (/课堂|教学楼/.test(location)) return "classroom";
  return "safehouse";
}

function getSceneArt(scene) {
  return SCENE_ART[getSceneArtKey(scene)];
}

function getScenePropKeys(scene) {
  const id = scene.id || "";
  const rootId = id.split("--")[0];
  return PROP_KEYS_BY_ID[id] || PROP_KEYS_BY_ROOT_ID[rootId] || [];
}

function createSceneProp(key, index) {
  const definition = PROP_ART[key];
  const image = document.createElement("img");
  image.className = `scene-prop ${index === 0 ? "primary" : "secondary"}`;
  image.src = definition.src;
  image.alt = definition.label;
  image.decoding = "async";
  image.dataset.prop = key;
  return image;
}

function createDecisionProp(source, fallbackKey, index = 0, label = null) {
  const fallback = PROP_ART[fallbackKey] || PROP_ART.goBoard;
  const image = document.createElement("img");
  image.className = `scene-prop ${index === 0 ? "primary" : "secondary"}`;
  image.src = source || fallback.src;
  image.alt = label || fallback.label;
  image.decoding = "async";
  image.dataset.prop = source || fallback.src;
  image.dataset.decisionProp = source || "fallback";
  if (source) {
  image.addEventListener("error", () => {
      if (image.dataset.fallback === "true") return;
      image.src = fallback.src;
      image.dataset.fallback = "true";
      image.dataset.decisionProp = "fallback";
    });
  }
  return image;
}

function setBackgroundSource(source, fallback, label) {
  elements.stageBackground.alt = label;
  elements.stageBackground.dataset.asset = source || fallback;
  elements.stageBackground.dataset.fallbackAsset = fallback || "";
  elements.stageBackground.dataset.fallback = "false";
  elements.stageBackground.onerror = () => {
    if (elements.stageBackground.dataset.fallback === "true" || !fallback) return;
    elements.stageBackground.dataset.fallback = "true";
    elements.stageBackground.dataset.asset = fallback;
    elements.stageBackground.src = fallback;
  };
  elements.stageBackground.src = source || fallback;
}

function renderStage(scene) {
  const artKey = getSceneArtKey(scene);
  const art = getSceneArt(scene);
  const decisionArt = getDecisionArt(state.sceneIndex);
  elements.gameView.dataset.decisionUi = decisionArt.id;
  elements.gameView.dataset.frame = decisionArt.frame;
  elements.gameView.dataset.choiceStyle = decisionArt.choiceStyle;
  elements.gameView.dataset.portraitSide = decisionArt.portraitSide;
  elements.gameView.dataset.headingStyle = decisionArt.heading;
  elements.gameView.style.setProperty("--decision-accent", decisionArt.accent);
  elements.gameView.style.setProperty("--decision-accent-deep", decisionArt.accentDeep);
  elements.gameView.style.setProperty("--decision-secondary", decisionArt.secondary);
  elements.gameView.style.setProperty("--decision-grid", `${decisionArt.grid}px`);
  elements.gameView.style.setProperty("--decision-angle", `${decisionArt.angle}deg`);
  elements.gameView.style.setProperty("--decision-notch", `${decisionArt.notch}px`);
  elements.gameView.style.setProperty("--decision-portrait-height", `${decisionArt.portraitHeight}%`);
  elements.gameView.style.setProperty("--decision-portrait-shift", `${decisionArt.portraitShift}%`);
  elements.decisionCode.textContent = decisionArt.id;
  elements.decisionMotif.textContent = decisionArt.motif;
  setBackgroundSource(decisionArt.background, art.src, art.label);
  elements.stageBackground.style.objectPosition = art.objectPosition || "";
  elements.storyStage.dataset.art = artKey;
  elements.storyStage.dataset.artMode = art.cg ? "cg" : "portrait";
  elements.storyStage.dataset.uiSignature = decisionArt.uiSignature;
  elements.dialogueProgress.textContent = `${String(state.sceneIndex + 1).padStart(2, "0")} / ${SCENES.length}`;

  const propKeys = getScenePropKeys(scene);
  const fallbackPropKey = propKeys[0] || "goBoard";
  const decisionProp = createDecisionProp(decisionArt.prop, fallbackPropKey, 0, decisionArt.propLabel);
  const hasReviewedProp = Object.values(RETRO_ASSETS).includes(decisionArt.prop);
  const legacyProps = hasReviewedProp ? [] : propKeys.map((key, index) => createSceneProp(key, index + 1));
  elements.propStage.replaceChildren(decisionProp, ...legacyProps);
  elements.propStage.dataset.count = String(1 + legacyProps.length);
  elements.propStage.dataset.assets = [decisionArt.prop, ...(hasReviewedProp ? [] : propKeys)].filter(Boolean).join(",");
  elements.propStage.dataset.portraitSide = decisionArt.portraitSide;

}

const audio = new RebirthWeekAudio();
let toastTimer = null;
let simTime = 0;
let lastFrame = performance.now();

function saveAudioPreferences() {
  if (EMBEDDED) return;
  localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify({ volume: audio.getSnapshot().volume }));
}

try {
  const saved = EMBEDDED ? null : JSON.parse(localStorage.getItem(AUDIO_PREFS_KEY));
  const volume = Number(saved?.volume);
  if (Number.isFinite(volume) && volume >= 0 && volume <= 100) {
    audio.setVolume(volume / 100);
    elements.volumeSlider.value = String(volume);
  }
} catch { /* A damaged preference must not prevent opening the story. */ }

function freshState() {
  return {
    mode: "prologue",
    prologueIndex: 0,
    tutorialSeen: false,
    sceneIndex: 0,
    stats: { ...INITIAL_STATS },
    route: [],
    outcome: null,
    endingId: null,
    readingCursor: null,
    pendingBadEnd: null,
    retryCheckpoint: null,
    preparationCheckpoints: {}
  };
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!parsed || !["prologue", "game", "ending"].includes(parsed.mode)) return freshState();
    return {
      ...freshState(),
      ...parsed,
      stats: { ...INITIAL_STATS, ...parsed.stats },
      route: Array.isArray(parsed.route) ? parsed.route : []
    };
  } catch {
    return freshState();
  }
}

function loadSeenEndings() {
  try {
    const parsed = JSON.parse(localStorage.getItem(ENDINGS_KEY));
    return Array.isArray(parsed) ? [...new Set(parsed.filter((id) => ALL_ENDING_DEFS.some((ending) => ending.id === id)))] : [];
  } catch {
    return [];
  }
}

let state = EMBEDDED ? freshState() : loadState();
let seenEndings = EMBEDDED ? [] : loadSeenEndings();

function getCurrentScene() {
  return getSceneForRoute(state.sceneIndex, state.route);
}

function getCurrentEnding() {
  return ALL_ENDING_DEFS.find(item => item.id === state.endingId) || resolveEnding(state.stats, state.route);
}

function getFailureArt(ending) {
  return BAD_END_ART[ending.id] || getDecisionArt(ending.index).background;
}

function saveState() {
  if (EMBEDDED) { bridge?.checkpoint(); return; }
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("show"), 1800);
}

function setMode(mode) {
  elements.prologueView.hidden = mode !== "prologue";
  elements.gameView.hidden = mode !== "game";
  elements.endingView.hidden = mode !== "ending";
  document.body.dataset.mode = mode;
}

function getMusicTrackForState() {
  if (state.mode === "ending") return BAD_ENDINGS.some(item => item.id === state.endingId) ? "collapse" : "dawn";
  if (state.mode === "prologue") return state.prologueIndex < 2 ? "rewind" : "watch";
  if (state.pendingBadEnd) return "collapse";
  return state.sceneIndex >= 32 ? "pursuit" : "watch";
}

function renderMusicStatus() {
  const score = audio.getSnapshot();
  elements.musicTrackInfo.dataset.track = score.track;
  elements.musicTrackName.textContent = score.title;
  elements.musicTrackMeta.textContent = `交响配乐 / ${score.tempo} BPM / ${score.bars} 小节`;
}

function render() {
  setMode(state.mode);
  if (state.mode !== "game") readingIdentity = "";
  if (state.mode === "prologue") renderPrologue();
  if (state.mode === "game") renderScene();
  if (state.mode === "ending") renderEnding();
  elements.soundBtn.setAttribute("aria-pressed", String(audio.enabled));
  renderIcons();
  audio.setTrack(getMusicTrackForState());
  audio.setMood(state.mode === "prologue" ? state.prologueIndex / PROLOGUE.length : state.sceneIndex / SCENES.length);
  renderMusicStatus();
  drawCanvas();
}

function renderIcons() {
  const icon = document.createElement("i");
  icon.dataset.lucide = audio.enabled ? "volume-2" : "volume-x";
  elements.soundBtn.replaceChildren(icon);
  window.lucide.createIcons({ attrs: { "aria-hidden": "true", "stroke-width": 1.5 } });
}

let readingIdentity = "";
let readingPages = [];
let readingIndex = 0;
let portraitRequest = 0;
let readingReachedEnd = false;
let revealedSpan;
let remainingSpan;
const reader = new ReaderReveal();
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
try {
  const saved = EMBEDDED ? null : JSON.parse(localStorage.getItem(READING_PREFS_KEY));
  if (Object.hasOwn(READING_SPEEDS, saved?.speed)) elements.readingSpeed.value = saved.speed;
  elements.readingReducedMotion.checked = saved?.reducedMotion === true;
} catch { /* A damaged preference must not prevent opening the story. */ }

function renderReadingPortrait(page) {
  const selection = getReadingPortrait(state.sceneIndex, page);
  const stage = elements.characterStage;
  const selectionKey = JSON.stringify([selection.character, selection.pose, selection.source]);
  if (stage.dataset.selection === selectionKey) return;
  stage.dataset.selection = selectionKey;
  const request = ++portraitRequest;
  stage.replaceChildren();
  stage.dataset.character = "";
  stage.dataset.asset = "";
  stage.dataset.count = "0";
  stage.dataset.expectedCharacter = selection.character;
  stage.dataset.reaction = String(selection.pose === "reaction");
  stage.dataset.status = selection.presentation;
  if (!selection.source) return;

  const image = document.createElement("img");
  image.className = `character-portrait active decision-specific ${selection.pose}`;
  image.alt = `${selection.character}人物立绘`;
  image.decoding = "async";
  image.hidden = true;
  image.dataset.character = selection.character;
  image.dataset.reaction = String(selection.pose === "reaction");
  let candidate = 0;
  stage.dataset.status = "loading";
  const tryNextSource = () => {
    if (request !== portraitRequest) return;
    candidate += 1;
    if (candidate < selection.sources.length) {
      image.dataset.fallback = "true";
      image.src = selection.sources[candidate];
    } else {
      image.remove();
      stage.dataset.status = "unavailable";
    }
  };
  // Discard late loads after a page change; a previous speaker must never flash back in.
  image.addEventListener("load", async () => {
    if (request !== portraitRequest) return;
    const attempt = candidate;
    try { await image.decode(); }
    catch {
      if (request === portraitRequest && attempt === candidate) tryNextSource();
      return;
    }
    if (request !== portraitRequest || attempt !== candidate) return;
    image.hidden = false;
    stage.dataset.character = selection.character;
    stage.dataset.asset = image.getAttribute("src");
    stage.dataset.count = "1";
    stage.dataset.status = "ready";
  });
  image.addEventListener("error", tryNextSource);
  image.src = selection.source;
  stage.append(image);
}

function renderReading({ instant = false } = {}) {
  const page = readingPages[readingIndex];
  if (!page) return;
  const dialogue = page.kind === "dialogue";
  elements.sceneBody.hidden = dialogue;
  elements.sceneQuote.hidden = !dialogue;
  elements.sceneBody.replaceChildren();
  elements.sceneQuote.replaceChildren();
  revealedSpan = document.createElement("span");
  remainingSpan = document.createElement("span");
  remainingSpan.className = "reading-unrevealed";
  revealedSpan.setAttribute("aria-hidden", "true");
  remainingSpan.setAttribute("aria-hidden", "true");
  (dialogue ? elements.sceneQuote : elements.sceneBody).append(revealedSpan, remainingSpan);
  elements.readingAnnouncement.textContent = `${page.speaker}：${page.text}`;
  reader.start(page.text, { speed: elements.readingSpeed.value, instant: instant || motionReduced() });
  elements.speakerName.textContent = page.speaker;
  elements.speakerRole.textContent = CHARACTER_ROLES[getSpeakerIdentity(page.speaker)] || "";
  renderReadingPortrait(page);
  elements.readingProgress.textContent = `${String(readingIndex + 1).padStart(2, "0")} / ${String(readingPages.length).padStart(2, "0")}`;
  elements.readingPrev.disabled = readingIndex === 0;
  elements.dialogueCopy.scrollTop = 0;
  updateReadingReveal();
}

function moveReading(offset) {
  const next = Math.max(0, Math.min(readingPages.length - 1, readingIndex + offset));
  if (next === readingIndex) return;
  readingIndex = next;
  renderReading({ instant: offset < 0 });
}

function updateReadingReveal() {
  revealedSpan.textContent = reader.visibleText;
  remainingSpan.textContent = reader.remainingText;
  const last = readingIndex === readingPages.length - 1;
  if (reader.complete && last) readingReachedEnd = true;
  elements.dialogueZone.dataset.revealing = String(!reader.complete);
  const label = !reader.complete ? "显示全文" : !last ? "继续" : !state.outcome ? "选择" : state.pendingBadEnd ? "查看失败结局" : state.sceneIndex === SCENES.length - 1 ? "查看结局" : "继续下一章";
  elements.readingAdvance.querySelector("span").textContent = label;
  elements.readingAdvance.setAttribute("aria-label", label);
  elements.choiceList.hidden = Boolean(state.outcome) || !readingReachedEnd;
  elements.choiceList.querySelectorAll("button").forEach(button => { button.disabled = !readingReachedEnd; });
  elements.outcomeNext.disabled = !state.outcome || !readingReachedEnd;
  const cursor = { identity: readingIdentity, page: readingIndex, complete: reader.complete, reachedEnd: readingReachedEnd };
  if (JSON.stringify(state.readingCursor) !== JSON.stringify(cursor)) {
    state.readingCursor = cursor;
    saveState();
  }
}

function motionReduced() { return reducedMotion.matches || elements.readingReducedMotion.checked; }

function saveReadingPreferences() {
  if (EMBEDDED) return;
  localStorage.setItem(READING_PREFS_KEY, JSON.stringify({ speed: elements.readingSpeed.value, reducedMotion: elements.readingReducedMotion.checked }));
}

function advanceReading() {
  if (state.mode !== "game" || document.querySelector("dialog[open]")) return;
  if (!reader.complete) {
    reader.finish();
    updateReadingReveal();
  } else if (readingIndex < readingPages.length - 1) {
    moveReading(1);
  } else if (state.outcome) {
    advanceScene();
  } else {
    elements.choiceList.scrollIntoView({ block: "nearest", behavior: "instant" });
    elements.choiceList.querySelector("button")?.focus({ preventScroll: true });
  }
}

function advanceReaderTime(milliseconds) {
  if (state.mode !== "game" || document.hidden || document.querySelector("dialog[open]")) return;
  if (reader.advance(milliseconds)) updateReadingReveal();
}

function openTranscript() {
  const scene = getCurrentScene();
  const prologue = PROLOGUE[state.prologueIndex];
  const ending = getCurrentEnding();
  const title = state.mode === "game" ? scene.title : state.mode === "prologue" ? prologue.title : ending.title;
  const paragraphs = state.mode === "game"
    ? [scene.body, scene.quote, ...(state.outcome ? [state.outcome] : [])]
    : state.mode === "prologue" ? [prologue.excerpt, ...[].concat(prologue.body), prologue.sensory] : [ending.epilogue];
  elements.readingDialogTitle.textContent = title;
  elements.readingTranscript.replaceChildren(...paragraphs.map(text => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    return paragraph;
  }));
  elements.readingDialog.showModal();
  elements.readingDialog.scrollTop = 0;
}

function renderPrologue() {
  const page = PROLOGUE[state.prologueIndex] || PROLOGUE[0];
  const paragraphs = Array.isArray(page.body) ? page.body : [page.body];
  elements.prologueView.scrollTop = 0;
  elements.prologueCopy.scrollTop = 0;
  elements.prologueView.dataset.copySide = page.copySide || "left";
  elements.prologueNumber.textContent = String(page.page).padStart(2, "0");
  elements.prologueKicker.textContent = page.kicker;
  elements.prologueTitle.textContent = page.title;
  elements.prologueExcerpt.textContent = page.excerpt;
  elements.prologueBody.replaceChildren(...paragraphs.map((text) => {
    const paragraph = document.createElement("p");
    paragraph.textContent = text;
    return paragraph;
  }));
  elements.prologueSensory.textContent = page.sensory;
  elements.prologueCta.textContent = page.cta;
  elements.prologueImage.hidden = false;
  elements.prologueImage.alt = page.alt;
  elements.prologueImage.src = RETRO_ASSETS[`prologue-${String(page.page).padStart(2, "0")}`] || page.image;
  elements.prologueImage.style.setProperty("--scene-focus", page.focus || "center");
  elements.prologueImage.style.setProperty("--scene-focus-mobile", page.mobileFocus || page.focus || "center");
  elements.prologueImage.dataset.mobileFit = page.mobileFit || "cover";
  elements.prologueImage.onerror = () => {
    elements.prologueImage.hidden = true;
  };
  elements.prologueNext.dataset.last = String(state.prologueIndex === PROLOGUE.length - 1);
  elements.prologuePrev.hidden = state.prologueIndex === 0;
}

function renderStats() {
  elements.statList.replaceChildren(...STAT_DEFS.map((definition) => {
    const row = document.createElement("div");
    row.className = "stat-row";
    row.innerHTML = `<span>${definition.label}</span><b>${state.stats[definition.key]}</b><div class="stat-track"><i></i></div>`;
    row.querySelector("i").style.width = `${Math.min(100, state.stats[definition.key] / 6)}%`;
    return row;
  }));
}

function renderRouteSignature() {
  const fullSignature = getRouteSignature(state.route);
  const [, step, payload] = fullSignature.split("-");
  const compactSignature = `${step}·${payload.slice(0, 4)}…${payload.slice(-4)}`;
  elements.routeSignature.textContent = window.innerWidth <= 700 ? compactSignature : fullSignature;
  elements.routeSignature.title = fullSignature;
  elements.branchSpace.textContent = "20 种生还 / 8 种失败";
  elements.branchSpace.title = `${DANGER_ROUTE_COUNTS.sequences.toLocaleString("zh-CN")} 条可抵达最后一幕的场景序列`;
}

function renderScene() {
  const scene = getCurrentScene();
  if (!scene) return finishGame();
  renderStage(scene);
  elements.dayLabel.textContent = scene.day;
  elements.sceneProgress.textContent = `${String(state.sceneIndex + 1).padStart(2, "0")} / ${SCENES.length}`;
  renderRouteSignature();
  elements.sceneKicker.textContent = scene.kicker;
  elements.sceneTitle.textContent = scene.title;
  elements.sceneLocation.textContent = scene.location;
  elements.sceneTime.textContent = scene.time;
  elements.branchLabel.hidden = !scene.branch;
  elements.branchLabel.textContent = scene.branch ? `分支 / ${scene.branch}` : "";
  elements.storyStage.dataset.branch = scene.branch || "共同线";
  const identity = `${scene.id}:${state.outcome || ""}`;
  let instant = reader.complete;
  if (readingIdentity !== identity) {
    readingIdentity = identity;
    readingPages = createReadingPages(scene, state.outcome);
    readingIndex = state.outcome ? readingPages.findIndex(page => page.kind === "outcome") : 0;
    readingReachedEnd = false;
    instant = false;
    const cursor = state.readingCursor;
    if (cursor?.identity === identity && Number.isInteger(cursor.page) && cursor.page >= 0 && cursor.page < readingPages.length) {
      readingIndex = cursor.page;
      instant = cursor.complete === true;
      readingReachedEnd = cursor.reachedEnd === true;
    }
  }
  renderReading({ instant });
  elements.signalText.textContent = scene.signal;
  elements.signalText.title = scene.signal;
  elements.rainMeterFill.style.width = `${scene.rain}%`;
  renderStats();
  renderCompanions();

  const locked = Boolean(state.outcome);
  elements.choiceList.hidden = locked;
  elements.choiceList.replaceChildren(...scene.choices.map((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "choice-btn";
    button.dataset.choice = String(index);
    button.dataset.risk = String(Boolean(item.risk));
    button.innerHTML = `<span class="choice-index">0${index + 1}</span><span class="choice-copy"></span><i class="choice-arrow" data-lucide="arrow-right"></i>`;
    button.querySelector(".choice-copy").textContent = item.label;
    const note = item.risk
      ? `险行 · ${item.prepared ? "已有接应准备" : "可能中断此行"}`
      : item.preparation;
    if (note) {
      const hint = document.createElement("span");
      hint.className = "choice-effect";
      hint.textContent = note;
      button.classList.add("has-choice-note");
      button.insertBefore(hint, button.querySelector(".choice-arrow"));
    }
    return button;
  }));

  elements.outcomePanel.hidden = !locked;
  elements.outcomeText.textContent = state.pendingBadEnd ? "此行走到了另一种结果" : "";
  elements.outcomeText.hidden = !state.pendingBadEnd;
  const finalChapter = state.sceneIndex === SCENES.length - 1;
  elements.outcomeNext.querySelector("span").textContent = state.pendingBadEnd ? "查看失败结局" : finalChapter ? "查看你的结局" : "继续下一章";
  updateReadingReveal();
}

function renderCompanions() {
  elements.companionList.replaceChildren(...COMPANIONS.map((companion, index) => {
    const link = getCompanionLink(index);
    const item = document.createElement("div");
    item.className = "companion";
    item.innerHTML = `<span class="companion-avatar"></span><span>${companion.name}<small></small></span><b>${link}%</b>`;
    item.querySelector(".companion-avatar").textContent = companion.name[0];
    item.querySelector("small").textContent = companion.role;
    return item;
  }));
}

function choose(index) {
  if (state.outcome || !readingReachedEnd || state.mode !== "game" || document.querySelector("dialog[open]")) return;
  const scene = getCurrentScene();
  const selected = scene.choices[index];
  if (!selected) return;
  const checkpoint = { sceneIndex: state.sceneIndex, stats: { ...state.stats }, route: [...state.route], readingCursor: { ...state.readingCursor } };
  const preparationSteps = preparationsAt(state.sceneIndex);
  state.preparationCheckpoints ||= {};
  for (const preparation of preparationSteps) state.preparationCheckpoints[preparation.id] = checkpoint;
  const failure = resolveDanger(state.sceneIndex, index, state.route);
  state.pendingBadEnd = failure?.id || null;
  state.retryCheckpoint = failure ? checkpoint : null;
  state.stats = applyEffects(state.stats, selected.effects);
  state.route.push(index);
  state.outcome = selected.response;
  audio.click(1.2);
  saveState();
  render();
  elements.dialogueZone.scrollIntoView({ behavior: "instant", block: "nearest" });
}

function advanceScene() {
  if (state.mode !== "game" || !state.outcome || !readingReachedEnd || document.querySelector("dialog[open]")) return;
  audio.click(0.8);
  if (state.pendingBadEnd) {
    finishGame(BAD_ENDINGS.find(ending => ending.id === state.pendingBadEnd));
    return;
  }
  if (state.sceneIndex >= SCENES.length - 1) {
    finishGame();
    return;
  }
  state.sceneIndex += 1;
  state.outcome = null;
  saveState();
  render();
  elements.gameView?.scrollTo?.({ top: 0, behavior: "auto" });
  elements.storyStage?.scrollTo?.({ top: 0, behavior: "auto" });
  elements.dialogueZone?.scrollTo({ top: 0, behavior: "instant" });
  window.scrollTo?.({ top: 0, behavior: "auto" });
}

function finishGame(failure = null) {
  const ending = failure || resolveEnding(state.stats, state.route);
  state.mode = "ending";
  state.endingId = ending.id;
  state.outcome = null;
  state.pendingBadEnd = null;
  if (!seenEndings.includes(ending.id)) {
    seenEndings.push(ending.id);
    if (!EMBEDDED) localStorage.setItem(ENDINGS_KEY, JSON.stringify(seenEndings));
  }
  saveState();
  audio.setTrack(failure ? "collapse" : "dawn");
  if (failure) audio.fail();
  else audio.resolve();
  render();
  elements.endingView.scrollTop = 0;
  window.scrollTo({ top: 0, behavior: "instant" });
  elements.endingTitle.focus({ preventScroll: true });
}

function renderEnding() {
  const ending = getCurrentEnding();
  const failure = BAD_ENDINGS.some(item => item.id === ending.id);
  elements.endingView.classList.toggle("is-bad-end", failure);
  elements.badEndArt.hidden = !failure;
  elements.badEndReview.hidden = !failure;
  elements.retryFailure.hidden = !failure || !state.retryCheckpoint;
  elements.retryPreparation.hidden = !failure || !state.preparationCheckpoints?.[ending.preparation];
  elements.endingTitle.tabIndex = -1;
  if (failure) {
    elements.badEndImage.hidden = false;
    elements.badEndImageStatus.hidden = Boolean(BAD_END_ART[ending.id]);
    elements.badEndImageStatus.textContent = "场景回忆";
    elements.badEndImage.alt = `${ending.title}：${BAD_END_ART[ending.id] ? "失败场景插图" : "事发地点"}`;
    elements.badEndImage.onerror = () => { elements.badEndImage.hidden = true; elements.badEndImageStatus.hidden = false; };
    elements.badEndImage.src = getFailureArt(ending);
    elements.badEndReason.textContent = ending.reason;
    elements.badEndHint.textContent = ending.hint;
  } else {
    elements.badEndImage.removeAttribute("src");
  }
  const dominant = getDominantStat(state.stats);
  const rhythm = ROUTE_RHYTHMS[getRouteRhythm(state.route)];
  const signature = getRouteSignature(state.route);
  elements.endingGrade.textContent = `${ending.id} / ${ending.grade}`;
  elements.endingTitle.textContent = ending.title;
  elements.endingEpilogue.textContent = ending.epilogue;
  elements.endingSignature.textContent = signature;
  elements.endingDominant.textContent = failure ? `此行止于第 ${ending.index + 1} 次选择 · ${getCurrentScene().location}` : `主导状态：${dominant.label} ${state.stats[dominant.key]} · 路线：${rhythm.label}`;
  const failures = seenEndings.filter(id => BAD_ENDINGS.some(ending => ending.id === id)).length;
  elements.endingCount.textContent = `已抵达：生还 ${seenEndings.length - failures} / 20 · 失败 ${failures} / 8`;
}

function retryFailure(preparation = false) {
  if (state.mode !== "ending" || document.querySelector("dialog[open]")) return;
  const ending = BAD_ENDINGS.find(item => item.id === state.endingId);
  if (!ending) return;
  const checkpoint = preparation ? state.preparationCheckpoints?.[ending.preparation] : state.retryCheckpoint;
  if (!checkpoint || !Number.isInteger(checkpoint.sceneIndex) || !Array.isArray(checkpoint.route) || checkpoint.route.length !== checkpoint.sceneIndex) return;
  state = { ...state, ...structuredClone(checkpoint), mode: "game", outcome: null, pendingBadEnd: null,
    endingId: null, retryCheckpoint: null, preparationCheckpoints: Object.fromEntries(
      Object.entries(state.preparationCheckpoints || {}).filter(([, value]) => value.sceneIndex <= checkpoint.sceneIndex)) };
  readingIdentity = "";
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  elements.gameView.scrollTo({ top: 0, behavior: "instant" });
  elements.choiceList.querySelector("button")?.focus({ preventScroll: true });
}

function openFailureRecords() {
  elements.menuDialog.close();
  elements.failureRecordPreview.hidden = true;
  elements.failureRecordList.replaceChildren(...BAD_ENDINGS.map(ending => {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = !seenEndings.includes(ending.id);
    button.textContent = `${ending.id} / ${button.disabled ? "尚未抵达" : ending.title}`;
    button.addEventListener("click", () => {
      elements.failureRecordPreview.hidden = false;
      elements.failureRecordImage.src = getFailureArt(ending);
      elements.failureRecordImage.alt = `${ending.title}：${BAD_END_ART[ending.id] ? "失败场景插图" : "事发地点"}`;
      elements.failureRecordTitle.textContent = ending.title;
      elements.failureRecordBody.textContent = ending.epilogue;
    });
    return button;
  }));
  elements.failureRecords.showModal();
}

function startGameAfterPrologue() {
  state.mode = "game";
  state.sceneIndex = 0;
  state.outcome = null;
  state.stats = { ...INITIAL_STATS };
  state.route = [];
  state.endingId = null;
  state.pendingBadEnd = null;
  state.retryCheckpoint = null;
  state.preparationCheckpoints = {};
  saveState();
  render();
  if (!state.tutorialSeen) {
    tutorialStep = 0;
    renderTutorial();
    elements.tutorialDialog.showModal();
  }
}

function restart() {
  const tutorialSeen = state.tutorialSeen;
  state = freshState();
  state.tutorialSeen = tutorialSeen;
  saveState();
  render();
  showToast("已回到 12 月 3 日");
}

async function toggleSound() {
  const enabled = await audio.toggle();
  elements.soundBtn.setAttribute("aria-pressed", String(enabled));
  renderIcons();
  renderMusicStatus();
  showToast(enabled ? `正在播放：${audio.getSnapshot().title}` : "配乐已关闭");
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    document.documentElement.requestFullscreen?.();
  }
}

async function copyRoute() {
  const ending = ALL_ENDING_DEFS.find((item) => item.id === state.endingId);
  const value = "《末日的45度角躺平：重生周》" + getRouteSignature(state.route)
    + " / " + (ending?.id || "") + " " + (ending?.title || "");
  try {
    await navigator.clipboard.writeText(value);
    showToast("路径已复制");
  } catch {
    showToast(value);
  }
}

elements.retryFailure.addEventListener("click", () => retryFailure());
elements.retryPreparation.addEventListener("click", () => retryFailure(true));
document.querySelector("#failure-records-btn").addEventListener("click", openFailureRecords);

elements.prologueNext.addEventListener("click", () => {
  audio.click(0.8);
  if (state.prologueIndex < PROLOGUE.length - 1) {
    state.prologueIndex += 1;
    saveState();
    render();
  } else {
    startGameAfterPrologue();
  }
});

elements.prologuePrev.addEventListener("click", () => {
  if (state.prologueIndex === 0) return;
  audio.click(0.55);
  state.prologueIndex -= 1;
  saveState();
  render();
});

elements.choiceList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-choice]");
  if (button) choose(Number(button.dataset.choice));
});

elements.outcomeNext.addEventListener("click", advanceScene);
elements.readingPrev.addEventListener("click", () => moveReading(-1));
elements.readingAdvance.addEventListener("click", advanceReading);
elements.dialogueCopy.addEventListener("click", () => {
  if (window.getSelection()?.isCollapsed === false) return;
  advanceReading();
});
elements.readingLogBtn.addEventListener("click", openTranscript);
elements.restartBtn.addEventListener("click", restart);
elements.copyRouteBtn.addEventListener("click", copyRoute);
elements.archiveBtn.addEventListener("click", () => openModule("inventory"));
elements.sourceBtn.addEventListener("click", () => elements.sourceDialog.showModal());
elements.menuBtn.addEventListener("click", () => elements.menuDialog.showModal());
elements.soundBtn.addEventListener("click", toggleSound);
elements.fullscreenBtn.addEventListener("click", toggleFullscreen);
elements.volumeSlider.addEventListener("input", () => {
  audio.setVolume(Number(elements.volumeSlider.value) / 100);
  saveAudioPreferences();
  renderMusicStatus();
});
elements.readingSpeed.addEventListener("change", () => {
  saveReadingPreferences();
  reader.setSpeed(elements.readingSpeed.value);
  if (motionReduced()) reader.finish();
  if (state.mode === "game") updateReadingReveal();
});
elements.readingReducedMotion.addEventListener("change", () => {
  saveReadingPreferences();
  if (motionReduced() && state.mode === "game") {
    reader.finish();
    updateReadingReveal();
  }
});
reducedMotion.addEventListener("change", () => {
  if (reducedMotion.matches && state.mode === "game") {
    reader.finish();
    updateReadingReveal();
  }
});
elements.guideBtn.addEventListener("click", () => {
  tutorialStep = 0;
  renderTutorial();
  elements.tutorialDialog.showModal();
});
elements.tutorialPrev.addEventListener("click", () => {
  tutorialStep = Math.max(0, tutorialStep - 1);
  renderTutorial();
});
elements.tutorialNext.addEventListener("click", () => {
  tutorialStep = Math.min(TUTORIAL_STEPS.length - 1, tutorialStep + 1);
  renderTutorial();
});
elements.moduleLauncher.addEventListener("click", (event) => {
  const button = event.target.closest("[data-module]");
  if (button) openModule(button.dataset.module);
});
elements.moduleTabs.addEventListener("click", (event) => {
  const button = event.target.closest("[data-module]");
  if (button) renderModule(button.dataset.module);
});

elements.tutorialStart.addEventListener("click", async () => {
  state.tutorialSeen = true;
  saveState();
  if (elements.soundConsent.checked) await audio.enable();
  elements.soundBtn.setAttribute("aria-pressed", String(audio.enabled));
  renderIcons();
  renderMusicStatus();
});

elements.resetBtn.addEventListener("click", () => {
  const accepted = window.confirm("要清除当前路径并回到序章第一页吗？已解锁的结局会保留。");
  if (!accepted) return;
  state = freshState();
  saveState();
  elements.menuDialog.close();
  render();
});

document.addEventListener("keydown", (event) => {
  if (event.repeat) { event.preventDefault(); return; }
  if (elements.tutorialDialog.open) {
    if (["ArrowRight", "Enter"].includes(event.key)) {
      event.preventDefault();
      if (tutorialStep < TUTORIAL_STEPS.length - 1) elements.tutorialNext.click();
      else elements.tutorialStart.click();
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      elements.tutorialPrev.click();
    }
    return;
  }
  if (document.querySelector("dialog[open]")) return;
  const target = event.target instanceof Element ? event.target : document.body;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable) return;
  if (state.mode === "game" && ["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) {
    if (["Enter", " "].includes(event.key) && target.closest("button, a")) return;
    event.preventDefault();
    if (event.key === "ArrowLeft") moveReading(-1);
    else advanceReading();
    return;
  }
  if (event.key.toLowerCase() === "f" && !["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) {
    event.preventDefault();
    toggleFullscreen();
  }
  if (state.mode === "game" && !state.outcome && ["1", "2", "3"].includes(event.key)) {
    choose(Number(event.key) - 1);
  }
  if (state.mode === "prologue" && ["ArrowRight", "Enter"].includes(event.key) && !elements.tutorialDialog.open) {
    elements.prologueNext.click();
  }
  if (state.mode === "prologue" && event.key === "ArrowLeft" && !elements.tutorialDialog.open) {
    elements.prologuePrev.click();
  }
  if (state.mode === "game" && !state.outcome && event.key.toLowerCase() === "a") {
    choose(0);
  }
});

elements.prologueImage.addEventListener("load", () => {
  elements.prologueImage.hidden = false;
});

function resizeCanvas() {
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  elements.canvas.width = Math.round(window.innerWidth * ratio);
  elements.canvas.height = Math.round(window.innerHeight * ratio);
  elements.canvas.style.width = `${window.innerWidth}px`;
  elements.canvas.style.height = `${window.innerHeight}px`;
  if (state.mode === "game") renderRouteSignature();
  drawCanvas();
}

function drawCanvas() {
  const canvas = elements.canvas;
  const context = canvas.getContext("2d");
  if (!context) return;
  const ratio = Math.min(2, window.devicePixelRatio || 1);
  const width = canvas.width / ratio;
  const height = canvas.height / ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.fillStyle = "#090909";
  context.fillRect(0, 0, width, height);

  const progress = state.mode === "prologue"
    ? state.prologueIndex / PROLOGUE.length
    : (state.sceneIndex + 1) / SCENES.length;
  context.lineCap = "butt";
  context.strokeStyle = "rgba(174, 171, 161, 0.12)";
  context.lineWidth = 1;
  for (let i = 0; i <= 50; i += 1) {
    const x = 20 + ((width - 40) * i) / 50;
    context.beginPath();
    context.moveTo(x, height - 20);
    context.lineTo(x, height - (i % 5 === 0 ? 34 : 26));
    context.stroke();
  }
  context.fillStyle = "rgba(174, 171, 161, 0.18)";
  context.fillRect(20, height - 18, width - 40, 1);
  context.fillStyle = "rgba(198, 38, 61, 0.75)";
  context.fillRect(20, height - 18, (width - 40) * progress, 2);
  context.fillStyle = `rgba(198, 38, 61, ${0.25 + Math.sin(simTime * 0.9) * 0.08})`;
  context.fillRect(width - 28, 84, 8, 3);
}

function frame(now) {
  if (bridge?.paused) { lastFrame = now; window.requestAnimationFrame(frame); return; }
  const delta = Math.min(50, now - lastFrame);
  lastFrame = now;
  simTime += delta / 1000;
  advanceReaderTime(delta);
  drawCanvas();
  window.requestAnimationFrame(frame);
}

window.advanceTime = (milliseconds) => {
  if (bridge?.paused) return;
  simTime += Math.max(0, milliseconds) / 1000;
  advanceReaderTime(milliseconds);
  drawCanvas();
};

window.render_game_to_text = () => {
  const scene = getCurrentScene();
  return JSON.stringify({
    platform: { embedded: EMBEDDED, restored: bridge?.restored ?? true, paused: bridge?.paused ?? false },
    coordinateSystem: "DOM interface; canvas origin is top-left, x increases right, y increases down",
    mode: state.mode,
    tutorialOpen: elements.tutorialDialog.open,
    prologue: state.mode === "prologue" ? {
      page: state.prologueIndex + 1,
      total: PROLOGUE.length,
      title: PROLOGUE[state.prologueIndex]?.title
    } : null,
    scene: state.mode === "game" ? {
      index: state.sceneIndex + 1,
      total: SCENES.length,
      id: scene?.id,
      branch: scene?.branch || null,
      branchType: scene?.branchType || null,
      title: scene?.title,
      body: scene.body,
      dialogue: scene.quote,
      reading: { page: readingIndex + 1, total: readingPages.length, ...readingPages[readingIndex],
        fullText: reader.text, visibleText: reader.visibleText, complete: reader.complete, revealing: !reader.complete,
        speed: reader.speed, reducedMotion: motionReduced(), reachedEnd: readingReachedEnd,
        action: elements.readingAdvance.textContent.trim(), choicesAvailable: !state.outcome && readingReachedEnd },
      signal: elements.signalText.textContent,
      art: {
        key: elements.storyStage.dataset.art,
        background: elements.stageBackground.dataset.asset,
        portraits: [...elements.characterStage.querySelectorAll("img")].map((image) => image.getAttribute("src")),
        portraitCharacter: elements.characterStage.dataset.character || null,
        portraitSpeaker: elements.characterStage.dataset.expectedCharacter || null,
        portraitStatus: elements.characterStage.dataset.status,
        props: [...elements.propStage.querySelectorAll("img")].map((image) => image.getAttribute("src")),
        portraitRole: elements.characterStage.dataset.reaction === "true" ? "reaction" : "main",
        decisionAssets: {
          background: getDecisionArt(state.sceneIndex).background,
          portraitMain: getDecisionArt(state.sceneIndex).portraitMain,
          portraitReaction: getDecisionArt(state.sceneIndex).portraitReaction,
          prop: getDecisionArt(state.sceneIndex).prop
        },
        ui: {
          id: elements.gameView.dataset.decisionUi,
          frame: elements.gameView.dataset.frame,
          choiceStyle: elements.gameView.dataset.choiceStyle,
          portraitSide: elements.gameView.dataset.portraitSide,
          headingStyle: elements.gameView.dataset.headingStyle,
          signature: elements.storyStage.dataset.uiSignature,
          motif: elements.decisionMotif.textContent
        }
      },
      choices: state.outcome ? [] : scene?.choices.map((item, index) => ({ index: index + 1, label: item.label, risk: Boolean(item.risk), prepared: Boolean(item.prepared), preparation: item.preparation || null })),
      danger: scene.danger || null,
      pendingBadEnd: state.pendingBadEnd,
      outcome: state.outcome
    } : null,
    stats: state.stats,
    route: {
      choices: state.route,
      signature: getRouteSignature(state.route),
      branchTrail: getBranchTrail(state.route),
      distinctSceneSequences: DANGER_ROUTE_COUNTS.sequences.toString(),
      reachableHistories: DANGER_ROUTE_COUNTS.survivors.toString(),
      failedHistories: DANGER_ROUTE_COUNTS.failedHistories.toString(),
      theoreticalHistories: PATH_COUNT.toString()
    },
    ending: state.mode === "ending" ? {
      id: state.endingId,
      title: getCurrentEnding().title,
      kind: BAD_ENDINGS.some(item => item.id === state.endingId) ? "bad" : "survival",
      art: BAD_ENDINGS.some(item => item.id === state.endingId) ? getFailureArt(getCurrentEnding()) : null,
      artStatus: BAD_ENDINGS.some(item => item.id === state.endingId) ? BAD_END_ART[state.endingId] ? "failure-cg" : "scene-reference" : null,
      reason: getCurrentEnding().reason || null,
      canRetry: Boolean(state.retryCheckpoint),
      canReprepare: Boolean(state.preparationCheckpoints?.[getCurrentEnding().preparation]),
      seen: [...seenEndings]
    } : null,
    soundEnabled: audio.enabled,
    sound: audio.getSnapshot()
  });
};

window.addEventListener("resize", resizeCanvas);
document.addEventListener("fullscreenchange", resizeCanvas);

bridge = createRedleafBridge({
  getState: () => state,
  getEndings: () => seenEndings,
  restore(snapshot) {
    state = snapshot ? structuredClone(snapshot.state) : freshState();
    seenEndings = snapshot ? [...snapshot.endings] : [];
    readingIdentity = "";
  },
  settings(settings) {
    if (!settings || typeof settings !== "object") return;
    const speed = settings.textSpeed;
    if (typeof speed === "number") elements.readingSpeed.value = speed >= 100 ? "instant" : speed >= 70 ? "fast" : speed <= 25 ? "slow" : "standard";
    if (typeof settings.reducedMotion === "boolean") elements.readingReducedMotion.checked = settings.reducedMotion;
    const volume = settings.bgmVolume ?? settings.volume;
    if (typeof volume === "number") {
      const normalized = Math.max(0, Math.min(1, volume > 1 ? volume / 100 : volume));
      audio.setVolume(normalized);
      elements.volumeSlider.value = String(Math.round(normalized * 100));
    }
    if (settings.sound === false) {
      audio.disable();
      redleafResumeAudio = false;
      elements.soundConsent.checked = false;
    }
    if (typeof settings.textSize === "number") document.documentElement.style.setProperty("--redleaf-font-size", settings.textSize + "px");
    if (settings.lineHeight) document.documentElement.style.setProperty("--redleaf-line-height", String(settings.lineHeight));
    reader.setSpeed(elements.readingSpeed.value);
    if (motionReduced()) reader.finish();
    if (state.mode === "game" && revealedSpan) updateReadingReveal();
    renderMusicStatus();
  },
  command(command) {
    if (command === "settings") elements.menuDialog.showModal();
    if (command === "source") elements.sourceDialog.showModal();
    if (command === "restart") {
      document.querySelectorAll("dialog[open]").forEach(dialog => dialog.close());
      restart();
    }
  },
  pause() { redleafResumeAudio = audio.enabled; audio.disable(); },
  resume() { if (redleafResumeAudio) { redleafResumeAudio = false; void audio.enable(); } },
  error(message) { showToast(message); },
  start() {
    render();
    resizeCanvas();
    renderTutorial();
    window.requestAnimationFrame(frame);
    if (state.mode === "game" && !state.tutorialSeen) elements.tutorialDialog.showModal();
  }
});
bridge.start();
