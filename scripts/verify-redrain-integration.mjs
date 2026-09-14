import { chromium } from 'playwright';
import fs from 'node:fs/promises';
const out='E:/知乎/output/playwright/redrain-integrated';
await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
const errors=[]; page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
try {
 await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('[data-story-id="redrain-rebirth-week"]').waitFor({timeout:30000});
 await page.locator('[data-story-id="redrain-rebirth-week"] .story-card-open').click();
 await page.locator('#redrain-start').click();
 const frame=page.frameLocator('iframe[title="末日的45度角躺平：重生周"]');
 await frame.locator('body.redleaf-embedded:not(.redleaf-waiting)').waitFor({timeout:20000});
 await page.screenshot({path:out+'/prologue.png'});
 console.log(JSON.stringify({body:(await page.locator('body').innerText()).slice(0,1600),child:(await frame.locator('body').innerText()).slice(0,800),errors}));
 await fs.writeFile(out+'/smoke.json',JSON.stringify({errors,state:await page.evaluate(()=>window.render_game_to_text?.()),saved:await page.evaluate(()=>localStorage.getItem('redleaf.redrain.v1'))},null,2));
} finally {await browser.close();}

