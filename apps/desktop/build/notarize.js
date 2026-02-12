/* eslint-disable @typescript-eslint/no-var-requires */
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_ID_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.warn('Notarization skipped: missing APPLE_ID / APPLE_ID_PASSWORD / APPLE_TEAM_ID');
    return;
  }

  const appName = 'Susurrare.app';
  await notarize({
    appBundleId: 'com.susurrare.desktop',
    appPath: `${appOutDir}/${appName}`,
    appleId,
    appleIdPassword,
    teamId,
  });
};
