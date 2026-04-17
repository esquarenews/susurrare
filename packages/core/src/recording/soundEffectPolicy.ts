type SoundEffectPolicyInput = {
  nowMs: number;
  lastPlayedAtMs: number;
  isPlaying: boolean;
  minIntervalMs: number;
};

export const shouldPlaySoundEffect = ({
  nowMs,
  lastPlayedAtMs,
  isPlaying,
  minIntervalMs,
}: SoundEffectPolicyInput) => {
  if (isPlaying) return false;
  if (nowMs - lastPlayedAtMs < minIntervalMs) return false;
  return true;
};
