import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { defaultSettings, storageKeys } from '../src/game.ts';
const base = 'http://127.0.0.1:4174', id = 'import-6febc2f6-3a12-41ac-bae5-6d05ebc68c10';
const out = resolve('output/playwright/illustrated-game', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(out, {recursive:true});
const get = async (path: string) => {const r=await fetch(base+path);assert.equal(r.status,200);return r.json();};
const source=await get(`/api/workshop/projects/${id}/source`);
const acceptance=JSON.parse(await readFile(`output/workshop-sample/${id}-r1-1788663853936/acceptance.json`,'utf8'));
assert.equal(createHash('sha256').update(source.text).digest('hex'),acceptance.sourceTextSha256);
const world=await get(`/api/workshop/projects/${id}/world?version=r1`);
const artPath=`/api/workshop/projects/${id}/art?version=r1`;
const batch=await get(artPath);
assert.equal(batch.storyId,id);assert.equal(batch.worldVersion,'r1');assert.match(batch.id,/^wart_/);
const current=batch.jobs.filter((j:any)=>!j.stale && j.review?.decision==='approved');
const approved=new Set(current.map((j:any)=>j.asset.url));
assert.ok(approved.size>0,'Real reviewed images required');
assert.ok(approved.has(world.nodes[world.startNodeId].background),'Opening must have a real approved image');
const browser=await chromium.launch({headless:true,executablePath:'C:/Users/10847/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe'});
const results:any[]=[],errors:string[]=[],mutations:string[]=[];let page:Page;
const state=async()=>JSON.parse(await page.evaluate(()=>window.render_game_to_text!()));
const decisions=async()=>{for(let i=0;i<80;i++){await page.waitForTimeout(60);const s=await state();if(s.mode==='ending'||s.choices?.length)return s;const b=page.locator('button.dialogue-next');if(await b.isVisible())await b.click();}throw new Error('No decisions');};
async function shot(name:string){await page.evaluate(()=>document.fonts.ready);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:resolve(out,name+'.png'),animations:'disabled'});}
async function checkVisual(s:any){
  if(!approved.has(s.visuals?.background))return;
  const rendered=await page.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();return {url,width:img.naturalWidth,height:img.naturalHeight,painted:Array.from(document.querySelectorAll('*')).some(e=>getComputedStyle(e).backgroundImage.includes(url))||!!document.querySelector(`img[src="${url}"]`)};},s.visuals.background);
  assert.ok(rendered.width>=1024 && rendered.painted,'Actual original must be loaded and rendered');return rendered;
}
try{
 for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport});context.setDefaultTimeout(60000);
  await context.addInitScript(({keys,settings})=>{localStorage.setItem(keys.onboarding,'true');localStorage.setItem(keys.settings,JSON.stringify(settings));},{keys:storageKeys,settings:{...defaultSettings,reducedMotion:true,textSpeed:100}});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/')&&r.method()!=='GET')mutations.push(r.method()+' '+new URL(r.url()).pathname);});
  await page.goto(base,{waitUntil:'domcontentloaded',timeout:120000});
  await page.getByRole('button',{name:'新故事工作台',exact:true}).click();
  await page.locator('.workshop-project').filter({hasText:'第七秒的来电'}).click();
  await page.getByRole('button',{name:'场景美术制作',exact:true}).click();await page.locator('.workshop-art-panel').waitFor();
  assert.equal(await page.locator('.workshop-art-panel').getAttribute('data-project-id'),id);
  assert.equal(await page.locator('.workshop-art-panel').getAttribute('data-world-version'),'r1');
  await page.locator('.workshop-art-panel summary').click();
  assert.equal(await page.locator('.art-review-grid article').count(),batch.progress.current);
  await page.locator('.workshop-art-panel summary').click();
  await page.locator('.workshop-art-panel').scrollIntoViewIfNeeded();await shot(`${viewport.width}-production`);
  // Delay a real response while the user switches projects; it must not reopen the old list.
  let release!:()=>void, arrived!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  const fetched=new Promise<void>(resolve=>{arrived=resolve;});
  await page.route(`**${artPath}`,async route=>{const response=await route.fetch();arrived();await gate;await route.fulfill({response});},{times:1});
  await page.getByRole('button',{name:'场景美术制作',exact:true}).click();await fetched;
  await page.locator('.workshop-project').filter({hasNotText:'第七秒的来电'}).first().click();
  release();await page.waitForTimeout(500);assert.equal(await page.locator('.workshop-art-panel').count(),0);
  await page.locator('.workshop-project').filter({hasText:'第七秒的来电'}).click();
  await page.getByRole('button',{name:'场景美术制作',exact:true}).click();await page.locator('.workshop-art-panel').waitFor();
  results.push({viewport:viewport.width,independentManifest:true,currentRows:batch.progress.current,delayedResponseIgnored:true});
  await page.getByRole('button',{name:'读导入原文',exact:true}).click();await page.getByTestId('imported-source-text').waitFor();
  assert.equal(await page.getByTestId('imported-source-text').textContent(),source.text);await shot(`${viewport.width}-source`);
  await page.getByRole('button',{name:'返回工作台',exact:true}).click();await page.getByRole('button',{name:/游玩 r1/}).click();
  for(const [i,target] of acceptance.endings.entries()){
   if(i)await page.getByRole('button',{name:'重新开始',exact:true}).click();
   await page.getByRole('button',{name:'开始故事',exact:true}).click();
   const pictures:any[]=[];
   if(!i){const s=await decisions();const opening=await checkVisual(s);assert.ok(opening,'Opening art must survive frontend loading');pictures.push(opening);const boxes=await page.evaluate(()=>['.scene-annotation','.resource-strip','.scene-topline'].map(sel=>{const e=document.querySelector(sel)!;return {selector:sel,display:getComputedStyle(e).display,rect:e.getBoundingClientRect().toJSON()};}));assert.equal(boxes[0].display,'none');await shot(`${viewport.width}-opening`);results.push({viewport,boxes});}
   for(const [step,choice] of target.path.entries()){
    const s=await decisions();const index=s.choices.findIndex((c:any)=>c.id===choice);assert.ok(index>=0,`${s.nodeId}/${choice}`);const v=await checkVisual(s);if(v)pictures.push(v);await page.locator('.choice-button').nth(index).click();const next=world.nodes[s.nodeId].choices.find((c:any)=>c.id===choice).nextNodeId;await page.waitForFunction(n=>JSON.parse(window.render_game_to_text!()).nodeId===n,next);
    if(!i && !step){
     const before=await state();await page.reload({waitUntil:'domcontentloaded'});
     await page.getByRole('button',{name:'我的存档',exact:true}).click();await page.locator('.save-slot').first().getByRole('button',{name:'载入',exact:true}).click();
     await page.waitForFunction(n=>JSON.parse(window.render_game_to_text!()).nodeId===n,next);
     const restored=await state();assert.deepEqual(restored.resources,before.resources);assert.equal(restored.nodeId,before.nodeId);assert.equal(restored.visuals.background,before.visuals.background);assert.ok(await checkVisual(restored));
     await shot(`${viewport.width}-restored`);results.push({viewport:viewport.width,saveRestored:true,nodeId:restored.nodeId,background:restored.visuals.background});
    }
   }
   const ending=await decisions();assert.equal(ending.mode,'ending');assert.equal(ending.nodeId,target.id);const v=await checkVisual(ending);if(v)pictures.push(v);await shot(`${viewport.width}-${target.id}`);
   await page.getByRole('button',{name:'查看导入原文',exact:true}).click();assert.equal(await page.getByTestId('imported-source-text').textContent(),source.text);await page.getByRole('button',{name:'继续当前故事',exact:true}).click();assert.equal((await state()).nodeId,target.id);
   results.push({viewport:viewport.width,ending:target.id,choices:target.path.length,pictures,sourceReturn:true});
  }
  await context.close();
 }
 const expectedMemorySaves=mutations.filter(value=>value==='POST /api/liukan/remember');
 const unexpectedMutations=mutations.filter(value=>value!=='POST /api/liukan/remember');
 assert.deepEqual(errors,[]);assert.deepEqual(unexpectedMutations,[]);
 assert.equal(world.generated?.artReady,true);assert.equal(Object.values(world.nodes).filter((node:any)=>approved.has(node.background)).length,40);
 await writeFile(resolve(out,'verification.json'),JSON.stringify({status:'passed',base,sourceScope:source.scope,sourceHash:acceptance.sourceTextSha256,batch:batch.progress,results,errors,mutations,expectedMemorySaves,unexpectedMutations},null,2));
 console.log(JSON.stringify({status:'passed',out,results:results.length}));
}catch(error){await page!?.screenshot({path:resolve(out,'failure.png')}).catch(()=>{});await writeFile(resolve(out,'verification.json'),JSON.stringify({status:'failed',error:String(error),results,errors,mutations},null,2));throw error;}finally{await browser.close();}
