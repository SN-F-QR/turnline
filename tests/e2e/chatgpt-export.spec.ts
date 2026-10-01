import { readFile } from 'node:fs/promises';
import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';
import { openOutline } from '../helpers/sidebar';

test('assistant-only output omits a fabricated user [synthetic state]', async ({ extensionContext, extensionPage }) => {
  await extensionPage.emulateMedia({ reducedMotion: 'reduce' });
  await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  await extensionPage.evaluate(() => document.querySelectorAll('[data-content-search-unit-key$=":user"]').forEach(unit => unit.remove()));
  const sidebar = await openOutline(extensionPage);
  const blocks = sidebar.locator('[data-block-key]');
  await expect(blocks).toHaveCount(2);
  await sidebar.getByRole('button', { name: 'Collapse all turns' }).click();
  await expect(blocks.locator('.scroll-pro-item-title').first()).toHaveText('Orbit Alpha');
  await blocks.first().click({ button: 'right' });
  await expect(extensionPage.getByRole('button', { name: 'Copy prompt' })).toBeDisabled();
  await expect(extensionPage.getByRole('button', { name: 'Copy Q&A' })).toBeDisabled();
  await expect(extensionPage.getByRole('button', { name: 'Copy response' })).toBeEnabled();
  await extensionPage.getByRole('button', { name: 'Copy response' }).click();
  const plainCopy = await extensionPage.evaluate(() => navigator.clipboard.readText());
  expect(plainCopy).toContain('Orbit Alpha');
  expect(plainCopy).not.toContain('## Orbit Alpha');

  const exportButton = sidebar.locator('[data-action="export-format"]');
  await exportButton.click({ button: 'right' });
  await extensionPage.getByRole('button', { name: 'JSON' }).click();
  const downloadPromise = extensionPage.waitForEvent('download');
  await extensionPage.getByRole('button', { name: 'Allow scrolling' }).click();
  const download = await downloadPromise;
  const data = JSON.parse(await readFile(await download.path(), 'utf8')) as { turns: Array<{ prompt: string | null; response: string; kind: string; title: string }> };
  expect(data.turns).toHaveLength(2);
  expect(data.turns[0]).toMatchObject({ prompt: null, kind: 'assistant', title: 'Orbit Alpha' });
  expect(data.turns[0].response).toContain('## Orbit Alpha');

  await exportButton.click({ button: 'right' });
  const markdownPromise = extensionPage.waitForEvent('download');
  await extensionPage.getByRole('button', { name: 'Markdown' }).click();
  const markdown = await readFile(await (await markdownPromise).path(), 'utf8');
  expect(markdown).toContain('**Assistant**');
  expect(markdown).toContain('## Orbit Alpha');
  expect(markdown).not.toContain('**User**');
});

test('plain text copying and TXT export preserve code in assistant-only responses', async ({ extensionContext, extensionPage }) => {
  await extensionPage.emulateMedia({ reducedMotion: 'reduce' });
  await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  await extensionPage.evaluate(() => document.querySelectorAll('[data-content-search-unit-key$=":user"]').forEach(unit => unit.remove()));
  const code = 'const file_name = "**literal**";\nconsole.log(`value: ${file_name}`);';
  await extensionPage.locator('[data-markdown-text-style]').first().evaluate((content, text) => {
    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className = 'language-js';
    code.textContent = text;
    pre.append(code);
    content.append(pre);
  }, code);
  const sidebar = await openOutline(extensionPage);
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  await sidebar.locator('[data-block-key]').first().click({ button: 'right' });
  await extensionPage.getByRole('button', { name: 'Copy response', exact: true }).click();
  await expect.poll(() => extensionPage.evaluate(() => navigator.clipboard.readText())).toContain(code);
  const exportButton = sidebar.locator('[data-action="export-format"]');
  await exportButton.click({ button: 'right' });
  await extensionPage.getByRole('button', { name: /^Text/ }).click();
  const textPromise = extensionPage.waitForEvent('download');
  await extensionPage.getByRole('button', { name: 'Allow scrolling' }).click();
  const plainText = await readFile(await (await textPromise).path(), 'utf8');
  expect(plainText).toContain(code);
  expect(plainText).toContain('Assistant:');
  expect(plainText).not.toContain('User:');
});

test('assistant-only PDF print content has no user section [synthetic state]', async ({ extensionContext, extensionPage }) => {
  await extensionPage.emulateMedia({ reducedMotion: 'reduce' });
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  await extensionPage.evaluate(() => document.querySelectorAll('[data-content-search-unit-key$=":user"]').forEach(unit => unit.remove()));
  const sidebar = await openOutline(extensionPage);
  await extensionPage.evaluate(() => {
    const observer = new MutationObserver((records) => {
      const frame = records.flatMap(record => Array.from(record.addedNodes)).find(node => node instanceof HTMLIFrameElement) as HTMLIFrameElement | undefined;
      if (!frame) return;
      (window as Window & { capturedPdfHtml?: string }).capturedPdfHtml = frame.contentDocument?.documentElement.outerHTML;
      observer.disconnect();
    });
    observer.observe(document.body, { childList: true });
  });
  const exportButton = sidebar.locator('[data-action="export-format"]');
  await exportButton.click({ button: 'right' });
  await extensionPage.getByRole('button', { name: 'PDF' }).click();
  await extensionPage.getByRole('button', { name: 'Allow scrolling' }).click();
  const pdfHtml = await extensionPage.waitForFunction(() => (window as Window & { capturedPdfHtml?: string }).capturedPdfHtml || '').then(handle => handle.jsonValue());
  expect(pdfHtml).toContain('Orbit Alpha');
  expect(pdfHtml).not.toContain('class="section-label">You');
});
