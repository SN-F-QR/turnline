import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

async function openOutline(page: import('@playwright/test').Page) {
  await expect(page.locator('#scroll-pro-root')).toBeAttached();
  await page.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = page.getByRole('complementary', { name: 'Scroll Pro outline' });
  await expect(sidebar).toBeVisible();
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

test('F11: first run opens outline directly and only the toggle shortcut is handled [P2]', async ({ extensionContext, extensionPage }) => {
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  const sidebar = await openOutline(extensionPage);
  await expect(sidebar.getByRole('button', { name: 'Dismiss' })).toHaveCount(0);
  await expect(sidebar.getByText('Scroll just got a big update')).toHaveCount(0);

  const command = await extensionPage.evaluate(() => /Mac|iPhone|iPad/.test(navigator.platform) ? 'Meta' : 'Control');
  const filter = sidebar.getByPlaceholder('Filter…');
  await filter.fill('test');
  await extensionPage.keyboard.press(`${command}+;`);
  await expect(sidebar).toBeHidden();

  await extensionPage.evaluate(() => {
    const editor = document.createElement('textarea');
    editor.id = 'host-editor';
    document.body.appendChild(editor);
  });
  await extensionPage.locator('#host-editor').focus();
  await extensionPage.keyboard.press(`${command}+;`);
  await expect(sidebar).toBeVisible();

  const ignored = await extensionPage.evaluate(() => {
    const input = document.querySelector<HTMLElement>('#scroll-pro-root')!.shadowRoot!.querySelector<HTMLInputElement>('.scroll-pro-search-input')!;
    const commandIsMeta = /Mac|iPhone|iPad/.test(navigator.platform);
    const cases = [
      { key: 'c' }, { key: 'x' }, { key: 'z' }, { key: 'e' }, { key: 'm' },
      { key: 'ArrowDown' }, { key: 'ArrowUp' }, { key: 'Tab' }, { key: '?' },
      { key: ';', repeat: true }, { key: ';', isComposing: true },
      { key: ';', altKey: true }, { key: ';', shiftKey: true },
    ];
    return cases.map((options) => {
      const event = new KeyboardEvent('keydown', {
        bubbles: true, composed: true, cancelable: true,
        [commandIsMeta ? 'metaKey' : 'ctrlKey']: true,
        ...options,
      });
      input.dispatchEvent(event);
      return event.defaultPrevented;
    });
  });
  expect(ignored).toEqual(Array(13).fill(false));
  await expect(sidebar).toBeVisible();

  await filter.fill('ordinary search');
  await filter.press('ArrowLeft');
  await filter.press('Escape');
  await expect(filter).toHaveValue('ordinary search');
  await expect(sidebar).toBeVisible();
  await filter.press('Tab');
  expect(await filter.evaluate((input) => input.getRootNode() instanceof ShadowRoot &&
    (input.getRootNode() as ShadowRoot).activeElement !== input)).toBe(true);

  await sidebar.locator('[data-action="copy-format"]').click({ button: 'right' });
  await expect(extensionPage.getByRole('button', { name: 'Plain text' })).toBeVisible();
  await extensionPage.keyboard.press('Escape');
  await expect(extensionPage.getByRole('button', { name: 'Plain text' })).toHaveCount(0);

  await extensionPage.reload();
  await expect(extensionPage.getByRole('button', { name: 'Toggle outline' })).toBeVisible();
  await extensionPage.keyboard.press(`${command}+;`);
  await expect(sidebar).toBeVisible();
  await extensionPage.keyboard.press(`${command}+;`);
  await expect(sidebar).toBeHidden();

  await extensionPage.evaluate(() => {
    history.pushState({}, '', '/');
    document.body.appendChild(document.createElement('span'));
  });
  await expect(extensionPage.getByRole('button', { name: 'Toggle outline' })).toHaveCount(0);
  await extensionPage.evaluate(() => {
    history.pushState({}, '', '/c/fixture-current-turn-unit');
    document.body.appendChild(document.createElement('span'));
  });
  await expect(extensionPage.getByRole('button', { name: 'Toggle outline' })).toBeVisible();
  await extensionPage.keyboard.press(`${command}+;`);
  await expect(sidebar).toBeVisible();
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
