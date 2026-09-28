import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './extension.fixture';

type GeminiExpected = {
  roles: string[];
  prompts: string[];
  headings: string[];
  headingCounts: number[];
  headingLevels: number[];
  outlineDepths: number[];
  responseSnippets: string[];
};

const scrollerSelector = 'infinite-scroller.chat-history';
const headingSelector = 'model-response message-content .markdown :is(h1, h2, h3, h4, h5, h6)';

async function loadGemini(context: BrowserContext, page: Page): Promise<GeminiExpected> {
  const root = resolve('tests/fixtures/gemini/current-conversation');
  const [html, css, expected] = await Promise.all(
    ['page.html', 'layout.css', 'expected.json'].map(file => readFile(resolve(root, file), 'utf8')),
  );
  const url = 'https://gemini.google.com/app/fixture-current-conversation';
  await context.route('**/*', async route => {
    const requestUrl = route.request().url();
    if (requestUrl === url) await route.fulfill({ contentType: 'text/html', body: html });
    else if (requestUrl === 'https://gemini.google.com/fixture-layout.css') await route.fulfill({ contentType: 'text/css', body: css });
    else if (/^https?:/.test(requestUrl)) await route.abort();
    else await route.continue();
  });
  await page.goto(url);
  // Wait for the offline styles, then reproduce the host updating a chat at
  // its latest reply. Earlier auto-visibility turns remain in the DOM.
  await page.locator(scrollerSelector).evaluate(scroller => { scroller.scrollTop = scroller.scrollHeight; });
  await expect.poll(() => page.locator(headingSelector).first().evaluate(heading => (heading as HTMLElement).innerText)).toBe('');
  await page.locator('message-content .markdown p').last().evaluate(paragraph => paragraph.append(' '));
  return JSON.parse(expected) as GeminiExpected;
}

async function openOutline(page: Page) {
  await page.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
  await expect(sidebar).toBeVisible();
  return sidebar;
}

test('Gemini current capture normalizes response depths while earlier H3s are skipped', async ({ extensionContext, extensionPage: page }) => {
  const expected = await loadGemini(extensionContext, page);
  expect(await page.locator('user-query, model-response').evaluateAll(turns =>
    turns.map(turn => turn.tagName === 'USER-QUERY' ? 'user' : 'assistant'),
  )).toEqual(expected.roles);
  await expect(page.locator('message-content .markdown')).toHaveCount(expected.headingCounts.length);
  await expect(page.locator(headingSelector)).toHaveText(expected.headings);
  expect(await page.locator(headingSelector).evaluateAll(nodes => nodes.map(node => Number(node.tagName.slice(1))))).toEqual(expected.headingLevels);
  await expect(page.locator('.turn-content-visibility')).toHaveCSS('content-visibility', 'auto');
  await expect.poll(() => page.locator(headingSelector).first().evaluate(heading => (heading as HTMLElement).innerText)).toBe('');

  const sidebar = await openOutline(page);
  await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText(expected.prompts);
  await expect(sidebar.locator('[data-outline-level]')).toHaveText(expected.headings);
  expect(await sidebar.locator('[data-outline-level]').evaluateAll(headings =>
    headings.map(heading => Number(heading.getAttribute('data-outline-level'))),
  )).toEqual(expected.outlineDepths);
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toHaveCount(0);
  await expect(sidebar).not.toContainText('You said');
  await expect(sidebar).not.toContainText('Gemini said');
});

