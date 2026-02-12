import type { PlatformAdapter } from '@susurrare/platform';
import { macosAdapter } from '@susurrare/platform-macos';
import { windowsAdapter } from '@susurrare/platform-windows';

export const platformAdapter: PlatformAdapter =
  process.platform === 'darwin' ? macosAdapter : windowsAdapter;
