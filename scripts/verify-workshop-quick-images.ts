import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import { defaultSettings, storageKeys } from '../src/game.ts';
const base='http://127.0.0.1:4176', id='import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';
const out=resolve('output/playwright/quick-images',new Date().toISOString().replace(/[:.]/g,'-'));await mkdir(out,{recursive:true});
const endpoint=`/api/workshop/projects/${id}/image-launch?version=r1`;
const before=await(await fetch(base+`/api/workshop/projects/${id}/art?version=r1`)).json();
assert.equal(before.progress.generated,40,'Reuse the completed real image batch');
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/10847/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});
const errors:string[]=[],results:any[]=[];let currentPage:any;
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport});await context.addInitScript(({keys,settings})=>{localStorage.setItem(keys.onboarding,'true');localStorage.setItem(keys.settings,JSON.stringify(settings));},{keys:storageKeys,settings:{...defaultSettings,textSpeed:100,reducedMotion:true}});
  const page=await context.newPage();currentPage=page;page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'新故事工作台',exact:true}).click();
  await page.locator('.workshop-project').filter({hasText:'第七秒的来电'}).click();
  const panel=page.getByRole('region',{name:'快速生成插图'});await panel.waitFor();
  await panel.getByRole('button',{name:'读取制作进度',exact:true}).waitFor({state:'hidden'});
  const button=panel.getByRole('button',{name:/一键生图|继续制作插图/});let acknowledgementMs:number|undefined, serverTiming:string|undefined;
  if(await button.count()){
   await button.scrollIntoViewIfNeeded();await button.waitFor({state:'visible'});
   const response=page.waitForResponse(r=>r.request().method()==='POST'&&r.url()===base+endpoint);
   let sentAt=0;page.on('request',r=>{if(r.method()==='POST'&&r.url()===base+endpoint)sentAt=Date.now();});
   await button.click();const r=await response;acknowledgementMs=Date.now()-sentAt;serverTiming=r.headers()['server-timing'];assert.equal(r.status(),202);assert.ok(sentAt>0&&acknowledgementMs<5000,`Immediate HTTP task launch ${acknowledgementMs}ms; ${serverTiming}`);
   const job=await r.json();assert.equal(job.projectId,id);assert.equal(job.worldVersion,'r1');
  }
  await panel.getByRole('button',{name:'本批图片已返回',exact:true}).waitFor();assert.match(await panel.innerText(),/40\/40/);
  await panel.scrollIntoViewIfNeeded();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:resolve(out,`${viewport.width}-quick-images.png`)});
  await page.reload({waitUntil:'domcontentloaded'});await page.getByRole('button',{name:'新故事工作台',exact:true}).click();await page.locator('.workshop-project').filter({hasText:'第七秒的来电'}).click();
  await page.getByRole('region',{name:'快速生成插图'}).getByRole('button',{name:'本批图片已返回',exact:true}).waitFor();
  await page.getByRole('button',{name:/游玩 r1/}).click();await page.getByRole('button',{name:'开始故事',exact:true}).click();
  await page.waitForFunction(()=>!!JSON.parse(window.render_game_to_text!()).visuals?.background);
  const s=JSON.parse(await page.evaluate(()=>window.render_game_to_text!()));assert.match(s.visuals.background,/^\/generated-art\/workshop\/wscene_/);
  await page.locator('.scene-image').waitFor({state:'visible'});
  const image=await page.evaluate(async src=>{const i=new Image();i.src=src;await i.decode();return {url:src,width:i.naturalWidth,height:i.naturalHeight};},s.visuals.background);
  await page.screenshot({path:resolve(out,`${viewport.width}-game.png`)});
  results.push({viewport,acknowledgementMs,serverTiming,reloadPreserved:true,actualImage:image});await context.close();
 }
 const after=await(await fetch(base+`/api/workshop/projects/${id}/art?version=r1`)).json();assert.equal(after.progress.paidAttemptsTotal,before.progress.paidAttemptsTotal);assert.deepEqual(errors,[]);
 await writeFile(resolve(out,'verification.json'),JSON.stringify({status:'passed',base,results,errors,generatedBefore:before.progress.generated,generatedAfter:after.progress.generated,newPaidRequests:0,scope:'Real frontend launch and reuse of existing generated images; new direction overlap verified by isolated contract tests.'},null,2));console.log(JSON.stringify({status:'passed',out,results}));
}catch(e){await currentPage?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});await writeFile(resolve(out,'verification.json'),JSON.stringify({status:'failed',error:String(e),results,errors},null,2));throw e;}finally{await browser.close();}