test('Gemini skipped headings can be filtered and navigated without losing their labels', async ({ extensionContext, extensionPage: page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const expected = await loadGemini(extensionContext, page);
  const sidebar = await openOutline(page);
  const filter = sidebar.getByPlaceholder('Filter…');
  await filter.fill('  ORIGINS  ');
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
  await expect(sidebar.locator('[data-outline-level]')).toHaveText([expected.headings[0]]);
  await sidebar.getByRole('button', { name: expected.headings[0], exact: true }).click();
  await expect.poll(() => page.locator(headingSelector).first().evaluate(heading => {
    const target = heading.getBoundingClientRect();
    const viewport = document.querySelector('infinite-scroller.chat-history')!.getBoundingClientRect();
    return target.top >= viewport.top && target.top < viewport.bottom;
  })).toBe(true);
  await expect.poll(() => page.locator(headingSelector).first().evaluate(heading => (heading as HTMLElement).innerText)).toBe(expected.headings[0]);

  await filter.clear();
  await page.locator(scrollerSelector).evaluate(scroller => { scroller.scrollTop = scroller.scrollHeight; });
  await expect.poll(() => page.locator(headingSelector).first().evaluate(heading => (heading as HTMLElement).innerText)).toBe('');
  // A new parse after returning to the latest reply must still retain titles.
  await page.locator('message-content .markdown p').first().evaluate(paragraph => paragraph.append(' '));
  await expect(sidebar.locator('[data-outline-level]')).toHaveText(expected.headings);
});

test('Gemini scopes extraction to the current chat and preserves rendered heading text', async ({ extensionContext, extensionPage: page }) => {
  const expected = await loadGemini(extensionContext, page);
  const sidebar = await openOutline(page);
  await page.evaluate(() => {
    const preview = document.createElement('aside');
    preview.innerHTML = '<user-query><div class="query-text">Unrelated preview</div></user-query><model-response><message-content><div class="markdown"><h3>Preview heading</h3></div></message-content></model-response>';
    document.body.appendChild(preview);
    const heading = document.createElement('h3');
    heading.innerHTML = '  Visible <b>detail</b><span style="display:none">Hidden label</span>  ';
    document.querySelectorAll('model-response message-content .markdown')[2].appendChild(heading);
  });
  await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText(expected.prompts);
  await expect(sidebar.locator('[data-outline-level]')).toHaveText([...expected.headings, 'Visible detail']);
  await expect(sidebar).not.toContainText('Unrelated preview');
  await expect(sidebar).not.toContainText('Preview heading');
  await expect(sidebar).not.toContainText('Hidden label');
});

test('Gemini empty streaming headings acquire titles offscreen across H1-H6 (modeled streaming)', async ({ extensionContext, extensionPage: page }) => {
  const expected = await loadGemini(extensionContext, page);
  const sidebar = await openOutline(page);
  await sidebar.getByRole('button', { name: 'Outline settings' }).click();
  await sidebar.getByLabel('Outline depth', { exact: true }).selectOption('6');
  await sidebar.getByRole('button', { name: 'Back to outline' }).click();
  await page.locator('message-content .markdown').first().evaluate(markdown => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      const heading = document.createElement(`h${level}`);
      heading.dataset.streamingHeading = String(level);
      heading.appendChild(document.createTextNode(' \n '));
      markdown.appendChild(heading);
    }
    const sentinel = document.createElement('h2');
    sentinel.textContent = 'Streaming in progress';
    markdown.appendChild(sentinel);
  });
  // The populated sentinel proves this mutation has been parsed before the
  // assertion checks that the six empty headings were omitted.
  await expect(sidebar.locator('[data-outline-level]')).toHaveText([
    ...expected.headings.slice(0, expected.headingCounts[0]), 'Streaming in progress',
    ...expected.headings.slice(expected.headingCounts[0]),
  ]);
  await page.locator('[data-streaming-heading]').evaluateAll(headings => {
    headings.forEach(heading => { heading.firstChild!.textContent = ` Streamed H${heading.getAttribute('data-streaming-heading')} title `; });
  });
  const streamed = ['Streamed H1 title', 'Streamed H2 title', 'Streamed H3 title', 'Streamed H4 title', 'Streamed H5 title', 'Streamed H6 title'];
  await expect(sidebar.locator('[data-outline-level]')).toHaveText([
    ...expected.headings.slice(0, expected.headingCounts[0]), ...streamed, 'Streaming in progress',
    ...expected.headings.slice(expected.headingCounts[0]),
  ]);
  for (const [index, title] of streamed.entries()) {
    await expect(sidebar.getByRole('button', { name: title, exact: true })).toHaveAttribute('data-outline-level', String(index + 1));
  }
  await expect.poll(() => page.locator('[data-streaming-heading]').first().evaluate(heading => (heading as HTMLElement).innerText)).toBe('');
});

test('Gemini replaces its current scroller without duplicate or stale outline headings (modeled replacement)', async ({ extensionContext, extensionPage: page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const expected = await loadGemini(extensionContext, page);
  const sidebar = await openOutline(page);
  await expect(sidebar.locator('[data-outline-level]')).toHaveText(expected.headings);
  await page.locator(scrollerSelector).evaluate(scroller => {
    const replacement = scroller.cloneNode(true) as HTMLElement;
    replacement.querySelector('message-content .markdown h3')!.textContent = 'Updated origins';
    scroller.replaceWith(replacement);
    replacement.scrollTop = replacement.scrollHeight;
  });
  await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText(expected.prompts);
  await expect(sidebar.locator('[data-outline-level]')).toHaveText(['Updated origins', ...expected.headings.slice(1)]);
  await sidebar.getByRole('button', { name: 'Updated origins', exact: true }).click();
  await expect.poll(() => page.locator(headingSelector).first().evaluate(heading => {
    const viewport = document.querySelector('infinite-scroller.chat-history')!.getBoundingClientRect();
    return heading.getBoundingClientRect().top >= viewport.top && heading.getBoundingClientRect().top < viewport.bottom;
  })).toBe(true);
});

test('Gemini export retains offscreen headings and full replies when outline depth hides children', async ({ extensionContext, extensionPage: page }) => {
  const expected = await loadGemini(extensionContext, page);
  const sidebar = await openOutline(page);
  await sidebar.getByRole('button', { name: 'Outline settings' }).click();
  await sidebar.getByLabel('Outline depth', { exact: true }).selectOption('1');
  await sidebar.getByRole('button', { name: 'Back to outline' }).click();
  await expect(sidebar.locator('[data-outline-level]')).toHaveCount(expected.outlineDepths.filter(depth => depth === 1).length);
  await sidebar.locator('[data-action="export-format"]').click({ button: 'right' });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /^JSON/ }).click();
  const data = JSON.parse(await readFile(await (await download).path(), 'utf8')) as {
    turns: { prompt: string; response: string; headings: string[] }[];
  };
  expect(data.turns.map(turn => turn.prompt)).toEqual(expected.prompts);
  expect(data.turns.flatMap(turn => turn.headings)).toEqual(expected.headings);
  for (const [index, snippet] of expected.responseSnippets.entries()) {
    expect(data.turns[index].response).toContain(snippet);
  }
  expect(data.turns[0].response).toContain('### Origins and Etymology');
  expect(data.turns[1].response).toContain('```');
  expect(data.turns[1].response).toContain('Tokugawa Shogun');
  expect(data.turns.some(turn => /You said|Gemini said/.test(turn.prompt + turn.response))).toBe(false);
});
