import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { authoredWorlds } from '../content/worlds.ts';
import { sha256 } from '../server/art-production-prompts.ts';
import { listArtBatches } from '../server/art-production.ts';
import { inspectArtWave, nextArtWaveJobs, planArtWave, resolveArtWave, type ArtWaveSelection } from '../server/art-production-wave.ts';

const root = process.cwd();
const [command = 'status', name = 'first-forty', ...flags] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(name)) throw new Error('INVALID_WAVE_NAME');
const folder = path.join(root, 'output/imagegen/scene-production/batch-vhd-20260906/waves');
const file = path.join(folder, `${name}.json`);
const batches = await listArtBatches();
const pilotId = 'scene_89cce0808c88ddb09926000189a4';
const pilotHash = 'e837cccbdf2863603abcdf2a879009d1cbb947cf821a336f704d8a18c0893d17';
const pilot = batches.flatMap(batch => batch.jobs).find(job => job.id === pilotId);
const pilotReady = !!pilot && !pilot.stale && pilot.review?.decision === 'approved' && !!pilot.asset?.native4k
  && !pilot.asset.duplicate && pilot.asset.sha256 === pilotHash
  && sha256(await readFile(path.join(root, 'public/generated-art', `${pilotId}.png`)).catch(() => Buffer.alloc(0))) === pilotHash;
if (command !== 'status' && !pilotReady) throw new Error('VERIFIED_CURRENT_STYLE_PILOT_REQUIRED');

interface Wave { createdAt: string; name: string; pilotJobId: string; selected: ArtWaveSelection[] }
let wave: Wave;
if (command === 'prepare') {
  if (flags.length) throw new Error('PREPARE_TAKES_NO_FLAGS');
  const team = path.join(root, 'output/imagegen/scene-production/art-team');
  const a = JSON.parse(await readFile(path.join(team, 'cel-drawing/short-cohort/candidates.json'), 'utf8'));
  const b = JSON.parse(await readFile(path.join(team, 'painted-background/compact-cel-ready.json'), 'utf8'));
  const c = JSON.parse(await readFile(path.join(team, 'scene-composition/calibrated-20260906/candidate-plan.json'), 'utf8'));
  const preferred: Record<string, string[]> = {};
  for (const item of a.candidates) (preferred[item.worldId] ??= []).push(item.nodeId);
  for (const world of b.worlds) preferred[world.worldId] = world.candidates.map((item: { nodeId: string }) => item.nodeId);
  for (const [worldId, items] of Object.entries(c)) preferred[worldId] = (items as { nodeId: string }[]).map(item => item.nodeId);
  const worldIds = authoredWorlds.map(world => world.id).sort((left, right) => {
    const delivered = (id: string) => batches.find(batch => batch.worldId === id)?.progress.deliveredTotal ?? 0;
    return delivered(left) - delivered(right);
  });
  wave = { createdAt: new Date().toISOString(), name, pilotJobId: pilotId,
    selected: planArtWave(batches, worldIds, 2, preferred) };
  await mkdir(folder, { recursive: true });
  await writeFile(file, JSON.stringify(wave, null, 2) + '\n', { flag: 'wx' });
} else {
  wave = JSON.parse(await readFile(file, 'utf8'));
  if (wave.name !== name || wave.pilotJobId !== pilotId) throw new Error('WAVE_IDENTITY_CHANGED');
}
if (!['prepare', 'status', 'next', 'dispatch'].includes(command)) throw new Error('UNKNOWN_WAVE_COMMAND');
if (command !== 'status') resolveArtWave(wave.selected, batches);
if (command === 'next' || command === 'dispatch') {
  const next = nextArtWaveJobs(wave.selected, batches);
  console.log(JSON.stringify({ next: next.map(job => ({ id: job.id, worldId: job.worldId, nodeId: job.nodeId })) }));
  if (command === 'dispatch' && next.length) {
    if (flags.some(flag => !/^--inspected-(native-gate|rejection-job)=.+$/.test(flag))) throw new Error('INVALID_INSPECTION_FLAG');
    const code = await new Promise<number | null>((resolve, reject) => {
      const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/art-production-vhd-batch.ts',
        'dispatch', ...next.map(job => job.id), ...flags], { cwd: root, stdio: 'inherit', windowsHide: true });
      child.once('error', reject);
      child.once('exit', resolve);
    });
    if (code !== 0) throw new Error('WAVE_DISPATCH_STOPPED');
  }
}
const status = { at: new Date().toISOString(), name, pilotJobId: pilotId, pilotReady,
  dispatchHeld: !pilotReady, ...inspectArtWave(wave.selected, batches),
  claim: command === 'dispatch' ? 'Pre-dispatch snapshot; consult live manifest for active requests.'
    : 'Exact queued scene requirements, not generated files. Each dispatch is explicit; no automatic POST retry.' };
await writeFile(path.join(folder, `${name}.status.json`), JSON.stringify(status, null, 2) + '\n');
console.log(JSON.stringify(status));
