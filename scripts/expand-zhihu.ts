import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { StoryWorkshop, writeJson } from '../server/story-workshop.ts';
import { ZhihuDiscoveryService } from '../server/zhihu-discovery.ts';

const discovery = new ZhihuDiscoveryService(), workshop = new StoryWorkshop();
const queries = ['悬疑短篇小说 已完结', '科幻短篇小说 太空 空间站'];
const urls = ['https://www.zhihu.com/question/2050680813310809035/answer/2074553198715592769', 'https://zhuanlan.zhihu.com/p/706674379'];
const results = [];
for (const query of queries) results.push(await discovery.search(query));
const candidates = (await discovery.list()).candidates;
const records = [];
for (const url of urls) {
  const candidate = candidates.find(row => row.origin.sourceUrl === url);
  if (!candidate) throw new Error(`Selected actual source is absent from saved results: ${url}`);
  const source = await discovery.source(candidate.id);
  let project = await workshop.importZhihuSearch(source);
  if (process.argv.includes('--start')) project = await workshop.generate(project.id);
  records.push({ candidateId: candidate.id, title: project.title, author: project.author, sourceUrl: url, projectId: project.id, sourceHash: project.sourceHash, chars: source.text.length, status: project.status, jobId: project.jobId, revision: project.revision });
}
const output = resolve('output/zhihu-expansion', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
await writeJson(join(output, 'intake.json'), { at: new Date().toISOString(), queries, discovered: candidates.length, sources: records, sourceScope: 'actual-zhihu-search-excerpt', started: process.argv.includes('--start') });
console.log(JSON.stringify({ output, discovered: candidates.length, sources: records }, null, 2));
