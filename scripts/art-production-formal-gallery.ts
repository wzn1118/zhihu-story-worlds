import { readFile, writeFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { listArtBatches } from '../server/art-production.ts';
import { SHORT_FOLDER } from '../server/art-production-short.ts';
import { sha256 } from '../server/art-production-prompts.ts';

const root = process.cwd(); const folder = path.join(root, SHORT_FOLDER);
const state = JSON.parse(await readFile(path.join(folder, 'state.json'), 'utf8'));
const ids: string[] = JSON.parse(await readFile(path.join(folder, 'history-ids.json'), 'utf8'));
const jobs = (await listArtBatches()).flatMap(b => b.jobs).filter(j => ids.includes(j.id) && j.asset);
const escaped = (s: unknown) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const cards = [];
for (const job of jobs) {
  const file = path.join(root, 'public/generated-art', `${job.id}.png`);
  const bytes = await readFile(file);
  if (sha256(bytes) !== job.asset!.sha256 || (await stat(file)).size !== job.asset!.bytes) throw new Error('GALLERY_ASSET_HASH_MISMATCH');
  const src = path.relative(folder, file).replaceAll('\\', '/');
  cards.push(`<article><a href="${escaped(src)}"><img loading="lazy" src="${escaped(src)}" alt="${escaped(job.worldId + ' ' + job.nodeId)}"></a><h2>${escaped(job.worldId)} / ${escaped(job.nodeId)}</h2><p>${job.asset!.width} x ${job.asset!.height} | ${job.asset!.native4k ? '4K dimensions' : 'Below 4K'} | ${job.review?.decision ?? 'Awaiting review'}${job.stale ? ' | Historical revision' : ''}</p><details><summary>Review</summary><p>${escaped(job.review?.notes ?? 'Not yet reviewed')}</p><code>${job.asset!.sha256}</code></details></article>`);
}
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>赤页正式美术生产</title><style>body{margin:0;background:#151516;color:#eee;font:14px system-ui,sans-serif;letter-spacing:0}header{padding:22px 24px;border-bottom:1px solid #444}h1{font-size:23px}main{padding:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr));gap:20px}article{min-width:0;border:1px solid #444;border-radius:4px;padding:12px}img{display:block;width:100%;height:280px;object-fit:contain;background:#202022}h2{font-size:14px;overflow-wrap:anywhere}p{line-height:1.6}code{overflow-wrap:anywhere;font-size:11px}summary{cursor:pointer;color:#e6818c}</style><header><h1>赤页 · 正式美术生产</h1><p>${escaped(new Date().toISOString())}</p><p>20 个故事 / ${state.requiredAssets} 项需求 / ${state.requiredScenes} 个场景。实收 ${jobs.length} 张；已审 ${jobs.filter(j => j.review).length}；通过 ${jobs.filter(j => !j.stale && j.review?.decision === 'approved').length}。下列包含未通过候选与历史修订，不代表全部完成。</p></header><main>${cards.join('\n')}</main></html>`;
await writeFile(path.join(folder, 'gallery.html'), html);
console.log(JSON.stringify({ gallery: path.join(folder, 'gallery.html'), verifiedFiles: jobs.length,
  reviewed: jobs.filter(j => j.review).length, approved: jobs.filter(j => !j.stale && j.review?.decision === 'approved').length }));
