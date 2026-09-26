import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

async function openOutline(page: import('@playwright/test').Page) {
  await expect(page.locator('#scroll-pro-root')).toBeAttached();
  await page.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = page.getByRole('complementary', { name: 'Scroll Pro outline' });
  await expect(sidebar).toBeVisible();
  const dismiss = sidebar.getByRole('button', { name: 'Dismiss' });
  // P1 baseline still shows the first-run promotion. P2 removes this step.
  await expect(dismiss).toBeVisible();
  await dismiss.click();
  return sidebar;
}

test('current ChatGPT capture: extension mounts and outline opens', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  await expect(extensionPage.locator('[data-turn-key]')).toHaveCount(2);
  await expect(extensionPage.locator('[data-content-search-unit-key]')).toHaveCount(4);
  expect(await extensionPage.locator('[data-content-search-unit-key]').evaluateAll((units) =>
    units.map((unit) => unit.getAttribute('data-content-search-unit-key')!.split(':').at(-1))
  )).toEqual(expected.roles);
  await expect(extensionPage.locator('[data-user-message-bubble]')).toHaveCount(2);
  await expect(extensionPage.locator('[data-markdown-text-style]')).toHaveCount(2);
  await expect(extensionPage.locator('[data-markdown-text-style] h2, [data-markdown-text-style] h3')).toHaveText(expected.headings);
  await expect(extensionPage.locator('.thread-scroll-container')).toHaveCSS('flex-direction', 'column-reverse');
  await openOutline(extensionPage);
});

test('F02 current ChatGPT capture: turns, headings, search, and navigation [P4]', async ({ extensionContext, extensionPage }) => {
  test.fail(process.env.SCROLL_E2E_STRICT !== '1', 'P4: production provider does not parse current data-turn-key/content units');
  const expected = await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  const sidebar = await openOutline(extensionPage);
  const blocks = sidebar.locator('[data-block-key]');
  await expect(blocks).toHaveCount(expected.prompts.length);
  await expect(blocks.locator('.scroll-pro-item-title')).toHaveText(expected.prompts);
  for (const heading of expected.headings) {
    await expect(sidebar.getByRole('button', { name: heading })).toBeVisible();
  }
  await expect(sidebar.locator('.scroll-pro-subheading')).toHaveCount(3);
  for (const text of expected.absentText ?? []) {
    await expect(sidebar).not.toContainText(text);
  }
  const filter = sidebar.getByPlaceholder('Filter…');
  await filter.fill('green satellite');
  await expect(blocks).toHaveCount(1);
  await filter.clear();
  await sidebar.getByRole('button', { name: 'Orbit Alpha' }).click();
  await expect.poll(() => extensionPage.locator('[data-markdown-text-style] h2').first().evaluate((heading) => {
    const target = heading.getBoundingClientRect();
    const scroller = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
    return target.top >= scroller.top && target.top < scroller.bottom;
  })).toBe(true);
});
