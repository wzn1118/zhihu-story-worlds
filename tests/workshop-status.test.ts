import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkshopProject } from '../shared/workshop.ts';
import { workshopEditorialPresentation } from '../src/workshop-status.ts';

type ProjectStatus = Pick<WorkshopProject, 'status' | 'revision' | 'editorial'>;
const failedReview: NonNullable<WorkshopProject['editorial']> = {
  status: 'failed', revision: 2,
  message: 'Provider request failed. Resume to retry. Previous findings: unresolved scene causality.',
};

test('resuming the same revision separates old failure instructions from current editorial status', () => {
  const project: ProjectStatus = { status: 'running', revision: 2, editorial: { ...failedReview } };
  const before = structuredClone(project);
  const result = workshopEditorialPresentation(project);
  assert.equal(result.current, undefined);
  assert.deepEqual(result.history, failedReview);
  assert.deepEqual(project, before);
});

test('an actually failed project keeps its full failure and review findings in the current status', () => {
  const result = workshopEditorialPresentation({ status: 'failed', revision: 2, editorial: failedReview });
  assert.equal(result.current, failedReview);
  assert.equal(result.history, undefined);
});

test('an interrupted project retains its available editorial message', () => {
  const result = workshopEditorialPresentation({ status: 'interrupted', revision: 2, editorial: failedReview });
  assert.equal(result.current, failedReview);
  assert.equal(result.history, undefined);
});

for (const status of ['pending', 'reviewing', 'passed'] as const) {
  test(`running projects retain a current-revision ${status} record`, () => {
    const editorial = { ...failedReview, status, message: `${status} record` };
    const result = workshopEditorialPresentation({ status: 'running', revision: 2, editorial });
    assert.equal(result.current, editorial);
    assert.equal(result.history, undefined);
  });
}

for (const status of ['failed', 'passed', 'reviewing'] as const) {
  test(`a previous revision's ${status} record is historical, not the current draft result`, () => {
    const editorial = { ...failedReview, status };
    const result = workshopEditorialPresentation({ status: 'running', revision: 3, editorial });
    assert.equal(result.current, undefined);
    assert.equal(result.history, editorial);
  });
}

test('a published current revision retains its passed review and advisory findings', () => {
  const editorial = { ...failedReview, status: 'passed' as const, message: 'No blockers; two advisory findings retained.' };
  assert.deepEqual(workshopEditorialPresentation({ status: 'ready', revision: 2, editorial }), {
    current: editorial, history: undefined,
  });
});

test('a project with no editorial record has neither a current result nor invented history', () => {
  for (const status of ['idle', 'running', 'failed', 'interrupted', 'ready'] as const) {
    assert.deepEqual(workshopEditorialPresentation({ status, revision: 0 }), {
      current: undefined, history: undefined,
    });
  }
});
