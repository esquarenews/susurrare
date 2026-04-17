type HotkeyStartupFailureInput = {
  platform: NodeJS.Platform;
  hotkeysEnabled: boolean;
  isPackaged: boolean;
  pushToTalkRegistered: boolean;
  pushToTalkKey: string;
};

export const getHotkeyStartupFailureMessage = ({
  platform,
  hotkeysEnabled,
  isPackaged,
  pushToTalkRegistered,
  pushToTalkKey,
}: HotkeyStartupFailureInput) => {
  if (!hotkeysEnabled) return null;
  if (platform !== 'darwin') return null;
  if (isPackaged) return null;
  if (pushToTalkRegistered) return null;
  return [
    `Push-to-talk hotkey ${pushToTalkKey} failed to register during development startup.`,
    'Vocsen exits immediately in this state because hold-to-talk will not work.',
    'Rebuild the desktop app and restart `pnpm dev`.',
  ].join(' ');
};
