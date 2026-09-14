import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { StoryWorkshop, alive, jsonFile, type LockOwner } from '../server/story-workshop.ts';
import { editorialPolicyHash, readEditorialNotes, type EditorialNotes } from '../server/workshop-editorial-job.ts';
import type { ImportedSource, WorkshopProject } from '../shared/workshop.ts';

const id = process.argv[2], service = new StoryWorkshop(), revise = process.argv.includes('--revise');
const observe = process.argv.includes('--observe');
assert.ok(!(revise && observe));
const before = await service.get(id), source = await service.source(id);
assert.ok(observe ? before.status === 'running' : revise ? before.status === 'ready' && before.playable && before.publishedVersion : ['failed', 'interrupted'].includes(before.status));
assert.equal(source.origin?.contentScope, 'search-excerpt');
const revision = before.revision + (revise ? 1 : 0);
const directory = join(service.dir(id), `r${revision}`);
const recovery = await jsonFile<{ appliedAt?: string; notes: EditorialNotes }>(join(directory, 'draft-recovery.json')).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; });
const oldVersion = revise ? before.publishedVersion! : undefined;
const notes = recovery && !recovery.appliedAt ? recovery.notes : await readEditorialNotes(oldVersion ? join(service.dir(id), oldVersion) : directory, source);
const ledgerFile = join(directory, 'editorial-run.json');
const beforeLedgerTime = await stat(ledgerFile).then(info => info.mtimeMs).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; });
const oldDraft = oldVersion ? await readFile(join(service.dir(id), oldVersion, 'draft.json'), 'utf8') : undefined;
const oldWorld = oldVersion ? await readFile(join(service.dir(id), oldVersion, 'world.json'), 'utf8') : undefined;
const expectedPolicy = editorialPolicyHash(notes);
const base = process.env.WORKSHOP_URL || 'http://127.0.0.1:4173';
const output = resolve(`output/playwright/zhihu-${observe ? 'observation' : revise ? 'revision' : 'resume'}`, new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const errors: string[] = [], results = [];
let next: WorkshopProject | undefined = observe ? before : undefined;
let reviewEntry: Record<string, unknown> | undefined;
try {
  for (const viewport of [{ name: 'desktop', width: 1440, height: 1000 }, { name: 'mobile', width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base);
    if (revise) {
      await page.getByTitle('新故事工作台', { exact: true }).click();
      await page.locator('.workshop-project').filter({ has: page.locator('b', { hasText: before.title }) }).click();
    } else {
      await page.locator(`.new-adaptation-list [data-project-id="${id}"]`).getByRole('button', { name: '查看制作', exact: true }).click();
    }
    if (viewport.name === 'desktop') {
      if (!observe) {
      const action = revise ? '校订生成稿 · 保留旧版' : '从完成阶段续跑';
      await page.getByRole('button', { name: action, exact: true }).waitFor();
      await page.locator('.workshop-detail').screenshot({ path: resolve(output, `desktop-before-${revise ? 'revision' : 'resume'}.png`) });
      const response = page.waitForResponse(value => value.url() === `${base}/api/workshop/projects/${id}/generate` && value.request().method() === 'POST');
      await page.getByRole('button', { name: action, exact: true }).click();
      const resumed = await response; assert.equal(resumed.status(), 202); next = await resumed.json();
      assert.ok(next); assert.notEqual(next.jobId, before.jobId); assert.equal(next.revision, revision); assert.equal(next.sourceHash, before.sourceHash); assert.equal(next.status, 'running');
      assert.deepEqual(resumed.request().postDataJSON(), { mode: revise ? 'revise' : 'resume' });
      if (revise) {
        assert.equal(next.publishedVersion, oldVersion); assert.equal(next.basedOnVersion, oldVersion); assert.ok(next.playable);
        assert.deepEqual(await jsonFile(join(directory, 'draft.json')), JSON.parse(oldDraft!));
        const published = await page.request.get(`${base}/api/workshop/projects/${id}/world?version=${oldVersion}`);
        assert.equal(published.status(), 200); assert.deepEqual(await published.json(), JSON.parse(oldWorld!));
      }
      }
      const deadline = Date.now() + 20 * 60_000;
      for (;;) {
        const progress = await service.get(id);
        assert.equal(progress.jobId, next!.jobId, 'The observed worker must still own this job');
        assert.equal(progress.attempts, next!.attempts); assert.equal(progress.revision, revision);
        assert.equal(progress.status, 'running', progress.error?.message ?? 'The resumed job must remain running until the required review begins');
        const lock = join(service.dir(id), 'job.lock');
        const owner = await jsonFile<LockOwner>(join(lock, 'owner.json'));
        assert.equal(owner.token, next!.jobId); assert.ok(alive(owner.pid));
        const ledger = await jsonFile<{ policyHash: string }>(ledgerFile).catch(error => { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; });
        const ledgerTime = ledger ? (await stat(ledgerFile)).mtimeMs : undefined;
        const lockCreated = (await stat(lock)).birthtimeMs;
        // Atomic ledger replacement must belong to this lease, not the prior job.
        const fresh = ledgerTime !== undefined && ledgerTime >= lockCreated && (observe || ledgerTime !== beforeLedgerTime);
        if (fresh && progress.stage === 'editorial' && ledger?.policyHash === expectedPolicy) {
          reviewEntry = { jobId: owner.token, attempt: progress.attempts, workerPid: owner.pid, ledgerMtimeMs: ledgerTime, leaseCreatedMs: lockCreated, policyHash: ledger.policyHash };
          break;
        }
        assert.ok(Date.now() < deadline, 'The resumed worker must actually load the recorded requirements');
        await page.waitForTimeout(1000);
      }
    }
    await page.getByRole('button', { name: '从完成阶段续跑', exact: true }).waitFor({ state: 'detached' });
    assert.equal(await page.getByRole('button', { name: '校订生成稿 · 保留旧版', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '重新生成新版本', exact: true }).count(), 0);
    await page.locator('.workshop-detail').screenshot({ path: resolve(output, `${viewport.name}-resumed.png`) });
    await page.getByRole('button', { name: '读导入原文', exact: true }).click();
    assert.equal(await page.getByTestId('imported-source-text').textContent(), source.text);
    await page.getByRole('button', { name: '返回工作台', exact: true }).click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    results.push({ viewport: viewport.name, exactSource: true, duplicateGenerationControlsAbsent: true });
    await context.close();
  }
  assert.deepEqual(await service.source(id), source as ImportedSource); assert.deepEqual(errors, []);
  if (oldVersion) {
    assert.equal(await readFile(join(service.dir(id), oldVersion, 'draft.json'), 'utf8'), oldDraft);
    assert.equal(await readFile(join(service.dir(id), oldVersion, 'world.json'), 'utf8'), oldWorld);
  }
  const record = { status: 'passed', id, mode: observe ? 'observe' : revise ? 'revise' : 'resume', oldJobId: before.jobId, newJobId: next!.jobId, revision, sourceHash: before.sourceHash, actualPolicyHash: expectedPolicy, reviewEntry, actualBrowserAction: !observe, ...(oldVersion ? { preservedVersion: oldVersion, preservedDraftAndWorld: true } : {}), results, errors };
  await writeFile(resolve(output, 'verification.json'), JSON.stringify(record, null, 2));
  console.log(JSON.stringify({ output, ...record }, null, 2));
} catch (error) {
  for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {});
  await writeFile(resolve(output, 'failure.json'), JSON.stringify({ id, oldJobId: before.jobId, newJobId: next?.jobId, results, error: String(error) }, null, 2));
  console.log(output); throw error;
} finally { await browser.close(); }
