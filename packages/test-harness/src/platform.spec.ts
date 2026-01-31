import { describe, expect, it } from 'vitest';
import { windowsAdapter } from '../../platform-windows/src/index';

const expectNotImplemented = async (fn: () => Promise<unknown>) => {
  await expect(fn()).rejects.toThrow('Not Implemented');
};

describe('platform windows adapter', () => {
  it('throws for unimplemented features', async () => {
    await expectNotImplemented(() =>
      windowsAdapter.hotkey.registerHotkey({ key: 'F15', action: 'hold' }, () => undefined)
    );
    await expectNotImplemented(() => windowsAdapter.audioCapture.start());
    await expectNotImplemented(() => windowsAdapter.audioCapture.stop());
    await expectNotImplemented(() => windowsAdapter.audioCapture.cancel());
    await expectNotImplemented(() => windowsAdapter.insertText.atCursor('hi'));
    await expectNotImplemented(() => windowsAdapter.clipboard.set('hi'));
    await expectNotImplemented(() => windowsAdapter.clipboard.get());
    await expectNotImplemented(() => windowsAdapter.overlay.show('recording'));
    await expectNotImplemented(() => windowsAdapter.overlay.hide());
    await expectNotImplemented(() => windowsAdapter.permissions.check());
    await expectNotImplemented(() => windowsAdapter.permissions.requestGuidance());
  });
});
