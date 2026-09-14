/** Production app/services and real captured official responses; identities and
 * the native hot-list surface are isolated fixtures. Makes no OAuth/site requests. */
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
const release = resolve(process.env.QUESTION_RELEASE || 'releases/question-answers-20260914');
const root = await mkdtemp(join(tmpdir(), 'redleaf-official-flow-'));
const output = resolve('output/question-flow'); await mkdir(output, { recursive: true });
Object.assign(process.env, { PUBLIC_MODE: '1', ALLOWED_HOSTS: '127.0.0.1', NODE_ENV: 'test', LIUKAN_USERS_ROOT: join(root, 'accounts'), LIUKAN_CONFIG_PATH: join(root, 'liukan.json'), WORKSHOP_CONFIG_PATH: join(root, 'creative.json'), ZHIHU_OAUTH_SESSION_FILE: '', ZHIHU_ACCESS_SECRET: '', ZHIHU_CLI_BIN: '/no-cli' });
const mod = (path: string) => import(pathToFileURL(join(release, path)).href);
const [{ createApp }, { zhihuOAuth }, { StoryWorkshop }, { ZhihuDiscoveryService }, { StorySourceService }, { ZhihuQuestionsService }] = await Promise.all([mod('server/app.ts'), mod('server/zhihu-oauth.ts'), mod('server/story-workshop.ts'), mod('server/zhihu-discovery.ts'), mod('server/story-source.ts'), mod('server/zhihu-questions.ts')]);
const captured = JSON.parse(await readFile('/tmp/zhihu-question-answers-real-probe.json', 'utf8'));
const questionUrl: string = captured.question.Url;
const pages = new Map<string, any>();
for (const file of await readdir(resolve('.local/zhihu-question-cache'))) {
  const record = JSON.parse(await readFile(resolve('.local/zhihu-question-cache', file), 'utf8'));
  const url = new URL(record.url);
  if (url.searchParams.get('QuestionUrl') === questionUrl) pages.set(url.searchParams.get('Offset')!, record.raw);
}
assert.equal(pages.get('0').Data.Items.length, 20); assert.equal(pages.get('20').Data.Items.length, 20);
const upstream: string[] = [];
const questions = new ZhihuQuestionsService({ accessSecret: 'isolated-response-replay', cacheRoot: join(root, 'cache'), fetch: async (input: any) => {
  const url = new URL(String(input)); upstream.push(url.pathname + ':' + (url.searchParams.get('Offset') || ''));
  const raw = url.pathname.endsWith('/hot_list') ? { Code: 0, Data: { Items: [captured.question] } } : pages.get(url.searchParams.get('Offset')!);
  // Explicitly refuse a third page; test must not invent additional answers.
  return new Response(JSON.stringify(raw || { Code: 30002, Message: 'fixture unavailable page' }), { headers: { 'Content-Type': 'application/json' } });
} });
const users = Object.fromEntries(['alice','bob'].map(key => [key, { id: `question-flow-${key}`, provider: 'zhihu', name: key }]));
const originalUser = zhihuOAuth.currentUser;
zhihuOAuth.currentUser = (req: any) => users[req.headers.cookie?.match(/fixture_session=(alice|bob)/)?.[1]] || null;
const app = createApp(new StorySourceService({ cacheDir: join(root, 'source') }), new StoryWorkshop(join(root, 'workshop')), new ZhihuDiscoveryService(join(root, 'discovery')), undefined, { getImages: async () => null, listImages: async () => [] }, questions);
app.use(express.static(join(release, 'dist'))); app.use(express.static(join(release, 'public')));
const server = app.listen(0, '127.0.0.1'); await new Promise<void>(done => server.once('listening',done));
const base = `http://127.0.0.1:${(server.address() as any).port}`;
const browser = await chromium.launch({headless:true}); const checks: string[] = [], errors: string[] = [];
const api = async (who: string, path: string, body?: any, bound = who) => {
  const response = await fetch(base + path,{method:body === undefined?'GET':'POST',headers:{Cookie:`fixture_session=${who}`, 'X-Redleaf-Account': users[bound]?.id || '', ...(body === undefined?{}:{'Content-Type':'application/json'})}, ...(body === undefined?{}:{body:JSON.stringify(body)})});
  return {status:response.status,data:await response.json()};
};
try {
  assert.equal((await api('', '/api/zhihu/questions/hotlist')).status,401);
  assert.equal((await api('bob', '/api/zhihu/questions/hotlist', undefined,'alice')).status,409);
  for (const who of ['alice','bob']) {
    const mobile = who === 'bob';
    const context = await browser.newContext({ viewport:{width:mobile?390:1280,height:900},hasTouch:mobile,isMobile:mobile,reducedMotion:'reduce' });
    await context.addCookies([{name:'fixture_session',value:who,url:base}]);
    await context.addInitScript(id=>localStorage.setItem(`redleaf.account.v1:${id}:redleaf.liukan.introduction.v1`,JSON.stringify({seen:true})),users[who].id);
    // Only website surface is simulated; target question response + persistence
    // are handled by the candidate's production routes with real response bytes.
    await context.route('**/api/zhihu-browser/frame',route=>route.fulfill({json:{status:'ready',frameId:'native-hot-fixture',url:'https://www.zhihu.com/hot',title:'知乎热榜',width:1100,height:650,posts:[],capturedAt:new Date().toISOString(),document:{id:'native-hot-document',width:1100,height:650,scrollY:0,html:`<!doctype html><html><body><h1>知乎热榜</h1><a data-redleaf-control="native-hot-document-question" href="${questionUrl}">${captured.question.Title}</a></body></html>`}}}));
    const page = await context.newPage();page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base,{waitUntil:'domcontentloaded'});
    const skip=page.getByRole('button',{name:/跳过开篇/});await skip.or(page.getByRole('button',{name:'新故事工作台',exact:true})).first().waitFor();if(await skip.isVisible())await skip.click();
    await page.getByRole('button',{name:'新故事工作台',exact:true}).click();await page.locator('[data-tour="workshop-zhihu-browser"]').click();
    assert.equal(await page.locator('.zhq-reader').isVisible(),false);
    await page.frameLocator('iframe[title="知乎原网页，可直接选字和拖给刘看山"]').getByRole('link',{name:captured.question.Title,exact:true}).click();
    await page.locator('.zhq-answer').nth(19).waitFor();assert.equal(await page.locator('.zhq-answer').count(),20);
    const firstId=(await page.locator('.zhq-answer').first().getAttribute('data-candidate-id'))!;
    if(who==='alice') assert.equal((await api('bob','/api/liukan/inbox',{candidateId:firstId})).status,404);
    // Load the next page via actual cursor; 40 actual records, no reused IDs.
    await page.getByRole('button',{name:'继续加载回答',exact:true}).click();await page.locator('.zhq-answer').nth(39).waitFor();
    const ids = await page.locator('.zhq-answer').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('data-candidate-id')!));assert.equal(new Set(ids).size,40);
    // All 40 save through production APIs; one native gesture in each layout
    // verifies that UI events reach the same path used for every card.
    const handle=page.getByRole('button',{name:'把第 1 条回答交给刘看山',exact:true});await handle.scrollIntoViewIfNeeded();
    const from=(await handle.boundingBox())!,to=(await page.locator('.liukan-pet').boundingBox())!;
    const start={x:from.x+from.width/2,y:from.y+from.height/2},end={x:to.x+to.width/2,y:to.y+to.height/2};
    if(mobile){const cdp=await context.newCDPSession(page);const touch=(x:number,y:number)=>[{x,y,id:1,radiusX:3,radiusY:3,force:1}];await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(start.x,start.y)});for(let n=1;n<=12;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(start.x+(end.x-start.x)*n/12,start.y+(end.y-start.y)*n/12)});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
    else{await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:15});await page.mouse.up();}
    await page.locator('.liukan-post').waitFor();assert.match(await page.locator('.liukan-post-kicker').innerText(),/知乎回答接口节选/);
    for(const id of ids){const saved=await api(who,'/api/liukan/inbox',{candidateId:id});assert.equal(saved.status,201);const original=pages.get('0').Data.Items.concat(pages.get('20').Data.Items).find((row:any)=>row.Url===saved.data.candidate.origin.sourceUrl);assert.ok(original);assert.equal(saved.data.candidate.excerpt,original.Summary);}
    assert.equal((await api(who,'/api/liukan/inbox')).data.posts.length,40);
    if(who==='alice')assert.equal((await api('bob','/api/liukan/inbox')).data.posts.length,0);
    await page.screenshot({path:join(output,`${who}-actual-answers.png`)});await context.close();checks.push(`${who}: hotlist click, 2 pages / 40 unique actual answers, native drag, 40 exact inbox saves`);
  }
  assert.deepEqual(errors,[]);assert.equal(upstream.filter(path=>path.endsWith(':0')).length,1);assert.equal(upstream.filter(path=>path.endsWith(':20')).length,1);
  checks.push('anonymous rejected; stale account rejected; two accounts isolated; public pages reused');
  await writeFile(join(output,'integration.json'),JSON.stringify({passed:true,checkedAt:new Date().toISOString(),questionUrl,checks,limitation:'OAuth identity and native hotlist are fixtures; official content replayed from same-day successful real responses; production app routes, persistence and built UI used.'},null,2));
  console.log(JSON.stringify({passed:true,checks}));
}finally{await browser.close();zhihuOAuth.currentUser=originalUser;await app.locals.closeAccountBrowsers?.();server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()));await rm(root,{recursive:true,force:true});}
