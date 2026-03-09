import { describe, expect, it } from 'vitest';
import { shouldWarmSoundPlayer } from '@susurrare/core';

describe('sound warm policy', () => {
  it('does not warm while a warm-up is already in flight', () => {
    expect(
      shouldWarmSoundPlayer({
        nowMs: 10_000,
        lastWarmAtMs: 0,
        inFlight: true,
        minIntervalMs: 500,
        staleAfterMs: 60_000,
      })
    ).toBe(false);
  });

  it('warms when stale threshold is reached', () => {
    expect(
      shouldWarmSoundPlayer({
        nowMs: 70_000,
        lastWarmAtMs: 0,
        inFlight: false,
        minIntervalMs: 500,
        staleAfterMs: 60_000,
      })
    ).toBe(true);
  });

  it('does not warm when still fresh and not forced', () => {
    expect(
      shouldWarmSoundPlayer({
        nowMs: 20_000,
        lastWarmAtMs: 10_000,
        inFlight: false,
        minIntervalMs: 500,
        staleAfterMs: 60_000,
      })
    ).toBe(false);
  });

  it('allows forced warm-up after minimum interval', () => {
    expect(
      shouldWarmSoundPlayer({
        nowMs: 10_000,
        lastWarmAtMs: 8_000,
        inFlight: false,
        force: true,
        minIntervalMs: 500,
        staleAfterMs: 60_000,
      })
    ).toBe(true);
  });

  it('throttles forced warm-up within the minimum interval', () => {
    expect(
      shouldWarmSoundPlayer({
        nowMs: 10_000,
        lastWarmAtMs: 9_800,
        inFlight: false,
        force: true,
        minIntervalMs: 500,
        staleAfterMs: 60_000,
      })
    ).toBe(false);
  });
});
