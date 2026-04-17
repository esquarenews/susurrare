import { describe, expect, it } from 'vitest';
import { shouldPlaySoundEffect } from '@susurrare/core';

describe('sound effect policy', () => {
  it('does not replay a sound that is still playing', () => {
    expect(
      shouldPlaySoundEffect({
        nowMs: 1_000,
        lastPlayedAtMs: 900,
        isPlaying: true,
        minIntervalMs: 250,
      })
    ).toBe(false);
  });

  it('throttles rapid replays within the minimum interval', () => {
    expect(
      shouldPlaySoundEffect({
        nowMs: 1_000,
        lastPlayedAtMs: 850,
        isPlaying: false,
        minIntervalMs: 250,
      })
    ).toBe(false);
  });

  it('allows replay once the previous sound has finished and the interval passed', () => {
    expect(
      shouldPlaySoundEffect({
        nowMs: 1_250,
        lastPlayedAtMs: 900,
        isPlaying: false,
        minIntervalMs: 250,
      })
    ).toBe(true);
  });
});
