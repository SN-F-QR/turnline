import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

const headingSelector = '[data-markdown-text-style] h1, [data-markdown-text-style] h2, [data-markdown-text-style] h3, [data-markdown-text-style] h4, [data-markdown-text-style] h5, [data-markdown-text-style] h6';

async function installOlderLoadOnScroll(page: Page, restoreNewer = false) {
  const html = await readFile(resolve(process.cwd(), 'tests/fixtures/chatgpt/long-response-l01/loaded.html'), 'utf8');
  await page.evaluate(({ loadedHtml, restoreNewer }) => {
    const scroller = document.querySelector<HTMLElement>('.thread-scroll-container')!;
    const cold = scroller.cloneNode(true) as HTMLElement;
    const loaded = new DOMParser().parseFromString(loadedHtml, 'text/html').querySelector<HTMLElement>('.thread-scroll-container')!;
    let replaced = false;
    scroller.addEventListener('scroll', () => {
      if (replaced || scroller.scrollTop >= -100) return;
      replaced = true;
      const replacement = document.importNode(loaded, true);
      scroller.replaceWith(replacement);
      if (restoreNewer) {
        // Synthetic reverse transition using the real cold snapshot: the host
        // remounts the newer DOM window when restoring the original position.
        let previousTop = 0;
        replacement.addEventListener('scroll', () => {
          if (replacement.scrollTop > previousTop && replacement.scrollTop >= -100) replacement.replaceWith(cold);
          previousTop = replacement.scrollTop;
        });
        cold.addEventListener('scroll', () => {
          if (cold.scrollTop < -100) cold.replaceWith(replacement);
        });
      }
    });
  }, { loadedHtml: html, restoreNewer });
}

test('F07 loaded snapshot replaces turn nodes without stale outline text [P4]', async ({ extensionContext, extensionPage }) => {
  await extensionPage.emulateMedia({ reducedMotion: 'reduce' });
  const expected = await loadScenario(extensionContext, extensionPage, 'long-response-l01');
  await extensionPage.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = extensionPage.getByRole('complementary', { name: 'Turnline outline' });
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(5);
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  await installOlderLoadOnScroll(extensionPage);
  await extensionPage.locator('.thread-scroll-container').hover();
  await extensionPage.mouse.wheel(0, -2000);
  await expect(extensionPage.locator('[data-turn-key]').first()).toHaveAttribute('data-turn-key', expected.loaded.turnKeys[0]);
  expect(await extensionPage.locator('[data-turn-key]').evaluateAll(turns => turns.map(turn => turn.getAttribute('data-turn-key')))).toEqual(expected.loaded.turnKeys);
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(6);
  await expect(sidebar.locator('.scroll-pro-item-title').first()).toContainText(expected.loaded.newPrompt!);
  await expect(sidebar.getByRole('button', { name: expected.loaded.newFirstHeading!, exact: true })).toBeVisible();
  await sidebar.locator('[data-block-key]').nth(1).locator('.scroll-pro-item-title').click();
  await expect(sidebar.locator('[data-block-key]').nth(1)).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => extensionPage.locator('[data-user-message-bubble]').nth(1).evaluate(bubble => {
    const target = bubble.getBoundingClientRect();
    const scroller = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
    return target.top >= scroller.top && target.top < scroller.bottom;
  })).toBe(true);
});

test('F09 long response navigation uses negative reverse-scroll coordinates [P4]', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'long-response-l01');
  await extensionPage.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = extensionPage.getByRole('complementary', { name: 'Turnline outline' });
  await sidebar.getByRole('button', { name: expected.cold.firstHeading!, exact: true }).click();
  await expect.poll(() => extensionPage.locator('.thread-scroll-container').evaluate(scroller => scroller.scrollTop)).toBeLessThan(0);
  await expect.poll(() => extensionPage.locator(headingSelector).first().evaluate(heading => {
    const target = heading.getBoundingClientRect();
    const scroller = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
    return target.top >= scroller.top && target.top < scroller.bottom;
  })).toBe(true);
});

test('F09 positive scroll layout keeps the target in its nested viewport [P4]', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'long-response-l01');
  await extensionPage.locator('.thread-scroll-container').evaluate(scroller => { (scroller as HTMLElement).style.flexDirection = 'column'; });
  await extensionPage.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = extensionPage.getByRole('complementary', { name: 'Turnline outline' });
  await sidebar.getByRole('button', { name: expected.cold.lastHeading!, exact: true }).click();
  await expect.poll(() => extensionPage.locator('.thread-scroll-container').evaluate(scroller => scroller.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => extensionPage.getByRole('heading', { name: expected.cold.lastHeading!, exact: true }).evaluate(heading => {
    const target = heading.getBoundingClientRect();
    const scroller = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
    return target.top >= scroller.top && target.top < scroller.bottom;
  })).toBe(true);
});

