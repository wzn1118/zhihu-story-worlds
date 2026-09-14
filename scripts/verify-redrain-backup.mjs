import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import {parseTransfer} from '../shared/redrain-state.mjs';
const out='E:/知乎/output/playwright/redrain-integrated';
const save=parseTransfer(await fs.readFile(out+'/desktop-save.json','utf8'));
const browser=await chromium.launch({headless:true,channel:'chrome'});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
await context.addInitScript(()=>localStorage.setItem('redleaf.liukan.introduction.v1',JSON.stringify({seen:true})));
const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
await page.goto('http://127.0.0.1:4194/',{waitUntil:'domcontentloaded'});
await page.evaluate(v=>localStorage.setItem('redleaf.redrain.v1',JSON.stringify(v)),save);await page.reload({waitUntil:'domcontentloaded'});
await page.getByRole('button',{name:'我的存档',exact:true}).click();await page.locator('.redrain-backup summary').click();
const input=page.getByLabel('重生周存档备份文本');const text=await input.inputValue();assert.deepEqual(parseTransfer(text),save);
await input.focus();assert.equal(await input.evaluate(el=>el.selectionEnd-el.selectionStart),text.length);
await page.getByLabel('选择重生周存档').setInputFiles({name:'copied-backup.json',mimeType:'application/json',buffer:Buffer.from(text)});
await page.getByRole('button',{name:'确认导入重生周',exact:true}).click();
assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('redleaf.redrain.v1')).state.route),[1]);
await page.screenshot({path:out+'/save-backup.png'});assert.deepEqual(errors,[]);
await fs.writeFile(out+'/backup-verification.json',JSON.stringify({flow:'backup visible text, full selection and UI import roundtrip',route:[1],errors},null,2));
}finally{await browser.close();}
console.log('Backup text selection and UI import PASS');
