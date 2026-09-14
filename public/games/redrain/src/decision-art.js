import { RETRO_ASSETS } from "./retro-assets.js";

const RAW_DECISION_ART = [
  ["TESTIMONY", "signal", "notch", "right", "屠亦娆", "./public/assets/v3/portraits/d01-d17/d01.png"],
  ["TIMESTAMP", "ledger", "tabs", "left", "俞深", "./public/assets/v3/portraits/d01-d17/d02.png"],
  ["COUNTDOWN", "orbit", "bracket", "right", "燕思静", "./public/assets/v3/portraits/d01-d17/d03.png"],
  ["SAFEHOUSE", "grid", "rail", "left", "燕思静", "./public/assets/v3/portraits/d01-d17/d04.png"],
  ["POOL", "split", "ticket", "right", "俞深", "./public/assets/v3/portraits/d01-d17/d05.png"],
  ["DELIVERY", "cargo", "steps", "left", "燕思静", "./public/assets/v3/portraits/d01-d17/d06.png"],
  ["STOCKPILE", "stack", "ledger", "right", "楼绎", "./public/assets/v3/portraits/d01-d17/d07.png"],
  ["LAST ITEM", "cross", "notch", "left", "崔语心", "./public/assets/v3/portraits/d01-d17/d08.png"],
  ["FAULT LINE", "shard", "tabs", "right", "崔语心", "./public/assets/v3/portraits/d01-d17/d09.png"],
  ["F-CITY", "storm", "bracket", "left", "楼绎", "./public/assets/v3/portraits/d01-d17/d10.png"],
  ["FIRST CALL", "phone", "rail", "right", "屠亦娆", "./public/assets/v3/portraits/d01-d17/d11.png"],
  ["LOCKDOWN", "siren", "ticket", "left", "楼绎", "./public/assets/v3/portraits/d01-d17/d12.png"],
  ["TRACEBACK", "route", "steps", "right", "俞深", "./public/assets/v3/portraits/d01-d17/d13.png"],
  ["NO EXIT", "barrier", "ledger", "left", "崔语心", "./public/assets/v3/portraits/d01-d17/d14.png"],
  ["WARM GLOVES", "hearth", "notch", "right", "俞深", "./public/assets/v3/portraits/d01-d17/d15.png"],
  ["LOCKED ROOM", "seal", "tabs", "left", "崔语心", "./public/assets/v3/portraits/d01-d17/d16.png"],
  ["NIGHT WATCH", "watch", "bracket", "right", "屠亦娆", "./public/assets/v3/portraits/d01-d17/d17.png"],
  ["BIOGRAPHY", "dossier", "rail", "left", "燕思静", "./public/assets/v3/portraits/d18-d34/d18.png"],
  ["ULTIMATUM", "timer", "ticket", "right", "俞深", "./public/assets/v3/portraits/d18-d34/d19.png"],
  ["HUMAN TOWER", "tower", "steps", "left", "燕思静", "./public/assets/v3/portraits/d18-d34/d20.png"],
  ["MARKSMAN", "crosshair", "ledger", "right", "屠亦娆", "./public/assets/v3/portraits/d18-d34/d21.png"],
  ["DECOY", "drone", "notch", "left", "楼绎", "./public/assets/v3/portraits/d18-d34/d22.png"],
  ["FIVE DEATHS", "confession", "tabs", "right", "屠亦娆", "./public/assets/v3/portraits/d18-d34/d23.png"],
  ["WINDOW DROP", "parcel", "bracket", "left", "屠亦娆", "./public/assets/v3/portraits/d18-d34/d24.png"],
  ["38 C", "fever", "rail", "right", "俞深", "./public/assets/v3/portraits/d18-d34/d25.png"],
  ["THREE KNOCKS", "knock", "ticket", "left", "俞深", "./public/assets/v3/portraits/d18-d34/d26.png"],
  ["GLASS LINE", "glass", "steps", "right", "俞深", "./public/assets/v3/portraits/d18-d34/d27.png"],
  ["FIRST ACCORD", "accord", "ledger", "left", "屠程锋", "./public/assets/v3/portraits/d18-d34/d28.png"],
  ["OLD PHONE", "gift", "notch", "right", "俞深", "./public/assets/v3/portraits/d18-d34/d29.png"],
  ["LOAD SHED", "power", "tabs", "left", "燕思静", "./public/assets/v3/portraits/d18-d34/d30.png"],
  ["BLACKOUT", "outage", "bracket", "right", "俞深", "./public/assets/v3/portraits/d18-d34/d31.png"],
  ["DATE DRIFT", "timeline", "rail", "left", "屠亦娆", "./public/assets/v3/portraits/d18-d34/d32.png"],
  ["LAST RECORD", "radio", "ticket", "right", "俞深", "./public/assets/v3/portraits/d18-d34/d33.png"],
  ["FLAG CHECK", "evac", "steps", "left", "尹灏泽", "./public/assets/v3/portraits/d18-d34/d34.png"],
  ["ONE CRATE", "keepsake", "ledger", "right", "俞深", "./public/assets/v3/portraits/d35-d50/d35.png"],
  ["HALF STEP", "drill", "notch", "left", "俞深", "./public/assets/v3/portraits/d35-d50/d36.png"],
  ["CLOSE RANGE", "crossfire", "tabs", "right", "俞深", "./public/assets/v3/portraits/d35-d50/d37.png"],
  ["FALSE ARMY", "warning", "bracket", "left", "楼绎", "./public/assets/v3/portraits/d35-d50/d38.png"],
  ["BEDROOM", "breach", "rail", "right", "俞深", "./public/assets/v3/portraits/d35-d50/d39.png"],
  ["TURNCOAT", "fracture", "ticket", "left", "崔语心", "./public/assets/v3/portraits/d35-d50/d40.png"],
  ["TRUE FLAG", "rescue", "steps", "right", "俞深", "./public/assets/v3/portraits/d35-d50/d41.png"],
  ["TRIAGE", "medical", "ledger", "left", "屠亦娆", "./public/assets/v3/portraits/d35-d50/d42.png"],
  ["KNOWN FACTS", "witness", "notch", "right", "崔宇肖", "./public/assets/v3/portraits/d35-d50/d43.png"],
  ["FAMILY PHOTO", "letter", "tabs", "left", "屠亦娆", "./public/assets/v3/portraits/d35-d50/d44.png"],
  ["THREE CLUES", "inference", "bracket", "right", "俞深", "./public/assets/v3/portraits/d35-d50/d45.png"],
  ["REVERSE CODE", "cipher", "rail", "left", "屠亦娆", "./public/assets/v2/portraits/yirao-daily.png"],
  ["FIVE TABLES", "network", "ticket", "right", "包语希", "./public/assets/v2/portraits/yansijing-daily.png"],
  ["EIGHTH FLOOR", "inquiry", "steps", "left", "屠亦娆", "./public/assets/v2/portraits/yirao-daily.png"],
  ["BITTER COFFEE", "dose", "ledger", "right", "包语希", "./public/assets/v3/portraits/d35-d50/d49.png"],
  ["FINAL SWITCH", "verdict", "notch", "left", "屠亦娆", "./public/assets/v3/portraits/d35-d50/d50.png"]
];

