import { readFile } from 'node:fs/promises';
import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';
import { openOutline } from '../helpers/sidebar';

test('copy prompt and Q&A return full clipboard text with the Markdown toggle on and off', async ({ extensionContext, extensionPage: page }) => {
  await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
  await loadScenario(extensionContext, page, 'current-turn-unit');
  await page.evaluate(() => {
    document.querySelector('[data-user-message-bubble] .whitespace-pre-wrap')!.textContent = 'Compare **Velora** with `Nareth`.';
    document.querySelector('[data-markdown-text-style]')!.innerHTML = '<h2>Moon comparison</h2><p>A <strong>silver</strong> moon orbits <code>Velora</code>.</p><h3>Details</h3><p>The imaginary moon is quiet.</p>';
  });
  const sidebar = await openOutline(page);
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  const block = sidebar.locator('[data-block-key]').first();
  const markdownToggle = page.getByRole('menuitemcheckbox', { name: 'Toggle copy markdown' });
  const formats = [
    { markdown: false, prompt: 'Compare Velora with Nareth.', response: 'Moon comparison\n\nA silver moon orbits Velora.\n\nDetails\n\nThe imaginary moon is quiet.' },
    { markdown: true, prompt: 'Compare **Velora** with `Nareth`.', response: '## Moon comparison\n\nA **silver** moon orbits `Velora`.\n\n### Details\n\nThe imaginary moon is quiet.' },
  ];
  for (const format of formats) {
    for (const item of [
      { name: 'Copy prompt', text: format.prompt },
      { name: 'Copy Q&A', text: `Q: ${format.prompt}\n\nA: ${format.response}` },
    ]) {
      // Clear the previous result so a delayed or missing write cannot pass.
      await page.evaluate(() => navigator.clipboard.writeText(''));
      await block.click({ button: 'right' });
      if (format.markdown && item.name === 'Copy prompt') await markdownToggle.click();
      await expect(markdownToggle).toHaveAttribute('aria-checked', String(format.markdown));
      const copy = page.getByRole('button', { name: item.name, exact: true });
      await expect(copy).toBeEnabled();
      await copy.click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(item.text);
      await expect(markdownToggle).toHaveCount(0);
    }
  }
  // Switching back must affect the next copy too, not just the checkbox.
  await page.evaluate(() => navigator.clipboard.writeText(''));
  await block.click({ button: 'right' });
  await markdownToggle.click();
  await expect(markdownToggle).toHaveAttribute('aria-checked', 'false');
  await page.getByRole('button', { name: 'Copy Q&A', exact: true }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(`Q: ${formats[0].prompt}\n\nA: ${formats[0].response}`);
});

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
