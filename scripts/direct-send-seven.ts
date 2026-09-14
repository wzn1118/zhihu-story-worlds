import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { authoredWorlds } from '../content/worlds.ts';
import { buildShortPlans } from '../server/art-production-short.ts';
import { formalStyleBrief } from './art-production-formal-supervisor.ts';

const root = process.cwd();
const privateRoot = path.join(root, 'output/imagegen/scene-production/.private');
const ids = ['scene_87e84a2233a1e5283360036caf72','scene_f94947bc76da7988304df4dfac7e','scene_478d857a6b30715fb560071314cb','scene_ad111fd7aa193dd2930e1663e514','scene_bbbcfc87e1275aefb0c979cb9426','scene_83069bc0f432f366b57c003abc48','scene_12412557dce9ff93dbe369696510'];
const state = JSON.parse(await readFile(path.join(privateRoot, 'state.json'), 'utf8'));
const jobs = state.batches.flatMap((b: any) => b.jobs);
const plans = await buildShortPlans(root, authoredWorlds);
const prepared: any[] = [];
for (const id of ids) {
  const job = jobs.find((j: any) => j.id === id);
  if (!job || job.state !== 'queued' || job.paidAttempts !== 0 || job.asset) throw new Error(`JOB_NOT_READY:${id}`);
  const plan = plans.find((p: any) => p.worldId === job.worldId && p.nodeId === job.nodeId);
  if (!plan) throw new Error(`PLAN_MISSING:${id}`);
  const brief = await formalStyleBrief(root, plan, jobs);
  if (!brief || brief.sourceHash !== job.sourceHash || brief.referenceHash !== job.referenceHash) throw new Error(`BRIEF_HASH_MISMATCH:${id}`);
  const dir = path.join(privateRoot, 'jobs', id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'prompt.txt'), brief.prompt + '\n', 'utf8');
  const promptHash = (await import('../server/art-production-prompts.ts')).sha256(brief.prompt);
  await writeFile(path.join(dir, 'request.json'), JSON.stringify({ references: brief.references, sourceHash: brief.sourceHash, promptHash, requested: { aspectRatio: brief.aspectRatio ?? '16:9', resolution: '4K' } }, null, 2) + '\n', 'utf8');
  prepared.push({ id, worldId: job.worldId, nodeId: job.nodeId, dir });
}
const run = (row: any) => new Promise(resolve => {
  const child = spawn('python', ['scripts/art-production-client.py', 'generate', row.dir], { cwd: root, windowsHide: true });
  let out = ''; child.stdout.on('data', b => { out += b.toString(); }); child.stderr.on('data', b => { out += b.toString(); });
  child.on('close', code => resolve({ jobId: row.id, code, output: out.slice(-1000) }));
});
const results = await Promise.all(prepared.map(run));
const receipt = { at: new Date().toISOString(), requested: prepared.length, results, source: 'current plan/reference rebuild', onePromptOneImage: true };
await writeFile(path.join(root, 'output/coordination/art-remake-12h-20260912/full64-direct/direct-send-seven.json'), JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(receipt));
