import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ArtJob } from '../shared/production.ts';
import { inspectCalibrationGate } from '../server/art-production-calibration.ts';

const at = '2026-09-06T06:37:48.401Z';
const failure = { id: 'failed-job', state: 'failed', paidAttempts: 1, recoveryAvailable: false,
  failureHistory: [{ code: 'UPSTREAM_PROMPT_REJECTED', at }] } as ArtJob;
const lowImage = { id: 'low-image', asset: { native4k: false }, review: { decision: 'rejected' } } as ArtJob;

test('a reviewed native delivery gate permits only its exact inspected timestamp', () => {
  const gate = { code: 'NATIVE_4K_GATE_FAILED', at };
  assert.equal(inspectCalibrationGate(gate, [lowImage], { nativeGateAt: at }), undefined);
  assert.throws(() => inspectCalibrationGate(gate, [lowImage], { nativeGateAt: 'older' }));
  assert.throws(() => inspectCalibrationGate(gate, [{ ...lowImage, review: undefined }], { nativeGateAt: at }));
  assert.throws(() => inspectCalibrationGate(gate, [lowImage], {}));
});

test('rejection evidence must match the exact failed job and durable error event', () => {
  const gate = { code: 'UPSTREAM_PROMPT_REJECTED', at };
  assert.equal(inspectCalibrationGate(gate, [failure], { rejectionJobId: failure.id }), failure);
  for (const changed of [
    { ...failure, recoveryAvailable: true }, { ...failure, paidAttempts: 2 },
    { ...failure, state: 'unknown_outcome' }, { ...failure, asset: lowImage.asset },
    { ...failure, failureHistory: [{ code: gate.code, at: 'older' }] },
  ]) assert.throws(() => inspectCalibrationGate(gate, [changed as ArtJob], { rejectionJobId: failure.id }));
  assert.throws(() => inspectCalibrationGate(gate, [failure], { rejectionJobId: 'different' }));
});

test('calibration evidence never acknowledges funding, rate, transport or uncertain gates', () => {
  for (const code of ['HTTP_401', 'HTTP_402', 'HTTP_403', 'HTTP_429', 'TRANSPORT_TIMEOUT_UNKNOWN', 'WORKER_ERROR_INSPECT_BEFORE_RETRY']) {
    assert.throws(() => inspectCalibrationGate({ code, at }, [lowImage, failure], { nativeGateAt: at }));
    assert.throws(() => inspectCalibrationGate({ code, at }, [lowImage, failure], { rejectionJobId: failure.id }));
  }
  assert.throws(() => inspectCalibrationGate({ code: 'NATIVE_4K_GATE_FAILED', at }, [lowImage],
    { nativeGateAt: at, rejectionJobId: failure.id }));
});

test('transport continuation requires an actually recovered reviewed delivery, never a new POST', () => {
  const gate = { code: 'TRANSPORT_TIMEOUT_UNKNOWN', at };
  const recovered = { id: 'recovered-job', state: 'generated', paidAttempts: 1, recoveryAttempts: 1,
    recoveryAvailable: true, asset: { originalPixels: true, native4k: true, duplicate: false },
    review: { decision: 'approved' }, failureHistory: [gate] } as ArtJob;
  assert.equal(inspectCalibrationGate(gate, [recovered], { recoveredJobId: recovered.id }), recovered);
  for (const change of [{ state: 'recoverable' }, { state: 'unknown_outcome' }, { asset: undefined },
    { review: undefined }, { recoveryAttempts: 0 }, { paidAttempts: 2 }, { failureHistory: [] },
    { asset: { ...recovered.asset!, duplicate: true } }]) {
    assert.throws(() => inspectCalibrationGate(gate, [{ ...recovered, ...change } as ArtJob],
      { recoveredJobId: recovered.id }), /RECOVERED_DELIVERY/);
  }
  for (const code of ['HTTP_401', 'HTTP_402', 'HTTP_403', 'HTTP_429']) {
    assert.throws(() => inspectCalibrationGate({ code, at }, [recovered], { recoveredJobId: recovered.id }));
  }
  const small = { ...recovered, state: 'resolution_mismatch', asset: { ...recovered.asset!, native4k: false } } as ArtJob;
  assert.throws(() => inspectCalibrationGate(gate, [small], { recoveredJobId: small.id }));
  small.review = { ...small.review!, decision: 'rejected' };
  assert.equal(inspectCalibrationGate(gate, [small], { recoveredJobId: small.id }), small);
});
