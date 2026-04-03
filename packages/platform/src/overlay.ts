import type { OverlayState } from './index';

export const isOverlayDraggableState = (state: OverlayState) => state === 'recording';

export type OverlayDisplayState = OverlayState | 'done';
export type OverlayWindowChannel = 'levels' | 'text' | 'mode';

export const getOverlayStatusLabel = (state: OverlayDisplayState) =>
  state === 'done' ? 'idle' : state;

export const shouldRequireVisibleWindowForOverlayChannel = (channel: OverlayWindowChannel) =>
  channel === 'levels';

export const VOCSEN_OVERLAY_BAR_PROFILE = [1, 0.8846, 0.704, 1, 0.8846, 0.704] as const;

export const mapWaveToVocsenOverlayLevels = (
  wave: number[],
  bars = VOCSEN_OVERLAY_BAR_PROFILE.length
) => {
  if (!Number.isFinite(bars) || bars <= 0) return [];
  if (!Array.isArray(wave) || wave.length === 0) return new Array(bars).fill(0);

  const normalized = wave.map((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
    return Math.max(-1, Math.min(1, value));
  });

  return new Array(bars).fill(0).map((_, index) => {
    const start = Math.floor((index / bars) * normalized.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / bars) * normalized.length));
    let peak = 0;
    let sum = 0;
    let count = 0;
    for (let sampleIndex = start; sampleIndex < Math.min(end, normalized.length); sampleIndex += 1) {
      const magnitude = Math.abs(normalized[sampleIndex] ?? 0);
      peak = Math.max(peak, magnitude);
      sum += magnitude;
      count += 1;
    }
    if (!count) return 0;
    const average = sum / count;
    const blended = peak * 0.66 + average * 0.34;
    const boosted = Math.pow(Math.min(1, blended * 1.45), 0.78);
    return Math.max(0, Math.min(1, boosted));
  });
};
