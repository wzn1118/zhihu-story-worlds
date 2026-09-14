import { authoredWorlds } from '../content/worlds.ts';
import { compileWorld } from '../server/worlds.ts';
import { workshopProseFields } from '../shared/workshop-prose-fields.ts';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const markers = /facts\.quote|\bneeds\b|本线|终局费用|进入(?:完整失败结局|Good End|Bad End)|目标转为|路线永久关闭|固定穿|锚点|实扣|已支付|叠加收益|同站封尾/;
let inspected = 0;
const results = [];
for (const authored of authoredWorlds) {
  const world = compileWorld(authored), fields = workshopProseFields(world);
  const findings = Object.entries(fields).filter(([, text]) => markers.test(text));
  inspected += Object.keys(fields).length;
  const result = { id: world.id, fields: Object.keys(fields).length, findings };
  results.push(result);
  console.log(JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ stories: authoredWorlds.length, inspected }));
const target = process.argv.find(arg => arg.startsWith('--out='))?.slice('--out='.length);
if (target) {
  const file = resolve(target);
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify({ at: new Date().toISOString(), scope: 'Explicit production-language markers; not a claim of literary perfection', stories: authoredWorlds.length, inspected, results }, null, 2));
}