const SECONDARY = ["#c5c4bb", "#b8b99c", "#e3e0d7", "#aebfba", "#ccbaa5"];
const headingStyles = ["offset", "boxed", "split", "underlined", "indexed"];
const PROP_LABELS = [
  "手机", "门禁卡与钥匙", "手机备忘录", "六张门禁卡", "采购账本", "送货手推车", "棋盒与画板", "空钥匙挂钩", "园艺铲",
  "毛巾与手机", "视频通话", "电视遥控器与手机", "收回的门禁卡", "毛毯", "绒里洗碗手套", "晚饭", "素描本", "电脑上的履历", "素描纸与手机",
  "坠落的无人机", "遥控器", "收起的美工刀", "测谎仪", "补给袋", "体温计与药袋", "手表与手电筒", "旧手机", "两部旧手机", "手机与擦拭布",
  "电量表与插座", "手电筒与毛毯", "父母留下的U盘", "对讲机", "红旗与对讲机", "行李与棋盒", "秒表与练习靶纸", "平板与旧手机", "望远镜",
  "卧室门锁", "撕破的衣袖与手机", "应急毯", "封好的信封与照片背面", "轮椅扶手", "父亲的信与全家福", "几页书信", "联络纸条与手机", "培养皿",
  "证件与文件袋", "三杯咖啡", "手机与门禁卡"
];