test('F09 navigation reaches a middle turn that is absent from both virtual window edges', async ({ extensionContext, extensionPage }) => {
  await extensionPage.emulateMedia({ reducedMotion: 'reduce' });
  await loadScenario(extensionContext, extensionPage, 'long-response-l01');
  await extensionPage.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = extensionPage.getByRole('complementary', { name: 'Turnline outline' });
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  const turnKey = await extensionPage.locator('[data-turn-key]').nth(2).getAttribute('data-turn-key');
  const target = sidebar.locator(`[data-block-key="block-gpt-${turnKey}:0:user"]`);
  await extensionPage.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.thread-scroll-container')!;
    const slots = Array.from(document.querySelectorAll<HTMLElement>('[data-turn-key]')).map(root => {
      const placeholder = document.createElement('div');
      placeholder.style.height = `${root.getBoundingClientRect().height}px`;
      root.replaceWith(placeholder);
      return { root, placeholder };
    });
    const update = () => {
      const range = scroller.scrollHeight - scroller.clientHeight;
      const position = range ? -scroller.scrollTop / range : 0;
      const active = position < 0.25 ? 4 : position > 0.75 ? 0 : 2;
      // This coarse three-window fixture only models the search phase. Once
      // the middle window is found, leave it mounted so the component can
      // perform precise element alignment using the real DOM geometry.
      if (active === 2) scroller.removeEventListener('scroll', update);
      slots.forEach(({ root, placeholder }, index) => {
        if (index === active && placeholder.isConnected) placeholder.replaceWith(root);
        if (index !== active && root.isConnected) root.replaceWith(placeholder);
      });
    };
    scroller.addEventListener('scroll', update);
    update();
  });
  await expect(extensionPage.locator('[data-turn-key]')).toHaveCount(1);
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(5);
  await target.locator('.scroll-pro-item-title').click();
  await expect(extensionPage.locator(`[data-turn-key="${turnKey}"]`)).toBeAttached();
  await expect.poll(() => extensionPage.locator(`[data-turn-key="${turnKey}"] [data-user-message-bubble]`).evaluate(node => {
    const view = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
    return node.getBoundingClientRect().top >= view.top && node.getBoundingClientRect().top < view.bottom;
  })).toBe(true);
});

test('F15 L01 outline discovers older turns without manual chat scrolling [P7]', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'long-response-l01');
  const anchor = await extensionPage.locator('[data-content-search-unit-key$=":assistant"]').first().evaluate(el => ({ key: el.getAttribute('data-content-search-unit-key'), top: el.getBoundingClientRect().top }));
  const newestTail = (await extensionPage.locator('[data-markdown-text-style]').last().innerText()).slice(-40);
  await installOlderLoadOnScroll(extensionPage, true);
  await expect(extensionPage.locator('#scroll-pro-root')).toBeAttached();
  await extensionPage.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = extensionPage.getByRole('complementary', { name: 'Turnline outline' });
  await expect(sidebar).toBeVisible();
  await expect(sidebar).toContainText(expected.loaded.newPrompt!);
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(6);
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  await expect.poll(() => extensionPage.locator('[data-content-search-unit-key]').evaluateAll((nodes, anchor) => {
    const node = nodes.find(el => el.getAttribute('data-content-search-unit-key') === anchor.key)!;
    return Math.abs(node.getBoundingClientRect().top - anchor.top);
  }, anchor)).toBeLessThan(2);
  await sidebar.getByPlaceholder('Filter…').fill(expected.loaded.newPrompt!);
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
  await sidebar.locator('.scroll-pro-item-title').click();
  await expect.poll(() => extensionPage.locator('[data-user-message-bubble]').first().evaluate(node => {
    const viewport = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
    return node.getBoundingClientRect().top >= viewport.top && node.getBoundingClientRect().top < viewport.bottom;
  })).toBe(true);
  await sidebar.getByPlaceholder('Filter…').clear();
  await sidebar.locator('[data-action="export-format"]').click({ button: 'right' });
  await extensionPage.getByRole('button', { name: /^JSON/ }).click();
  const download = extensionPage.waitForEvent('download');
  await extensionPage.getByRole('button', { name: 'Allow scrolling' }).click();
  const data = JSON.parse(await readFile(await (await download).path(), 'utf8'));
  expect(data.turns).toHaveLength(6);
  expect(data.turns[0].prompt).toBe(expected.loaded.newPrompt);
  expect(data.turns.some((turn: { response: string }) => turn.response.includes(expected.cold.lastHeading!))).toBe(true);
  expect(data.turns.at(-1).response).toContain(newestTail);
  expect(data.coverage.complete).toBeNull();
  expect(data.coverage.scanStatus).toBe('finished');
  await extensionPage.screenshot({ path: test.info().outputPath('p7-outline.png') });
});
