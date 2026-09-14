import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { freshPlatformState } from '../public/games/redrain/src/platform-state.js';
const base = process.argv[2] || 'http://127.0.0.1:18081/games/redrain';
const output = new URL('../output/redrain-performance-v2/', import.meta.url);
const browser = await chromium.launch({headless:true});
const checks=[];
const { RESPONSIVE_ASSETS } = await import('../public/games/redrain/src/responsive-assets.js');
const delayedPaths = RESPONSIVE_ASSETS['./public/assets/v6/retro-anime/d08/portrait-main.png'].map(item => item.url.slice(1));
async function open({pageIndex=3, mobile=false, fallback=false, delayed=false}={}) {
  const context=await browser.newContext({viewport:mobile ? {width:390,height:844}:{width:1440,height:960}});
  const errors=[];
  const page=await context.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  const seed={...freshPlatformState(),mode:'game',tutorialSeen:true,readingCursor:{identity:'first-proof:',page:pageIndex,complete:true,reachedEnd:false}};
  await context.addInitScript(seed=>{
    if(!localStorage.getItem('doomsday-45-degree-save-v2')) localStorage.setItem('doomsday-45-degree-save-v2',JSON.stringify(seed));
    localStorage.setItem('doomsday-45-degree-reading-v1',JSON.stringify({speed:'instant',reducedMotion:true}));
  },seed);
  if(fallback) await page.route('**/public/assets/optimized/*.webp',route=>route.abort());
  if(delayed) await page.route(url => delayedPaths.some(path => url.pathname.endsWith(path)),async route=>{await new Promise(r=>setTimeout(r,1500));try{await route.continue();}catch{}});
  await page.goto(`${base}/index.html`,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>typeof window.render_game_to_text==='function');
  return {context,page,errors};
}
const ready=(page,character)=>page.waitForFunction(character=>{const s=document.querySelector('#character-stage');return s.dataset.status==='ready'&&s.dataset.character===character;},character);
try {
  {
    const {context,page,errors}=await open({fallback:true});
    await ready(page,'崔语心');
    const src=await page.locator('#character-stage img').getAttribute('src');
    assert.match(src,/d08\/portrait-main\.png$/);
    checks.push({case:'WebP download failure uses the original speaker PNG',src,errors});
    assert.deepEqual(errors,[]);await context.close();
  }
  {
    const {context,page,errors}=await open({delayed:true});
    await page.locator('#reading-advance').click();
    await ready(page,'楼绎');
    await page.waitForTimeout(1800);
    assert.equal(await page.locator('#character-stage').getAttribute('data-character'),'楼绎');
    checks.push({case:'rapid page change rejects the previous speaker delayed load',errors});
    assert.deepEqual(errors,[]);await context.close();
  }
  {
    const {context,page,errors}=await open({mobile:true});
    await ready(page,'崔语心');
    await page.locator('#reading-advance').click();await ready(page,'楼绎');
    await page.locator('#choice-list button').first().click();
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('doomsday-45-degree-save-v2')).route.length===1);
    await page.waitForFunction(()=>document.querySelector('#character-stage').dataset.status==='ready');
    const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('doomsday-45-degree-save-v2')));
    await page.reload();
    await page.waitForFunction(()=>document.querySelector('#character-stage').dataset.status==='ready');
    const after=await page.evaluate(()=>JSON.parse(localStorage.getItem('doomsday-45-degree-save-v2')));
    assert.deepEqual(after.route,before.route);assert.equal(after.outcome,before.outcome);
    assert.equal(after.readingCursor.page,before.readingCursor.page);
    await page.screenshot({path:new URL('mobile-outcome.png',output).pathname});
    checks.push({case:'mobile choice, reaction portrait, and reading position survive reload',route:after.route,errors});
    assert.deepEqual(errors,[]);await context.close();
  }
  await writeFile(new URL('behavior-report.json',output),JSON.stringify({base,checks},null,2));
  console.log(JSON.stringify({ok:true,checks}));
}finally{await browser.close();}
