import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { sha256 } from '../server/art-production-prompts.ts';
import { replaceArtFile } from '../server/art-production-files.ts';
import type { ArtBatch } from '../shared/production.ts';

const root = process.cwd();
const folder = path.join(root, 'output/imagegen/scene-production/formal-production-20260907');
const verified = new Map<string, string>();
const escape = (value: unknown) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const atomic = async (name: string, value: string) => {
  const file = path.join(folder, name), temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, value); await replaceArtFile(temp, file);
};

async function report() {
  const manifest: { batches: ArtBatch[] } = JSON.parse(await readFile(path.join(folder, '../manifest.json'), 'utf8'));
  const state = JSON.parse(await readFile(path.join(folder, 'state.json'), 'utf8'));
  const supervisor = JSON.parse(await readFile(path.join(folder, 'supervisor-state.json'), 'utf8'));
  const waves = [];
  for (const name of await readdir(path.join(folder, 'runs'))) {
    if (!name.endsWith('.json')) continue;
    const wave = JSON.parse(await readFile(path.join(folder, 'runs', name), 'utf8'));
    if (wave.qualityPolicy === 'style-first') waves.push({ ...wave, filename: name });
  }
  const selected = new Set<string>(waves.flatMap(wave => wave.selected.map((job: { jobId: string }) => job.jobId)));
  const submittedPrompts = new Map<string, string>(waves.flatMap(wave =>
    wave.selected.map((job: { jobId: string; prompt: string }) => [job.jobId, job.prompt] as [string, string])));
  const jobs = manifest.batches.flatMap(batch => batch.jobs).filter(job => selected.has(job.id));
  for (const job of jobs.filter(job => job.asset)) {
    const file = path.join(root, 'public/generated-art', `${job.id}.png`);
    const info = await stat(file);
    const signature = `${job.asset!.sha256}:${info.size}:${info.mtimeMs}`;
    if (verified.get(job.id) === signature) continue;
    const bytes = await readFile(file);
    if (bytes.length !== job.asset!.bytes || sha256(bytes) !== job.asset!.sha256) throw new Error('STYLE_REPORT_HASH_MISMATCH');
    verified.set(job.id, signature);
  }
  const worlds: Array<{ worldId: string; title: string; required: number; generated: number; reviewed: number; approved: number }> = [];
  for (const worldId of new Set<string>(state.jobs.map((row: { worldId: string }) => row.worldId))) {
    const batch = manifest.batches.find(batch => batch.worldId === worldId)!;
    const current = batch.jobs.filter(job => !job.stale);
    worlds.push({ worldId, title: batch.worldTitle, required: state.jobs.filter((row: { worldId: string }) => row.worldId === worldId).length,
      generated: current.filter(job => job.asset).length, reviewed: current.filter(job => job.review).length,
      approved: current.filter(job => job.review?.decision === 'approved').length });
  }
  const output = { at: new Date().toISOString(), scope: 'style-first-20260907', qualityPolicy: 'style-first',
    requiredAssets: state.requiredAssets, requiredScenes: state.requiredScenes, worldCount: worlds.length,
    waves: waves.map(wave => wave.filename), selected: selected.size, generated: jobs.filter(job => job.asset).length,
    reviewed: jobs.filter(job => job.review).length, approved: jobs.filter(job => job.review?.decision === 'approved').length,
    inFlight: jobs.filter(job => job.state === 'generating').length,
    supervisor: { status: supervisor.status, code: supervisor.code, wave: supervisor.wave, wakeAt: supervisor.wakeAt },
    worlds, jobs };
  await atomic('style-first-20260907.json', JSON.stringify(output, null, 2) + '\n');
  const cards = jobs.filter(job => job.asset).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(job => {
    const src = path.relative(folder, path.join(root, 'public/generated-art', `${job.id}.png`)).replaceAll('\\', '/');
    const title = worlds.find(world => world.worldId === job.worldId)?.title ?? job.worldId;
    const prompt = submittedPrompts.get(job.id) ?? '';
    const decision = job.stale ? '旧版本已替换' : job.review?.decision === 'approved' ? '画风通过'
      : job.review?.decision === 'rejected' ? '画风退回' : '待审';
    return `<article data-world="${escape(job.worldId)}"><a href="${escape(src)}"><img loading="lazy" src="${escape(src)}" alt="${escape(title + ' ' + job.nodeId)}"></a><h2>${escape(title)}</h2><p>${escape(job.nodeId)}</p><p>${decision} · ${job.asset!.width} × ${job.asset!.height}</p><details><summary>Prompt / 审图</summary><p>${escape(prompt)}</p><p>${escape(job.review?.notes ?? '待审')}</p><code>${job.asset!.sha256}</code></details></article>`;
  });
  const rows = worlds.map(world => `<tr><th>${escape(world.title)}</th><td>${world.required}</td><td>${world.generated}</td><td>${world.reviewed}</td><td>${world.approved}</td></tr>`).join('');
  const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>赤页 · 画风优先批产</title><style>body{margin:0;background:#18181a;color:#eee;font:14px system-ui;letter-spacing:0}header{padding:20px;border-bottom:1px solid #444}h1{font-size:24px;margin:0 0 12px}h2{font-size:16px;margin:10px 0}p{line-height:1.5;overflow-wrap:anywhere}select{background:#303033;color:#fff;border:1px solid #777;padding:8px;min-width:140px}main{padding:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:16px}article{min-width:0;border:1px solid #424247;border-radius:4px;padding:10px}img{width:100%;height:320px;object-fit:contain;display:block;background:#242427}code{overflow-wrap:anywhere;font-size:11px}summary{cursor:pointer;color:#efadb5}table{border-collapse:collapse;max-width:100%;font-size:13px}td,th{text-align:left;padding:6px 14px 6px 0;border-bottom:1px solid #444}section{padding:20px}</style><header><h1>赤页 · 画风优先批产</h1><p>${output.at}</p><p>本轮实收 ${output.generated} 张 · 已审 ${output.reviewed} · 通过 ${output.approved} · 在途 ${output.inFlight} · 第 ${supervisor.wave} 波</p><p>20 个故事 · ${output.requiredAssets} 项资产 · ${output.requiredScenes} 个剧情场景 · ${escape(supervisor.status)}</p><select aria-label="故事"><option value="">全部故事</option>${worlds.map(world => `<option value="${escape(world.worldId)}">${escape(world.title)}</option>`).join('')}</select></header><main>${cards.join('\n')}</main><section><table><thead><tr><th>故事</th><th>需求</th><th>当前实收</th><th>当前已审</th><th>当前通过</th></tr></thead><tbody>${rows}</tbody></table></section><script>document.querySelector('select').addEventListener('change',e=>{document.querySelectorAll('article').forEach(a=>a.hidden=!!e.target.value&&a.dataset.world!==e.target.value)});</script></html>`;
  await atomic('style-first-gallery.html', html);
  console.log(JSON.stringify({ ...output, worlds: undefined, jobs: undefined, waves: output.waves.length }));
}

do {
  await report();
  if (!process.argv.includes('--watch')) break;
  const lock = await readFile(path.join(folder, 'supervisor.lock'), 'utf8').then(JSON.parse).catch(() => undefined);
  try { if (!lock?.pid) break; process.kill(lock.pid, 0); } catch { break; }
  await setTimeout(60000);
} while (true);
