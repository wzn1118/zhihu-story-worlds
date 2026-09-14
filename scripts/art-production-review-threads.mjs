import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { openSync, closeSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { needsVisualReview, orderReviewCandidates } from './art-production-review-candidates.mjs';

const root = process.cwd();
const ownerArg = process.argv.find(arg => arg.startsWith('--owner='))?.split('=')[1];
const resumeNext = process.argv.find(arg => arg.startsWith('--resume-next='))?.split('=')[1];
const freshNext = process.argv.find(arg => arg.startsWith('--fresh-next='))?.split('=')[1];
if (freshNext && (!/^[a-z0-9-]+$/.test(freshNext) || !ownerArg || resumeNext)) throw new Error('INVALID_FRESH_REVIEW');
if (ownerArg && !['cel-drawing', 'painted-background', 'scene-composition'].includes(ownerArg)) throw new Error('INVALID_REVIEW_OWNER');
if (resumeNext && (!/^[a-z0-9-]+$/.test(resumeNext) || !ownerArg || process.argv.some(arg => arg.startsWith('--queue-next='))))
  throw new Error('INVALID_REVIEW_RESUME');
const folder = path.join(root, 'output/imagegen/scene-production/formal-production-20260907/review-threads');
await mkdir(folder, { recursive: true });
const children = [];
for (const owner of ['cel-drawing', 'painted-background', 'scene-composition']) {
  if (ownerArg && ownerArg !== owner) continue;
  const conversation = JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production/art-team', owner, 'conversation.json'), 'utf8'));
  const receiptFile = path.join(folder, `${owner}.json`);
  const previous = await readFile(receiptFile, 'utf8').then(JSON.parse).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
  const next = process.argv.find(arg => arg.startsWith('--queue-next='))?.split('=')[1];
  if (next && !/^[a-z0-9-]+$/.test(next)) throw new Error('INVALID_REVIEW_WAVE');
  const queueHeld = process.argv.includes('--queue-held') || !!next;
  if (previous && !queueHeld && !resumeNext && !freshNext) throw new Error(`REVIEW_LAUNCH_ALREADY_RECORDED:${owner}`);
  if (queueHeld && !next) {
    const ended = await readFile(path.join(folder, `${owner}.exit.json`), 'utf8').then(JSON.parse).catch(() => null);
    const errors = await readFile(path.join(folder, `${owner}.stderr.log`), 'utf8').catch(() => '');
    if (!ended || ended.code === 0 || !errors.includes('already has an active writer')) continue;
  }
  const state = JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production/formal-production-20260907/state.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'output/imagegen/scene-production/manifest.json'), 'utf8'));
  const byId = new Map(manifest.batches.flatMap(batch => batch.jobs).map(job => [job.id, job]));
  const candidates = [];
  for (const row of state.jobs.filter(row => row.owner === owner)) {
    const job = byId.get(row.jobId);
    if (!job?.asset || job.stale) continue;
    const reviewed = await readFile(path.join(root, 'output/imagegen/scene-production/formal-production-20260907/reviews', `${job.id}.json`), 'utf8').then(JSON.parse).catch(error => {
      if (error.code === 'ENOENT' || error instanceof SyntaxError) return undefined; throw error;
    });
    if (needsVisualReview(job, reviewed))
      candidates.push({ row, job });
  }
  // Keep review payloads small enough for the model gateway; the review worker owns the queue.
  const selected = orderReviewCandidates(candidates).slice(0, 4);
  if (!selected.length) { console.log(JSON.stringify({ owner, event: 'NO_PENDING_STYLE_REVIEWS' })); continue; }
  const { stdout: previewJson } = await promisify(execFile)('python', ['scripts/art-production-review-preview.py', ...selected.map(item => item.job.id)],
    { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 1024 * 1024 });
  const previews = new Map(JSON.parse(previewJson).map(item => [item.jobId, item]));
  const prompt = `赤页美术 ${owner}：本轮只审下列 ${selected.length} 张，写完立即结束，不等待后续图片，不读取整个state、manifest或book。主控持有完整队列。只看画风，不做原生4K和精细画质验收。
每张先用view_image看下列full-frame预览JPEG，再用view_image以原始细节打开对应original原PNG；两步都实际完成才可写review。预览由原PNG核验SHA与原生尺寸后等比缩小到768长边，仅用于全帧审图，不是交付美术，不计生产数。原PNG不修改。
用户最新要求：只管吸血鬼猎人D画风，不再因尺寸、画质或精细度拒收；短提示词批量完成全部20故事。这覆盖旧4K验收指令。你是 ${owner} 独立美术审图线程，工作区 E:/知乎。不发付费请求、不改book或服务代码、不重启共享服务。
用户再次指出候选中仍有画风不符。本轮先实际用view_image打开两张电影原帧，再对照候选，不能仅凭“有黑线/有阴影”判断通过：人物基准 E:/UserData/Temp/codex-clipboard-203be394-1357-4205-a561-6c6aa5ed5bab.jpg；背景基准 C:/Users/10847/Downloads/微信图片_2026-09-06_120934_750.jpg。比较清稿结构、角色不透明固有色、相接的硬边暗面和背景颜料笔触；泛指复古动漫、现代网漫换暗色、细密写实贴图都不自动等于目标。原帧里的帽子、剑、古堡、山谷不是移植到别的故事的内容要求。
本批优先从未审过的实收图，其次补齐旧图双视图证据；同层内优先人物母图。无完整记录的图重新实际看，不凭旧文字改批准。只使用本轮所在线程亲自完成的view_image证据，不把审图再委托给其他线程。
实际PNG为 E:/知乎/public + asset.url。逐张用view_image看完整图，以用户已确认“吸血鬼猎人D画风”的成熟脸、细长有结构的鼻眼、平涂赛璐珞和硬边阴影、绘画背景判断。不要把灰度、尖塔、D本人的帽子当画风。保留原创人物辨识和故事年代，现代中国不搬到欧洲古堡。尺寸低、比例略差、局部头发切边、小标签字形、器物小瑕疵都只记备注，不单独拒收。真正风格不符、全员套D本人、拼图或整张题材错误才rejected。参考图只用于固定原创人物，不用相邻生成图接力。
实际看过并核对hash后用apply_patch写本组 reviews/JOB_ID.json（完整路径前缀 output/imagegen/scene-production/formal-production-20260907/），schema：{"jobId":"实际id","sha256":"实际asset.sha256","decision":"approved或rejected","reviewer":"${owner}-style-first","notes":"实际看到的画风和人物事实，至少30字；尺寸仅记录","fullImageViewed":true,"nativeDetailViewed":true,"styleReviewed":true,"at":"ISO"}。若覆盖旧review，先原样保留完整旧JSON；首次保存为 reviews/JOB_ID.previous.json，若已存在则使用带本批唯一标签的 previous 文件，绝不覆盖已有备份。at用真实当前ISO时间，不填写虚构时间。不要直接改私有队列。主控导入新审查。
只处理下面的明确jobId，以实际看过的完整预览作画风判断。不要因旧记录里低分辨率、器物标签、发顶切边而拒收。不额外扫描整个目录。若出现摄影级皮肤渐变、PBR/3D高光、网漫磨皮脸、空气刷柔焦、全员同一张脸、角色与背景同一材质或“只有暗色却没有赛璐珞硬边分面”，判定为rejected并写明具体偏离；这类AI感是画风问题，不得用“成熟动漫”带过。notes至少30字，写出与原帧相比的具体相同或偏离之处；另写reviewPreview:"full-frame-768"和styleBaseline:"film-frames-20260907"，准确说明审的是核验原图所得预览。完成这一批即结束。
${JSON.stringify(selected.map(({ row, job }) => ({ jobId: job.id, worldId: row.worldId, nodeId: row.nodeId,
    sha256: job.asset.sha256, actualDimensions: [job.asset.width, job.asset.height],
    preview: previews.get(job.id).preview,
    original: path.join(root, 'public/generated-art', `${job.id}.png`) })), null, 2)}`;
  const suffix = freshNext ? `.fresh-${freshNext}` : resumeNext ? `.resume-${resumeNext}` : next ? `.queue-${next}` : queueHeld ? '.queued' : '';
  const stdout = openSync(path.join(folder, `${owner}${suffix}.events.jsonl`), 'wx');
  const stderr = openSync(path.join(folder, `${owner}${suffix}.stderr.log`), 'wx');
  const env = { ...process.env };
  delete env.CODEX_APP_TOOLS_PIPE_PATH; delete env.CODEX_MCP_NODE_PATH; delete env.CODEX_BROWSER_USE_NODE_PATH;
  const child = spawn('C:/Users/10847/AppData/Local/OpenAI/Codex/bin/994e8469124a0d31/codex.exe',
    queueHeld ? ['queue', '--thread', conversation.threadId, '--message', prompt, '--sandbox', 'danger-full-access', '--config', 'approval_policy="never"']
    : ['exec', '--json', '--skip-git-repo-check', '--sandbox', 'danger-full-access', '--config', 'approval_policy="never"',
      '-C', root, ...(freshNext ? ['-'] : ['resume', conversation.threadId, '-'])],
    { cwd: root, env, windowsHide: true, stdio: ['pipe', stdout, stderr] });
  closeSync(stdout); closeSync(stderr);
  child.stdin.on('error', () => {}); child.stdin.end(prompt);
  const ended = new Promise((resolve, reject) => {
    let recorded = false;
    const finish = async result => {
      if (recorded) return;
      recorded = true;
      try {
        await writeFile(path.join(folder, `${owner}${suffix}.exit.json`),
          JSON.stringify({ ...result, at: new Date().toISOString() }));
        resolve(result);
      } catch { reject(new Error('REVIEW_EXIT_RECORD_FAILED')); }
    };
    child.once('exit', (code, signal) => { void finish({ code, signal }); });
    child.once('error', error => { void finish({ code: 1, errorCode: 'REVIEW_SPAWN_FAILED',
      systemCode: /^[A-Z0-9_]+$/.test(error.code ?? '') ? error.code : 'UNKNOWN' }); });
  });
  if (freshNext) for (let poll = 0; poll < 60; poll++) {
    const events = await readFile(path.join(folder, `${owner}${suffix}.events.jsonl`), 'utf8');
    const first = events.includes('\n') ? events.split('\n')[0] : '';
    const event = first ? JSON.parse(first) : undefined;
    if (event?.type === 'thread.started' && event.thread_id) {
      conversation.previousThreadId = conversation.threadId;
      conversation.threadId = event.thread_id;
      conversation.url = `codex://threads/${event.thread_id}`;
      conversation.processId = child.pid;
      conversation.qualityPolicy = 'style-first';
      conversation.startedAt = new Date().toISOString();
      await writeFile(path.join(root, 'output/imagegen/scene-production/art-team', owner, 'conversation.json'), JSON.stringify(conversation, null, 2) + '\n');
      break;
    }
    if (child.exitCode !== null) break;
    await setTimeout(500);
  }
  await writeFile(queueHeld || resumeNext || freshNext ? path.join(folder, `${owner}${suffix}.json`) : receiptFile, JSON.stringify({ at: new Date().toISOString(), threadId: conversation.threadId,
    owner, processId: child.pid, paidCallsAllowed: false,
    selectedJobIds: selected.map(item => item.job.id), firstReviews: selected.filter(item => !item.job.review).length }, null, 2));
  children.push(ended);
  console.log(JSON.stringify({ owner, threadId: conversation.threadId, processId: child.pid }));
}
const results = await Promise.all(children);
if (results.some(result => result.code !== 0 || result.signal)) process.exitCode = 1;
