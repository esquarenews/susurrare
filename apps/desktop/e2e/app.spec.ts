import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const electronMain = join(__dirname, '..', 'out', 'main', 'index.js');

test('navigation and CRUD basics', async () => {
  const app = await electron.launch({
    args: [electronMain],
    env: {
      ...process.env,
      SUSURRARE_DISABLE_HOTKEYS: '1',
    },
  });
  await app.firstWindow();
  const page = await app.waitForEvent('window');
  await page.waitForURL('**/out/renderer/index.html');

  try {
    await page.evaluate(() => document.fonts.ready);
    await expect
      .poll(() => page.evaluate(() => document.fonts.check('13px "Notae Sans"')))
      .toBe(true);

    await page.getByRole('button', { name: 'Modes' }).click();
    await expect(page.getByRole('heading', { name: /^Modes\b/ })).toBeVisible();

    await page.getByRole('button', { name: 'New mode', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'New mode' }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Vocabulary' }).click();
    await expect(page.getByRole('heading', { name: /^Vocabulary\b/ })).toBeVisible();

    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.getByRole('heading', { name: /^History\b/ })).toBeVisible();
  } finally {
    await app.close();
  }
});
