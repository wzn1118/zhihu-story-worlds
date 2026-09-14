import { join } from 'node:path';
import { StoryWorkshop, jsonFile } from '../server/story-workshop.ts';
import { editorialPolicyHash, readEditorialNotes } from '../server/workshop-editorial-job.ts';

const service = new StoryWorkshop();
const rows = [];
for (const id of process.argv.slice(2)) {
  const project = await service.get(id), source = await service.source(id), directory = join(service.dir(id), `r${project.revision}`);
  const notes = await readEditorialNotes(directory, source);
  const ledger = await jsonFile<{ policyHash?: string; status: string }>(join(directory, 'editorial-run.json'));
  const expected = editorialPolicyHash(notes);
  rows.push({ id, jobId: project.jobId, revision: project.revision, status: project.status, stage: project.stage, observedPolicy: ledger.policyHash, expectedPolicy: expected, matches: ledger.policyHash === expected, notes: notes?.notes.length ?? 0 });
}
console.log(JSON.stringify(rows.length === 1 ? rows[0] : rows, null, 2));
