import { mkdir, readFile, writeFile } from 'node:fs/promises';
const folder = 'output/coordination/cutout-followup-20260910';
await mkdir(folder, { recursive: true });
const { threads, total } = JSON.parse(await readFile('output/imagegen/character-cutouts-20260910/five-threads/conversations.json', 'utf8'));
for (const thread of threads) {
  await writeFile(`${folder}/read-${thread.lane}.json`, JSON.stringify({ threadId: thread.threadId, turnLimit: 1, includeOutputs: true, maxOutputCharsPerItem: 350 }));
  const prompt = `用户在统筹根线程再次明确要求“很多人物合格素材不透明，需要开多路线程抠出来”，我已核对你是现有第 ${thread.lane}/5 路，请持续完成现有独占分配，无需重新派发或等用户逐张确认喵 (ฅ•̀ω•́ฅ)\n请继续逐张修正并检查完整深浅底合成和原生边缘，确保头发、手指、衣服完整且内部不透明，背景残留与错误孔洞必须修复，原图 RGB 和尺寸保持不变；已批准素材实时供唯一 publisher 发布，完成后写 lane 汇总，未能修复的源图问题逐项列明呀 (｡•̀ᴗ-)✧\n请避免累计大图触发 413，使用小型清晰预览和按需原生裁片，每批落盘；发送进度给根线程时只给本组已处理/当前审核通过/待修复/待审数字及证据路径，不附 base64 喵 (ฅ•ω•ฅ)`;
  await writeFile(`${folder}/send-${thread.lane}.json`, JSON.stringify({ threadId: thread.threadId, prompt }));
}
console.log(JSON.stringify({ threads: threads.length, total }));
