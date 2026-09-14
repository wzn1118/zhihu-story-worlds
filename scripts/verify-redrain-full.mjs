import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import { createSnapshot, freshPlatformState } from '../public/games/redrain/src/platform-state.js';
import { getSceneForRoute, applyEffects, resolveEnding } from '../public/games/redrain/src/content.js';
import { resolveDanger } from '../public/games/redrain/src/danger.js';
const out='E:/知乎/output/playwright/redrain-integrated';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const results=[]; const errors=[]; const httpErrors=[];
async function scenario(width,height,mobile=false){
 console.log('START',width,height);
 const context=await browser.newContext({viewport:{width,height},acceptDownloads:true});
 await context.addInitScript(()=>localStorage.setItem('redleaf.liukan.introduction.v1',JSON.stringify({seen:true})));
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)httpErrors.push({status:r.status(),url:r.url()})});
 await page.goto('http://127.0.0.1:4194/',{waitUntil:'domcontentloaded',timeout:60000});
 await page.evaluate(()=>localStorage.setItem('redleaf.settings.v1',JSON.stringify({textSize:18,textSpeed:100,reducedMotion:true,sound:false})));
 await page.reload({waitUntil:'domcontentloaded'});
 const card=page.locator('[data-story-id="redrain-rebirth-week"]');
 const resume=async()=>{if(mobile){await card.locator('.story-card-open').click();await page.locator('#redrain-start').click();}else await page.locator('.rail-bookmark .current-world').filter({hasText:'重生周'}).click();};
 console.log('PAGE',width);
 await card.waitFor({timeout:40000}); await card.locator('.story-card-open').click(); await page.locator('#redrain-start').click();
 const fl=()=>page.frameLocator('iframe[title="末日的45度角躺平：重生周"]');
 const getFrame=()=>page.frames().find(f=>f.url().includes('/games/redrain/index.html'));
 await fl().locator('body.redleaf-embedded:not(.redleaf-waiting)').waitFor({timeout:25000});
 await page.waitForTimeout(1000);
 console.log('EMBEDDED',width);
 for(let i=0;i<5;i++) await fl().locator('#prologue-next').click();
 for(let i=0;i<8&&await fl().locator('#tutorial-dialog').isVisible();i++){
   if(await fl().locator('#tutorial-start').isVisible())await fl().locator('#tutorial-start').click();
   else await fl().locator('#tutorial-next').click();
 }
 const reveal=async()=>{
  for(let i=0;i<35;i++){
   const state=JSON.parse(await getFrame().evaluate(()=>window.render_game_to_text()));
   if(state.mode==='ending')return;
   const buttons=fl().locator('#choice-list button:visible');
   if(await buttons.count()&&await buttons.first().isEnabled())return;
   await fl().locator('#reading-advance').click();
  }
  throw new Error('choice did not become available');
 };
 await reveal();console.log('CHOICES',width);
 await page.screenshot({path:out+(mobile?'/mobile-playing.png':'/desktop-playing.png')});
 await fl().locator('#choice-list button').nth(1).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('redleaf.redrain.v1')||'null')?.state.route.length===1);
 console.log('CHOSEN',width);
 const before=JSON.parse(await page.evaluate(()=>localStorage.getItem('redleaf.redrain.v1')));
 assert.deepEqual(before.state.route,[1]);
 await page.getByRole('button',{name:'保存重生周',exact:true}).click();
 await page.evaluate(()=>{window.__exportPayloads=[];const original=URL.createObjectURL.bind(URL);URL.createObjectURL=blob=>{blob.text().then(text=>window.__exportPayloads.push(text));return original(blob);};});
 await page.getByRole('button',{name:'导出重生周存档',exact:true}).click();
 await page.waitForFunction(()=>window.__exportPayloads?.length>0);
 const exported=await page.evaluate(()=>window.__exportPayloads.at(-1));
 console.log('EXPORTED',width);
 assert.deepEqual(JSON.parse(exported).state.route,[1]);
 await fs.writeFile(out+(mobile?'/mobile-save.json':'/desktop-save.json'),exported);
 await page.getByRole('button',{name:'返回书库',exact:true}).click();
 await page.locator('.library-shell').waitFor();
 await resume();
 await fl().locator('body.redleaf-embedded:not(.redleaf-waiting)').waitFor();
 await page.waitForTimeout(500);
 let resumed=JSON.parse(await getFrame().evaluate(()=>window.render_game_to_text()));
 assert.deepEqual(resumed.route.choices,[1]);
 await page.reload({waitUntil:'domcontentloaded'});
 await resume();
 await fl().locator('body.redleaf-embedded:not(.redleaf-waiting)').waitFor();
 assert.deepEqual(JSON.parse(await getFrame().evaluate(()=>window.render_game_to_text())).route.choices,[1]);
 // Parent settings pauses the child without granting progress.
 await page.getByRole('button',{name:'阅读设置',exact:true}).click();
 await page.waitForTimeout(150);
 assert.equal(JSON.parse(await getFrame().evaluate(()=>window.render_game_to_text())).platform.paused,true);
 await page.getByRole('button',{name:'完成',exact:true}).click();
 await page.waitForTimeout(150);
 assert.equal(JSON.parse(await getFrame().evaluate(()=>window.render_game_to_text())).platform.paused,false);
 console.log('RESUMED',width);
 results.push({viewport:[width,height],flow:'start-choice-save-export-exit-resume-reload-settings',route:[1]});
 await page.getByRole('button',{name:'返回书库',exact:true}).click();
 await page.locator('.library-shell').waitFor();
 if(!mobile){
   await page.getByRole('button',{name:'我的存档',exact:true}).click();
   await page.getByLabel('选择重生周存档').setInputFiles(out+'/desktop-save.json');
   await page.getByRole('button',{name:'确认导入重生周',exact:true}).click();
   await page.getByRole('button',{name:'关闭',exact:true}).click();
   // Seed a valid route close to the failure; actual choice and ending still run in the UI.
   let state=freshPlatformState();state.mode='game';state.tutorialSeen=true;
   for(let i=0;i<13;i++){const c=[0,1,2].find(c=>!resolveDanger(i,c,state.route));state.stats=applyEffects(state.stats,getSceneForRoute(i,state.route).choices[c].effects);state.route.push(c);}
   state.sceneIndex=13;
   const checkpoint=createSnapshot(state,[]);
   await page.evaluate(v=>localStorage.setItem('redleaf.redrain.v1',JSON.stringify(v)),checkpoint);
   await page.reload({waitUntil:'domcontentloaded'});
   await resume();
   await fl().locator('body.redleaf-embedded:not(.redleaf-waiting)').waitFor();
   await reveal();await fl().locator('#choice-list button').nth(0).click();
   for(let i=0;i<20;i++){if(JSON.parse(await getFrame().evaluate(()=>window.render_game_to_text())).mode==='ending')break;await fl().locator('#reading-advance').click();}
   await fl().locator('#ending-view:visible').waitFor();
   const failed=JSON.parse(await page.evaluate(()=>localStorage.getItem('redleaf.redrain.v1')));
   assert.equal(failed.state.endingId,'BE01');assert.ok(failed.endings.includes('BE01'));
   await page.screenshot({path:out+'/failure.png'});
   await fl().locator('#retry-failure-btn').click();
   assert.equal(JSON.parse(await getFrame().evaluate(()=>window.render_game_to_text())).mode,'game');
   await page.getByRole('button',{name:'返回书库',exact:true}).click();
   await page.getByRole('button',{name:'结局档案',exact:true}).click();
   assert.ok((await page.locator('.redrain-ending-list').innerText()).includes('门外还有十九层'));
   results.push({flow:'UI import + seeded-route actual failure choice + retry + shared ending',ending:'BE01'});
 }
 await context.close();
}
try{if(!process.argv.includes('--mobile-only'))await scenario(1440,1000);await scenario(390,844,true);assert.deepEqual(errors,[]);assert.deepEqual(httpErrors,[]);}
finally{await fs.writeFile(out+(process.argv.includes('--mobile-only')?'/verification-mobile.json':'/verification.json'),JSON.stringify({results,errors,httpErrors},null,2));await browser.close();}
console.log(JSON.stringify({results,errors,httpErrors},null,2));
