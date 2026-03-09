export interface SoundWarmPolicyInput {
  nowMs: number;
  lastWarmAtMs: number;
  inFlight: boolean;
  force?: boolean;
  minIntervalMs: number;
  staleAfterMs: number;
}

export const shouldWarmSoundPlayer = ({
  nowMs,
  lastWarmAtMs,
  inFlight,
  force = false,
  minIntervalMs,
  staleAfterMs,
}: SoundWarmPolicyInput) => {
  if (inFlight) return false;

  const elapsedMs = Math.max(0, nowMs - lastWarmAtMs);
  if (elapsedMs < minIntervalMs) return false;
  if (force) return true;
  return elapsedMs >= staleAfterMs;
};
