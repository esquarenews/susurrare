import { describe, expect, it } from 'vitest';
import {
  estimateOpenAiTranscriptionMaxDurationMs,
  estimateSafeOpenAiTranscriptionDurationMs,
  formatDurationMinutesSeconds,
} from '@susurrare/core';

describe('recording limits', () => {
  it('estimates max OpenAI upload duration for 16kHz PCM', () => {
    const ms = estimateOpenAiTranscriptionMaxDurationMs(16000);
    expect(ms).toBe(819200);
  });

  it('estimates max OpenAI upload duration for 24kHz PCM', () => {
    const ms = estimateOpenAiTranscriptionMaxDurationMs(24000);
    expect(ms).toBe(546133);
  });

  it('applies safe headroom for proactive auto-stop', () => {
    const ms = estimateSafeOpenAiTranscriptionDurationMs(16000);
    expect(ms).toBeLessThan(estimateOpenAiTranscriptionMaxDurationMs(16000));
    expect(ms).toBe(802816);
  });

  it('returns 0 for invalid sample rates', () => {
    expect(estimateOpenAiTranscriptionMaxDurationMs(0)).toBe(0);
    expect(estimateOpenAiTranscriptionMaxDurationMs(-1)).toBe(0);
    expect(estimateOpenAiTranscriptionMaxDurationMs(Number.NaN)).toBe(0);
  });

  it('formats durations for mode limit hints', () => {
    expect(formatDurationMinutesSeconds(0)).toBe('00:00');
    expect(formatDurationMinutesSeconds(65_999)).toBe('01:05');
    expect(formatDurationMinutesSeconds(802_816)).toBe('13:22');
    expect(formatDurationMinutesSeconds(Number.NaN)).toBe('00:00');
  });
});
