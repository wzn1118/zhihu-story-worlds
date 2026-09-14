import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';
import { createServer } from 'vite';
import type { ZhihuCandidate } from '../shared/zhihu-discovery';

const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import { createElement } from 'react';import { createRoot } from 'react-dom/client';
import { configureAccountStorage } from '/src/account-storage.ts';
import { ZhihuWorkspace } from '/src/ZhihuWorkspace.tsx';import { LiuKanShanPet } from '/src/LiuKanShanPet.tsx';
configureAccountStorage({provider:'zhihu'}, 'official-question-ui');
createRoot(document.getElementById('root')).render(createElement('main',null,createElement(ZhihuWorkspace,{onClose:()=>{}}),createElement(LiuKanShanPet,{reducedMotion:true})));
</script></body></html>`;
const server = await createServer({server:{host:'127.0.0.1',port:0,hmr:false,watch:{ignored:['**/releases/**','**/dist/**','**/output/**']}},plugins:[{name:'official-question-reader-ui',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/__official-question-ui'))return next();res.setHeader('content-type','text/html');res.end(await vite.transformIndexHtml(req.url,html));});}}]});
await server.listen();const address=server.httpServer!.address();assert.ok(address&&typeof address!=='string');
const browser=await chromium.launch({headless:true});const scenarios:string[]=[];
async function until(predicate:()=>boolean){const deadline=Date.now()+10000;while(!predicate()){if(Date.now()>deadline)throw new Error('Expected official question reader request did not arrive');await new Promise(resolve=>setTimeout(resolve,20));}}
async function drag(page:Page,index:number,mobile:boolean){
  const handle=page.getByRole('button',{name:`把第 ${index} 条回答交给刘看山`,exact:true});await handle.scrollIntoViewIfNeeded();
  const a=(await handle.boundingBox())!,b=(await page.locator('.liukan-pet').boundingBox())!;const from={x:a.x+a.width/2,y:a.y+a.height/2},to={x:b.x+b.width/2,y:b.y+b.height/2};
  if(!mobile){await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:16});await page.mouse.up();return;}
  const cdp=await page.context().newCDPSession(page),touch=(x:number,y:number)=>[{x,y,radiusX:4,radiusY:4,force:1,id:1}];
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:touch(from.x,from.y)});for(let step=1;step<=12;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:touch(from.x+(to.x-from.x)*step/12,from.y+(to.y-from.y)*step/12)});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
}
try{for(const mobile of [false,true]){
  const prefix=mobile?'mobile':'desktop',context=await browser.newContext({viewport:{width:mobile?390:1280,height:900},isMobile:mobile,hasTouch:mobile,reducedMotion:'reduce'}),page=await context.newPage();
  const question='https://www.zhihu.com/question/12345678901234567890',other='https://www.zhihu.com/question/12345678901234567891',title='点开热榜问题后，每个回答可以单独保存吗？';
  const candidates:ZhihuCandidate[]=Array.from({length:4},(_,i)=>({id:`official-answer-${i+1}`,title,author:`作者${i+1}`,excerpt:`这是第${i+1}条官方接口返回的回答节选。${'这段内容只代表接口实际提供的文字。'.repeat(5)}`,characters:104,query:'',origin:{kind:'zhihu-answer',workId:`2234567890123456789${i}`,sourceUrl:`${question}/answer/2234567890123456789${i}`,contentScope:'question-answer-excerpt',fetchedAt:new Date().toISOString()}}));
  const errors:string[]=[],inbox:string[]=[],offsets:number[]=[],browserActions:string[]=[],allRequests:string[]=[];let hotlists=0,failOffset=true;
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/api/**',async route=>{
    const u=new URL(route.request().url()),path=u.pathname;allRequests.push(path);assert.equal(route.request().headers()['x-redleaf-account'],'official-question-ui');
    if(path==='/api/zhihu-browser/frame'||path==='/api/zhihu-browser/open')return route.fulfill({json:{status:'ready',frameId:'hot-frame',url:'https://www.zhihu.com/hot',title:'知乎热榜',posts:[],capturedAt:new Date().toISOString(),width:1100,height:650,document:{id:'hot-doc',width:1100,height:650,scrollY:0,html:`<!doctype html><html><body><h1>知乎热榜</h1><a data-redleaf-control="hot-doc-question" href="${question}">${title}</a></body></html>`}}});
    if(path==='/api/zhihu-browser/action'){browserActions.push(route.request().postDataJSON().kind);return route.fulfill({status:500,json:{error:{message:'Question links must use the official question reader'}}});}
    if(path==='/api/zhihu/questions/hotlist'){hotlists++;return route.fulfill({json:{items:[{title,url:question,summary:'真实官方接口结构的确定性测试数据'},{title:'另一个问题',url:other,summary:''}],fetchedAt:new Date().toISOString(),cached:false}});}
    if(path==='/api/zhihu/questions/answers'){
      const offset=Number(u.searchParams.get('offset'));offsets.push(offset);assert.equal(u.searchParams.get('url'),question);
      if(offset===2&&failOffset){failOffset=false;return route.fulfill({status:502,json:{error:{code:'TEST_UPSTREAM_FAILURE',message:'测试：下一页暂时不可用'}}});}
      return route.fulfill({json:{title,questionUrl:question,candidates:offset===0?candidates.slice(0,2):[candidates[1],...candidates.slice(2)],paging:offset===0?{isEnd:false,nextOffset:2,totals:4}:{isEnd:true,totals:4},fetchedAt:new Date().toISOString(),cached:false}});
    }
    if(path==='/api/liukan/memories')return route.fulfill({json:{memories:[]}});
    if(path==='/api/liukan/inbox'){
      if(route.request().method()==='GET')return route.fulfill({json:{posts:[]}});
      const id=route.request().postDataJSON().candidateId;inbox.push(id);const candidate=candidates.find(item=>item.id===id);assert.ok(candidate);return route.fulfill({json:{id,candidate,receivedAt:new Date().toISOString()}});
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
  await page.goto(`http://127.0.0.1:${address.port}/__official-question-ui`,{waitUntil:'domcontentloaded'});
  await page.frameLocator('iframe').getByRole('link',{name:title,exact:true}).waitFor();
  assert.equal(await page.locator('.zhq-reader').isVisible(),false,'the inactive official reader must not occupy the native browser page');
  await page.frameLocator('iframe').getByRole('link',{name:title,exact:true}).click();
  await page.getByRole('region',{name:'知乎问题回答列表',exact:true}).getByRole('heading',{name:title,exact:true}).waitFor();
  assert.equal(await page.locator('.zhq-answer').count(),2);assert.deepEqual(browserActions,[],'hot-list question must open readable official answers without requesting the denied website');
  assert.equal(await page.locator('.zhw-browser').isVisible(),false);scenarios.push(`${prefix}-native-hotlist-link-opens-official-answers`);
  await page.getByRole('button',{name:'继续加载回答',exact:true}).click();await page.getByRole('alert').filter({hasText:'下一页暂时不可用'}).waitFor();
  assert.equal(await page.locator('.zhq-answer').count(),2,'failed pagination keeps already loaded answers');await page.getByRole('button',{name:'重试',exact:true}).click();
  await page.getByText('已加载 4 条回答，每条都可以拖给刘看山',{exact:true}).waitFor();assert.equal(await page.locator('.zhq-answer').count(),4,'overlap between pages deduplicates by actual answer source');
  assert.equal(await page.getByRole('button',{name:'继续加载回答',exact:true}).count(),0);assert.deepEqual(offsets,[0,2,2]);scenarios.push(`${prefix}-page-retry-retains-and-deduplicates-all-answers`);
  for(let i=1;i<=4;i++){await drag(page,i,mobile);await until(()=>inbox.length===i);await page.locator('.liukan-post-author').filter({hasText:`作者${i}`}).waitFor();await page.getByRole('button',{name:'收起刘看山',exact:true}).click();}
  assert.deepEqual(inbox,candidates.map(item=>item.id));assert.equal(allRequests.includes('/api/zhihu-browser/capture'),false,'official answers use their account-bound candidate and never capture a different browser page');scenarios.push(`${prefix}-all-four-answers-pointer-drag-to-liukan-inbox`);
  await page.getByRole('button',{name:'返回热榜',exact:true}).click();
  await page.frameLocator('iframe').getByRole('link',{name:title,exact:true}).waitFor();
  assert.equal(await page.locator('.zhq-reader').isVisible(),false,'returning to an existing native hot list restores its reading surface');
  assert.equal(hotlists,0,'returning to an existing hot list does not consume an official hot-list request');
  await page.frameLocator('iframe').getByRole('link',{name:title,exact:true}).click();await page.getByText('已加载 4 条回答，每条都可以拖给刘看山',{exact:true}).waitFor();assert.deepEqual(offsets,[0,2,2]);assert.deepEqual(browserActions,[]);scenarios.push(`${prefix}-back-to-native-hotlist-and-open-cached-question`);
  assert.deepEqual(errors,[]);await mkdir('output/official-question-ui',{recursive:true});await page.screenshot({path:`output/official-question-ui/${prefix}.png`});await context.close();
}const result={ok:true,scope:'Actual Workspace, official question reader and LiuKanShan UI with deterministic account-bound API responses.',scenarios};await writeFile('output/official-question-ui/results.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));}finally{await browser.close();await server.close();}
