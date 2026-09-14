import type { ArtBatch, ArtJob } from '../shared/production.ts';

export function inspectCalibrationGate(
  gate: ArtBatch['circuitBreaker'],
  jobs: ArtJob[],
  evidence: { nativeGateAt?: string; rejectionJobId?: string; recoveredJobId?: string },
): ArtJob | undefined {
  if (!gate) return;
  if (Object.values(evidence).filter(Boolean).length > 1) throw new Error('AMBIGUOUS_GATE_EVIDENCE');
  if (evidence.recoveredJobId) {
    const recovered = jobs.find(job => job.id === evidence.recoveredJobId);
    if (gate.code !== 'TRANSPORT_TIMEOUT_UNKNOWN' || !recovered
      || !['generated', 'resolution_mismatch'].includes(recovered.state)
      || recovered.paidAttempts !== 1 || recovered.recoveryAttempts < 1 || !recovered.recoveryAvailable
      || !recovered.asset?.originalPixels || recovered.asset.duplicate || !recovered.review
      || (!recovered.asset.native4k && recovered.review.decision !== 'rejected')
      || !recovered.failureHistory?.some(item => item.code === gate.code && item.at === gate.at))
      throw new Error('EXACT_REVIEWED_RECOVERED_DELIVERY_REQUIRED');
    return recovered;
  }
  if (evidence.nativeGateAt) {
    if (gate.code !== 'NATIVE_4K_GATE_FAILED' || gate.at !== evidence.nativeGateAt
      || jobs.some(job => job.asset && !job.asset.native4k && job.review?.decision !== 'rejected'))
      throw new Error('EXACT_REVIEWED_NATIVE_GATE_REQUIRED');
    return;
  }
  const failed = jobs.find(job => job.id === evidence.rejectionJobId);
  if (gate.code !== 'UPSTREAM_PROMPT_REJECTED' || !failed || failed.state !== 'failed'
    || failed.paidAttempts !== 1 || failed.asset || failed.recoveryAvailable
    || !failed.failureHistory?.some(item => item.code === gate.code && item.at === gate.at))
    throw new Error('EXACT_INSPECTED_REJECTION_REQUIRED');
  return failed;
}
