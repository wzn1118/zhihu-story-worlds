import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const directory = resolve('output/source-links-20260910');
await mkdir(directory, { recursive: true });
const list = JSON.parse(await readFile('.local/zhihu-cache/story-list.json', 'utf8')).data;
const binary = 'C:/Users/10847/AppData/Local/ZhihuCLI/current/zhihu-cli.exe';
const clean = value => value.replace(/[\s\p{P}\p{S}]/gu, '');
const previous = process.argv.includes('--retry-missing') ? JSON.parse(await readFile(resolve(directory, 'research.json'), 'utf8')).results : [];
const results = previous.filter(item => item.confirmed);
async function inspect(story) {
  const raw = JSON.parse(await readFile(`.local/zhihu-cache/story-${story.work_id}.json`, 'utf8')).data;
  const query = process.argv.includes('--title-only') ? story.title : previous.length ? `${raw.content.split('\n').filter(Boolean).slice(0, 2).join(' ').slice(0, 70)} ${raw.author_name}` : `${story.title} ${raw.author_name}`;
  try {
    const { stdout } = await exec(binary, ['search', 'zhihu', '--query', query, '--count', '5'], { timeout: 45000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    const data = JSON.parse(stdout);
    const source = clean(raw.content);
    const anchors = Array.from({ length: Math.min(10, Math.floor(source.length / 50)) }, (_, index) => source.slice(index * 50, index * 50 + 50));
    const candidates = (data.Data?.Items ?? []).map(item => {
      const text = clean(item.ContentText ?? '');
      const url = new URL(item.Url); url.search = ''; url.hash = '';
      const linked = `${item.ContentText ?? ''}\n${(item.CommentInfoList ?? []).map(comment => comment.Content ?? '').join('\n')}`;
      const paidLinks = (linked.match(/https:\/\/www\.zhihu\.com\/market\/paid_column\/\d+\/section\/\d+/g) ?? []).filter(value => value.endsWith(`/section/${story.work_id}`));
      return { url: url.href, title: item.Title, author: item.AuthorName, authorMatches: item.AuthorName === raw.author_name, matchingAnchors: anchors.filter(anchor => text.includes(anchor)).length, paidLinks };
    });
    const paid = candidates.find(item => item.paidLinks.length);
    const confirmed = paid ? { ...paid, evidenceUrl: paid.url, url: paid.paidLinks[0] } : candidates.find(item => item.authorMatches && item.matchingAnchors >= 2);
    const result = { id: story.work_id, title: story.title, author: raw.author_name, query, checkedAt: new Date().toISOString(), candidates, confirmed };
    results.push(result);
    await writeFile(resolve(directory, `${story.work_id}.json`), JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ title: story.title, confirmed: confirmed?.url ?? null, matches: confirmed?.matchingAnchors ?? 0 }));
  } catch (error) {
    results.push({ id: story.work_id, title: story.title, query, error: error.message });
    console.log(JSON.stringify({ title: story.title, error: error.message }));
  }
}
const pending = list.filter(story => !results.some(result => result.id === story.work_id));
for (let index = 0; index < pending.length; index += 2) await Promise.all(pending.slice(index, index + 2).map(inspect));
await writeFile(resolve(directory, 'research.json'), JSON.stringify({ checkedAt: new Date().toISOString(), total: results.length, confirmed: results.filter(item => item.confirmed).length, results }, null, 2));
