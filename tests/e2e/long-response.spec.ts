import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

const headingSelector = '[data-markdown-text-style] h1, [data-markdown-text-style] h2, [data-markdown-text-style] h3, [data-markdown-text-style] h4, [data-markdown-text-style] h5, [data-markdown-text-style] h6';

async function installOlderLoadOnScroll(page: Page) {
  const html = await readFile(resolve(process.cwd(), 'tests/fixtures/chatgpt/long-response-l01/loaded.html'), 'utf8');
  await page.evaluate((loadedHtml) => {
    const scroller = document.querySelector<HTMLElement>('.thread-scroll-container')!;
    const loaded = new DOMParser().parseFromString(loadedHtml, 'text/html').querySelector<HTMLElement>('.thread-scroll-container')!;
    let replaced = false;
    scroller.addEventListener('scroll', () => {
      if (replaced || scroller.scrollTop >= -100) return;
      replaced = true;
      scroller.replaceWith(document.importNode(loaded, true));
    });
  }, html);
}

test('L01 real long-response DOM: cold and upward-loaded snapshots replay', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'long-response-l01');
  await expect(extensionPage.locator('[data-turn-key]')).toHaveCount(5);
  expect(await extensionPage.locator('[data-turn-key]').evaluateAll((turns) => turns.map((turn) => turn.getAttribute('data-turn-key')))).toEqual(expected.cold.turnKeys);
  await expect(extensionPage.locator('[data-content-search-unit-key]')).toHaveCount(expected.cold.contentUnits);
  await expect(extensionPage.locator(headingSelector)).toHaveCount(expected.cold.headingCount);
  await expect(extensionPage.locator('[data-user-message-bubble]').first()).toContainText(expected.cold.firstPrompt!);
  await expect(extensionPage.locator(headingSelector).first()).toContainText(expected.cold.firstHeading!);

  await installOlderLoadOnScroll(extensionPage);
  await extensionPage.locator('.thread-scroll-container').hover();
  await extensionPage.mouse.wheel(0, -2000);
  await expect(extensionPage.locator('[data-turn-key]').first()).toHaveAttribute('data-turn-key', expected.loaded.turnKeys[0]);
  expect(await extensionPage.locator('[data-turn-key]').evaluateAll((turns) => turns.map((turn) => turn.getAttribute('data-turn-key')))).toEqual(expected.loaded.turnKeys);
  await expect(extensionPage.locator('[data-content-search-unit-key]')).toHaveCount(expected.loaded.contentUnits);
  await expect(extensionPage.locator(headingSelector)).toHaveCount(expected.loaded.headingCount);
  await expect(extensionPage.locator('[data-user-message-bubble]').first()).toContainText(expected.loaded.newPrompt!);
  await expect(extensionPage.locator(headingSelector).first()).toContainText(expected.loaded.newFirstHeading!);
});

test('L02 real long-response DOM: messages and nested headings replay', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'long-response-l02');
  expect(await extensionPage.locator('[data-turn-key]').evaluateAll((turns) => turns.map((turn) => turn.getAttribute('data-turn-key')))).toEqual(expected.turnKeys);
  await expect(extensionPage.locator('[data-content-search-unit-key]')).toHaveCount(expected.contentUnits);
  await expect(extensionPage.locator(headingSelector)).toHaveCount(expected.headingCount);
  await expect(extensionPage.locator('[data-user-message-bubble]').first()).toContainText(expected.firstPrompt!);
  await expect(extensionPage.locator(headingSelector).first()).toContainText(expected.firstHeading!);
  await expect(extensionPage.locator(headingSelector).last()).toContainText(expected.lastHeading!);
});

test('F15 L01 outline discovers older turns without manual chat scrolling [P7]', async ({ extensionContext, extensionPage }) => {
  test.fail(process.env.SCROLL_E2E_STRICT !== '1', 'P7: outline does not discover turn DOM that ChatGPT has not loaded');
  const expected = await loadScenario(extensionContext, extensionPage, 'long-response-l01');
  await installOlderLoadOnScroll(extensionPage);
  await expect(extensionPage.locator('#scroll-pro-root')).toBeAttached();
  await extensionPage.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = extensionPage.getByRole('complementary', { name: 'Scroll Pro outline' });
  await expect(sidebar).toBeVisible();
  await expect(extensionPage.locator('[data-turn-key]').first()).toHaveAttribute('data-turn-key', expected.loaded.turnKeys[0]);
  await expect(sidebar).toContainText(expected.loaded.newPrompt!);
});
