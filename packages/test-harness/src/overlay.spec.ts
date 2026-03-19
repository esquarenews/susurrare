import { describe, expect, it } from 'vitest';
import { isOverlayDraggableState } from '../../platform/src/overlay';

describe('overlay interaction policy', () => {
  it('allows dragging only while recording', () => {
    expect(isOverlayDraggableState('recording')).toBe(true);
    expect(isOverlayDraggableState('processing')).toBe(false);
    expect(isOverlayDraggableState('done')).toBe(false);
    expect(isOverlayDraggableState('idle')).toBe(false);
  });
});