export const DECISION_ART = Object.freeze(RAW_DECISION_ART.map((entry, index) => {
  const decision = index + 1;
  const [motif, frame, choiceStyle, portraitSide, character, portrait] = entry;
  const assetDirectory = `./public/assets/v4/zhihu-tarot/d${String(decision).padStart(2, "0")}`;
  const hue = 348 + (index % 11);
  const lightness = 48 + (Math.floor(index / 11) * 3) + (index % 2);
  const accent = `hsl(${hue} 68% ${lightness - 5}%)`;
  const accentDeep = `hsl(${hue} 58% ${18 + (index % 5)}%)`;
  const secondary = SECONDARY[index % SECONDARY.length];
  const heading = headingStyles[index % headingStyles.length];
  const grid = 11 + (index % 9) * 2;
  const angle = -5 + (index % 11);
  const notch = 4 + (index % 8) * 2;
  const portraitHeight = 88 + (index % 6) * 2;
  const portraitShift = 1 + (index % 9) * 1.15;
  const retroPrefix = `d${String(decision).padStart(2, "0")}`;
  const approvedMain = RETRO_ASSETS[`${retroPrefix}-portrait-main`] || RETRO_ASSETS[`${retroPrefix}-portrait-reaction`]
    || (decision === 49 && RETRO_ASSETS["d47-portrait-main"]);
  const lateBackground = decision === 46 ? "./public/assets/v2/scenes/lab-corridor.png"
    : decision === 50 ? "./public/assets/v6/retro-anime/derived/eighth-floor-blackout.png" : null;
  const propFallback = decision === 47 ? RETRO_ASSETS["ui-research"]
    : [3, 50].includes(decision) ? RETRO_ASSETS["d01-prop"]
    : [29, 37].includes(decision) ? RETRO_ASSETS["d27-prop"] : null;
  return Object.freeze({
    decision,
    id: `D${String(decision).padStart(2, "0")}`,
    motif,
    frame,
    choiceStyle,
    portraitSide,
    character,
    portrait,
    portraitMain: approvedMain || `${assetDirectory}/portrait-main.png`,
    portraitReaction: RETRO_ASSETS[`${retroPrefix}-portrait-reaction`] || approvedMain || `${assetDirectory}/portrait-reaction.png`,
    prop: RETRO_ASSETS[`${retroPrefix}-prop`] || propFallback || `${assetDirectory}/prop.png`,
    propLabel: !RETRO_ASSETS[`${retroPrefix}-prop`] && propFallback
      ? (decision === 47 ? "实验室显微镜" : [29, 37].includes(decision) ? "旧手机" : "手机") : PROP_LABELS[index],
    background: RETRO_ASSETS[`${retroPrefix}-background`] || (decision === 1 && RETRO_ASSETS["d02-background"]) || lateBackground || `${assetDirectory}/background.png`,
    heading,
    accent,
    accentDeep,
    secondary,
    grid,
    angle,
    notch,
    portraitHeight,
    portraitShift,
    uiSignature: [frame, choiceStyle, portraitSide, heading, accent, grid, angle, notch].join("|")
  });
}));

export function getDecisionArt(sceneIndex) {
  const bounded = Math.min(DECISION_ART.length - 1, Math.max(0, Number(sceneIndex) || 0));
  return DECISION_ART[bounded];
}
