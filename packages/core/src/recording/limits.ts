export const OPENAI_TRANSCRIPTION_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const DEFAULT_PCM_BYTES_PER_SAMPLE = 2;
export const DEFAULT_SAFE_HEADROOM_BYTES = 512 * 1024;

export const estimateOpenAiTranscriptionMaxDurationMs = (
  sampleRate: number,
  maxUploadBytes = OPENAI_TRANSCRIPTION_MAX_UPLOAD_BYTES,
  bytesPerSample = DEFAULT_PCM_BYTES_PER_SAMPLE
) => {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) return 0;
  if (!Number.isFinite(maxUploadBytes) || maxUploadBytes <= 0) return 0;
  if (!Number.isFinite(bytesPerSample) || bytesPerSample <= 0) return 0;
  const bytesPerSecond = sampleRate * bytesPerSample;
  const seconds = maxUploadBytes / bytesPerSecond;
  return Math.floor(seconds * 1000);
};

export const estimateSafeOpenAiTranscriptionDurationMs = (
  sampleRate: number,
  headroomBytes = DEFAULT_SAFE_HEADROOM_BYTES
) => {
  const effectiveBytes = Math.max(0, OPENAI_TRANSCRIPTION_MAX_UPLOAD_BYTES - headroomBytes);
  return estimateOpenAiTranscriptionMaxDurationMs(sampleRate, effectiveBytes);
};

export const formatDurationMinutesSeconds = (durationMs: number) => {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '00:00';
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};
