/**
 * Options page — the first surface with real rendering and no unit coverage of
 * it (docs/TESTING.md §3f, §3g). These assert what a person otherwise has to
 * eyeball: every section is present, the live previews recompute, the size
 * guard escalates, reset works, and the theme control drives `data-theme`
 * across the six theme × system combinations.
 *
 * The theme test also attaches a screenshot of each combination to the report,
 * so the visual half of §3g can be reviewed without re-running the app by hand.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, optionsUrl } from './fixtures';

/** Named, browsable copies of the theme matrix, alongside the report attachments. */
const SHOTS_DIR = path.join(fileURLToPath(new URL('.', import.meta.url)), 'output', 'screenshots');

/** Section order from spec.md §9.4, as rendered by Options.tsx. */
const SECTIONS = [
  'Templates',
  'Behaviour',
  'History',
  'Appearance',
  'Diagnostics',
  'Shortcuts',
  'About',
] as const;

test.describe('Options page', () => {
  test('every section renders', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(optionsUrl(extensionId));

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('DSA Helper — Settings');
    for (const title of SECTIONS) {
      await expect(page.getByRole('heading', { level: 2, name: title })).toBeVisible();
    }
  });

  test('the YouTube preview recomputes as the template is edited', async ({
    context,
    extensionId,
  }) => {
    const page = await context.newPage();
    await page.goto(optionsUrl(extensionId));

    // Rendered against the bundled SAMPLE problem (LeetCode 912 Sort an Array).
    await page.locator('#yt').fill('CHECK {number} {title}');
    await expect(page.locator('p.preview')).toHaveText('CHECK 912 Sort an Array');
  });

  test('the prompt size counter goes ok → warn → over', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(optionsUrl(extensionId));

    const promptField = page.locator('.field', { has: page.locator('#prompt') });
    const counter = promptField.locator('.counter');

    // Bytes ≈ key ('promptTemplate') + JSON-quoted value ≈ length + 16.
    // Warn at ≥ 7168 bytes, refuse at > 8192 (core/storage.ts).
    await page.locator('#prompt').fill('a'.repeat(100));
    await expect(counter).toHaveClass('counter');

    await page.locator('#prompt').fill('a'.repeat(7200));
    await expect(counter).toHaveClass(/warn/);

    await page.locator('#prompt').fill('a'.repeat(8300));
    await expect(counter).toHaveClass(/over/);
    await expect(counter).toContainText("won't save");
  });

  test('reset restores the default YouTube template', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(optionsUrl(extensionId));

    const yt = page.locator('#yt');
    const original = await yt.inputValue();

    await yt.fill('nonsense {title}');
    await expect(yt).toHaveValue('nonsense {title}');

    await page
      .locator('.field', { has: yt })
      .getByRole('button', { name: 'Reset to default' })
      .click();
    await expect(yt).toHaveValue(original);
  });

  // theme label → the value pinned on <html> ('system' removes the attribute).
  const THEMES = [
    { label: 'Light', attr: 'light' },
    { label: 'Dark', attr: 'dark' },
    { label: 'Match my system', attr: null },
  ] as const;
  const SCHEMES = ['light', 'dark'] as const;

  test('the theme control drives data-theme across the six combinations', async ({
    context,
    extensionId,
  }, testInfo) => {
    const page = await context.newPage();
    await page.goto(optionsUrl(extensionId));

    const html = page.locator('html');

    for (const theme of THEMES) {
      await page.getByLabel('Theme').selectOption({ label: theme.label });

      for (const scheme of SCHEMES) {
        await page.emulateMedia({ colorScheme: scheme });

        if (theme.attr === null) {
          // system hands control back to prefers-color-scheme, no attribute.
          expect(await html.getAttribute('data-theme')).toBeNull();
        } else {
          await expect(html).toHaveAttribute('data-theme', theme.attr);
        }

        const name = `options-${theme.attr ?? 'system'}-scheme-${scheme}`;
        const file = path.join(SHOTS_DIR, `${name}.png`);
        await page.screenshot({ path: file, fullPage: true });
        await testInfo.attach(name, { path: file, contentType: 'image/png' });
      }
    }
  });
});
