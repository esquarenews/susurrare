import { describe, expect, it } from 'vitest';
import {
  VOCSEN_OVERLAY_BAR_PROFILE,
  getOverlayStatusLabel,
  isOverlayDraggableState,
  mapWaveToVocsenOverlayLevels,
  shouldRequireVisibleWindowForOverlayChannel,
} from '../../platform/src/overlay';

describe('overlay interaction policy', () => {
  it('allows dragging only while recording', () => {
    expect(isOverlayDraggableState('recording')).toBe(true);
    expect(isOverlayDraggableState('processing')).toBe(false);
    expect(isOverlayDraggableState('done')).toBe(false);
    expect(isOverlayDraggableState('idle')).toBe(false);
  });

  it('maps the done visual state back to an idle status label', () => {
    expect(getOverlayStatusLabel('recording')).toBe('recording');
    expect(getOverlayStatusLabel('processing')).toBe('processing');
    expect(getOverlayStatusLabel('idle')).toBe('idle');
    expect(getOverlayStatusLabel('done')).toBe('idle');
  });

  it('allows mode and transcript updates before the overlay becomes visible', () => {
    expect(shouldRequireVisibleWindowForOverlayChannel('levels')).toBe(true);
    expect(shouldRequireVisibleWindowForOverlayChannel('text')).toBe(false);
    expect(shouldRequireVisibleWindowForOverlayChannel('mode')).toBe(false);
  });

  it('maps voice energy into one normalized level per Vocsen bar', () => {
    const levels = mapWaveToVocsenOverlayLevels([1, 0.9, 0.7, 0.4, 0.2, 0]);

    expect(levels).toHaveLength(VOCSEN_OVERLAY_BAR_PROFILE.length);
    for (const level of levels) {
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it('keeps louder waveform sections louder in the mapped bars', () => {
    const levels = mapWaveToVocsenOverlayLevels([
      1,
      0.95,
      0.72,
      0.68,
      0.45,
      0.4,
      0.2,
      0.18,
      0.9,
      0.86,
      0.08,
      0.04,
    ]);

    expect(levels[0]).toBeGreaterThan(levels[3]);
    expect(levels[4]).toBeGreaterThan(levels[5]);
  });

  it('returns silence for empty or invalid waveform input', () => {
    expect(mapWaveToVocsenOverlayLevels([])).toEqual(new Array(VOCSEN_OVERLAY_BAR_PROFILE.length).fill(0));
    expect(mapWaveToVocsenOverlayLevels([Number.NaN, Infinity, -Infinity])).toEqual(
      new Array(VOCSEN_OVERLAY_BAR_PROFILE.length).fill(0)
    );
  });

  it('gives quieter speech a visible response', () => {
    const levels = mapWaveToVocsenOverlayLevels(new Array(12).fill(0.08));

    expect(levels).toHaveLength(VOCSEN_OVERLAY_BAR_PROFILE.length);
    for (const level of levels) {
      expect(level).toBeGreaterThan(0.15);
    }
  });
});
