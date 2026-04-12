export type TrayRecordingState = 'idle' | 'recording' | 'processing' | 'error';
export type TrayThemePreference = 'light' | 'dark' | 'system';
export type TrayIconVariant = 'light' | 'dark';
export type TrayPrimaryClickBehavior = 'toggle-window' | 'open-menu';

export type TrayMenuEntry =
  | {
      type: 'status';
      id: 'status';
      label: string;
      enabled: false;
    }
  | {
      type: 'action';
      id: 'toggle-window' | 'start-recording' | 'stop-recording' | 'help' | 'quit';
      label: string;
      enabled: boolean;
    }
  | {
      type: 'separator';
      id: string;
    };

export const resolveTrayIconVariant = (
  theme: TrayThemePreference,
  systemDark: boolean
): TrayIconVariant => {
  const effectiveTheme = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  return effectiveTheme === 'dark' ? 'dark' : 'light';
};

export const getTrayIconLookupPaths = (variant: TrayIconVariant) => {
  const fallbackVariant = variant === 'dark' ? 'light' : 'dark';
  return [
    `tray/tray-${variant}.png`,
    `resources/tray/tray-${variant}.png`,
    `tray/tray-${fallbackVariant}.png`,
    `resources/tray/tray-${fallbackVariant}.png`,
  ];
};

export const getDockIconLookupPaths = () => [
  'resources/app-icon.png',
  'build/icon.png',
  'out/renderer/images/icon-susarrare-light.png',
  'out/renderer/images/icon-susarrare-dark.png',
  'resources/tray/tray-light.png',
  'resources/tray/tray-dark.png',
];

export const getTrayPrimaryClickBehavior = (platform: NodeJS.Platform | string): TrayPrimaryClickBehavior =>
  platform === 'darwin' ? 'open-menu' : 'toggle-window';

const getTrayStatusLabel = (recordingState: TrayRecordingState) => {
  switch (recordingState) {
    case 'recording':
      return 'Recording now';
    case 'processing':
      return 'Processing recording';
    case 'error':
      return 'Ready after error';
    case 'idle':
    default:
      return 'Ready to record';
  }
};

export const buildTrayMenuModel = (options: {
  appName: string;
  recordingState: TrayRecordingState;
  windowVisible: boolean;
}): TrayMenuEntry[] => {
  const { appName, recordingState, windowVisible } = options;
  const canStart = recordingState === 'idle' || recordingState === 'error';
  const canStop = recordingState === 'recording';

  return [
    {
      type: 'status',
      id: 'status',
      label: getTrayStatusLabel(recordingState),
      enabled: false,
    },
    {
      type: 'action',
      id: 'toggle-window',
      label: `${windowVisible ? 'Hide' : 'Show'} ${appName}`,
      enabled: true,
    },
    {
      type: 'action',
      id: 'start-recording',
      label: 'Start recording',
      enabled: canStart,
    },
    {
      type: 'action',
      id: 'stop-recording',
      label: 'Stop recording',
      enabled: canStop,
    },
    { type: 'separator', id: 'separator-main' },
    {
      type: 'action',
      id: 'help',
      label: 'Help',
      enabled: true,
    },
    { type: 'separator', id: 'separator-quit' },
    {
      type: 'action',
      id: 'quit',
      label: `Quit ${appName}`,
      enabled: true,
    },
  ];
};
