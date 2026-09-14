import { getDecisionArt } from "./decision-art.js";
import { RETRO_ASSETS } from "./retro-assets.js";

const APPROVED_SOURCES = new Set(Object.values(RETRO_ASSETS));

export const CHARACTER_ROLES = Object.freeze({
  "屠亦娆": "X大学 · 生物工程 / 素描",
  "楼绎": "技术组 · 通讯与无人机",
  "燕思静": "行动组 · 医疗支援",
  "俞深": "围棋棋手 · 安全屋提供者",
  "崔语心": "X大学 · 法学",
  "阮子扬": "车辆持有人 · F市路线",
  "尹灏泽": "研究助手 · 军方联络",
  "崔宇肖": "崔语心的弟弟",
  "屠程锋": "屠亦娆的父亲",
  "包语希": "研究所 · 尹教授的助手",
  "贾巧盈": "研究所 · 贾钟的助手",
  "尹教授": "研究所 · 教授",
  "贾钟": "研究所 · 教授",
  "领队军人": "救援队",
  "旧手机": "屏幕上的文字"
});

const SPEAKER_ALIASES = Object.freeze({
  "楼绎（傍晚）": "楼绎",
  "楼绎（对讲机）": "楼绎",
  "屠程锋（信）": "屠程锋"
});

// Same-character anchors, visually checked against the production identity sheets.
const PORTRAIT_ANCHORS = Object.freeze({
  "楼绎": [7, 12],
  "燕思静": [3, 18],
  "俞深": [2, 5],
  "崔语心": [8, 9],
  "尹灏泽": [34],
  "崔宇肖": [43],
  "屠程锋": [28],
  "包语希": [47, 49]
});

export const SUPPORTING_PORTRAIT_IDS = Object.freeze({
  "阮子扬": "cast-ruan-ziyang-main",
  "领队军人": "cast-rescue-team-leader-main",
  "贾巧盈": "cast-jia-qiaoying-main",
  "尹教授": "cast-yin-professor-main",
  "贾钟": "cast-jia-zhong-main"
});

export function getSpeakerIdentity(speaker) {
  return SPEAKER_ALIASES[speaker] || speaker;
}

export function getCharacterPortrait(character, sceneIndex, pose = "main") {
  const identity = getSpeakerIdentity(character);
  const decision = getDecisionArt(sceneIndex);
  const anchors = identity === "屠亦娆"
    ? sceneIndex < 3 ? [1] : sceneIndex >= 45 ? [46, 50] : [17, 11]
    : PORTRAIT_ANCHORS[identity] || [];
  const candidates = [];
  const supporting = RETRO_ASSETS[SUPPORTING_PORTRAIT_IDS[identity]];
  if (supporting) candidates.push(supporting);
  if (decision.character === identity) {
    candidates.push(pose === "reaction" ? decision.portraitReaction : decision.portraitMain);
    candidates.push(decision.portraitMain);
  }
  for (const number of anchors) {
    const prefix = `d${String(number).padStart(2, "0")}`;
    candidates.push(RETRO_ASSETS[`${prefix}-portrait-${pose}`], RETRO_ASSETS[`${prefix}-portrait-main`]);
  }
  const sources = [...new Set(candidates.filter(source => source && APPROVED_SOURCES.has(source)))];
  return { character: identity, pose, source: sources[0] || null, sources };
}

export function getReadingPortrait(sceneIndex, page) {
  const dialogue = page.kind === "dialogue" && page.speaker !== "旁白";
  const identity = dialogue ? getSpeakerIdentity(page.speaker) : getDecisionArt(sceneIndex).character;
  const pose = page.kind === "outcome" ? "reaction" : "main";
  if (dialogue && ["旧手机", "屠程锋（信）"].includes(page.speaker)) {
    return { character: identity, pose, source: null, sources: [], presentation: "text" };
  }
  const portrait = getCharacterPortrait(identity, sceneIndex, pose);
  return { ...portrait, presentation: portrait.source ? "portrait" : "offscreen" };
}
