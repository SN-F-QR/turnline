import { readFile } from 'node:fs/promises';
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

for (const layout of ['current', 'legacy', 'signed-in'] as const) {
  test(`ChatGPT ${layout}: DIL card titles are omitted while document headings remain`, async ({ extensionContext, extensionPage }) => {
    await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
    await extensionPage.evaluate((layout) => {
      const content = document.querySelector<HTMLElement>('[data-markdown-text-style]')!;
      // Minimal reproduction of the public DIL response structure. The entire
      // response is not-prose, including its legitimate document headings.
      const message = document.createElement('div');
      message.setAttribute('data-message-author-role', 'assistant');
      message.setAttribute('data-model-dil-v2-message', '');
      message.innerHTML = `
        <div><div class="puik-root not-prose not-markdown" data-dil-widget-copy-target>
          <div data-d-direction="col">
            <h1 data-d-component="title">Product comparison</h1>
            <h2 data-d-component="title">Recommendations</h2>
            <div data-d-component="box" data-d-has-border>
              <h1 data-d-component="title">Example toothpaste brand</h1>
              <div><h2 data-d-component="title">Card details</h2></div>
            </div>
            <h2 data-d-component="title">Concentration</h2>
            <div data-d-component="box">
              <h1 data-d-component="title">1,000–1,150 ppm</h1>
            </div>
          </div>
        </div></div>
        <div><h3>Ordinary nested heading</h3></div>`;
      if (layout === 'signed-in') {
        // Logged-in DOM supplied in the bug report: cards live inside the
        // Markdown root and have no share-page widget-copy-target ancestor.
        message.removeAttribute('data-model-dil-v2-message');
        message.setAttribute('data-markdown-text-style', 'assistant-message');
        const renderer = message.querySelector('[data-dil-widget-copy-target]')!;
        renderer.removeAttribute('data-dil-widget-copy-target');
        renderer.className = 'relative PortalBoundary-TFj9W2 Renderer-ojZscX';
        renderer.setAttribute('data-theme', 'light');
        renderer.firstElementChild!.className = 'DilRenderer-tB76Jj DilResponseRoot-HfQrEh LegacyReveal-lIiswq';
      }
      if (layout === 'legacy') {
        const turn = content.closest('[data-turn-key]')!;
        const legacyTurn = document.createElement('section');
        legacyTurn.setAttribute('data-turn', 'assistant');
        legacyTurn.setAttribute('data-testid', 'conversation-turn-dil');
        legacyTurn.append(...turn.childNodes);
        turn.replaceWith(legacyTurn);
      }
      content.replaceWith(message);
    }, layout);
    const sidebar = await openOutline(extensionPage);
    for (const title of ['Product comparison', 'Recommendations', 'Concentration', 'Ordinary nested heading']) {
      await expect(sidebar.getByRole('button', { name: title, exact: true })).toBeVisible();
    }
    for (const title of ['Example toothpaste brand', 'Card details', '1,000–1,150 ppm']) {
      await expect(sidebar.getByRole('button', { name: title, exact: true })).toHaveCount(0);
      await expect(extensionPage.getByRole('heading', { name: title, exact: true })).toHaveCount(1);
    }
  });
}

test('F06 text-node streaming updates the current outline [P4]', async ({ extensionContext, extensionPage }) => {
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  const sidebar = await openOutline(extensionPage);
  await expect(sidebar.getByRole('button', { name: 'Orbit Alpha' })).toBeVisible();
  await extensionPage.evaluate(() => {
    const heading = document.querySelector<HTMLElement>('[data-markdown-text-style] h2')!;
    heading.firstChild!.textContent = 'Orbit Updated';
  });
  await expect(sidebar.getByRole('button', { name: 'Orbit Updated' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Orbit Alpha' })).toHaveCount(0);
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(2);
});

test('F02 overlapping legacy wrapper does not duplicate a current turn [P4 synthetic wrapper]', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  await extensionPage.evaluate(() => {
    const turn = document.querySelector<HTMLElement>('[data-turn-key]')!;
    const wrapper = document.createElement('section');
    wrapper.setAttribute('data-turn', 'assistant');
    turn.replaceWith(wrapper);
    wrapper.appendChild(turn);
  });
  const sidebar = await openOutline(extensionPage);
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(2);
  await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText(expected.prompts);
});

test('F02 history keeps one navigable turn when a fallback search key is replaced', async ({ extensionContext, extensionPage }) => {
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  const sidebar = await openOutline(extensionPage);
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  await extensionPage.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-turn-key]')!;
    root.querySelectorAll<HTMLElement>('[data-content-search-unit-key]').forEach(unit => {
      unit.setAttribute('data-content-search-unit-key', unit.getAttribute('data-content-search-unit-key')!.replace('fallback-turn-0', 'resolved-turn-0'));
    });
    root.querySelector('h2')!.textContent = 'Orbit Resolved';
  });
  await expect(sidebar.getByRole('button', { name: 'Orbit Resolved' })).toBeVisible();
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(2);
  await expect(sidebar.getByRole('button', { name: 'Orbit Alpha' })).toHaveCount(0);
  await sidebar.getByRole('button', { name: 'Orbit Resolved' }).click();
  await expect.poll(() => extensionPage.getByRole('heading', { name: 'Orbit Resolved' }).evaluate(heading => {
    const target = heading.getBoundingClientRect();
    const scroller = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
    return target.top >= scroller.top && target.top < scroller.bottom;
  })).toBe(true);
});

for (const remount of [false, true]) {
  test(`F06 streamed answer reindexed after search stays under its prompt (remount=${remount})`, async ({ extensionContext, extensionPage }) => {
    await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
    const sidebar = await openOutline(extensionPage);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await extensionPage.evaluate(() => {
      const root = document.createElement('div');
      root.setAttribute('data-turn-key', 'streamed-turn');
      root.innerHTML = `<div data-content-search-unit-key="fallback-turn-2:0:user"><div data-user-message-bubble>Compare imaginary planets</div></div>
        <div data-content-search-unit-key="fallback-turn-2:1:assistant"><div data-markdown-text-style="assistant-message"><h2>Planet comparison</h2><p>Initial text before search.</p></div></div>`;
      document.querySelector('[data-turn-key]')!.parentElement!.append(root);
    });
    await expect(sidebar.getByRole('button', { name: 'Planet comparison', exact: true })).toHaveCount(1);
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(3);
    await extensionPage.evaluate((remount) => {
      const unit = document.querySelector('[data-content-search-unit-key="fallback-turn-2:1:assistant"]')!;
      const updated = remount ? unit.cloneNode(true) as HTMLElement : unit;
      updated.setAttribute('data-content-search-unit-key', 'fallback-turn-2:2:assistant');
      updated.querySelector('[data-markdown-text-style]')!.insertAdjacentHTML('beforeend', '<h2>Search findings</h2><p>Remaining text after search.</p>');
      if (remount) unit.replaceWith(updated);
    }, remount);
    const exchange = sidebar.locator('[data-block-key]').filter({ hasText: 'Compare imaginary planets' });
    await expect(exchange.getByRole('button', { name: 'Search findings', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Planet comparison', exact: true })).toHaveCount(1);
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(3);
    await exchange.getByRole('button', { name: 'Search findings', exact: true }).click();
    await expect.poll(() => extensionPage.getByRole('heading', { name: 'Search findings' }).evaluate(heading => {
      const target = heading.getBoundingClientRect();
      const scroller = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
      return target.top >= scroller.top && target.top < scroller.bottom;
    })).toBe(true);
  });
}

for (const remount of [false, true]) {
  test(`F06 pending prompt is retired when submission resolves (remount=${remount})`, async ({ extensionContext, extensionPage }) => {
    await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
    const sidebar = await openOutline(extensionPage);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await extensionPage.evaluate(() => {
      const root = document.createElement('div');
      root.setAttribute('data-turn-key', 'pending-chatgpt-submit');
      root.innerHTML = '<div data-content-search-unit-key="fallback-turn-2:0:user"><div data-user-message-bubble>Compare imaginary planets</div></div>';
      document.querySelector('[data-turn-key]')!.parentElement!.append(root);
    });
    await expect(sidebar.locator('.scroll-pro-item-title').filter({ hasText: 'Compare imaginary planets' })).toHaveCount(1);
    await extensionPage.evaluate((remount) => {
      const pending = document.querySelector('[data-turn-key="pending-chatgpt-submit"]')!;
      const resolved = remount ? pending.cloneNode(true) as HTMLElement : pending;
      resolved.setAttribute('data-turn-key', 'resolved-submission');
      resolved.insertAdjacentHTML('beforeend', '<div data-content-search-unit-key="fallback-turn-2:2:assistant"><div data-markdown-text-style="assistant-message"><h2>Submitted answer</h2></div></div>');
      if (remount) pending.replaceWith(resolved);
    }, remount);
    await expect(sidebar.getByRole('button', { name: 'Submitted answer', exact: true })).toBeVisible();
    await expect(sidebar.locator('.scroll-pro-item-title').filter({ hasText: 'Compare imaginary planets' })).toHaveCount(1);
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(3);
    // A genuinely repeated prompt with its own stable turn key must survive.
    await extensionPage.evaluate(() => {
      const original = document.querySelector('[data-turn-key="resolved-submission"]')!;
      const repeated = original.cloneNode(true) as HTMLElement;
      repeated.setAttribute('data-turn-key', 'another-submission');
      original.after(repeated);
    });
    await expect(sidebar.locator('.scroll-pro-item-title').filter({ hasText: 'Compare imaginary planets' })).toHaveCount(2);
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(4);
  });
}

test('F08 SPA URL and container replacement clear stale turns [P4]', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  const sidebar = await openOutline(extensionPage);
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(2);
  await extensionPage.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.thread-scroll-container')!;
    sessionStorage.setItem('saved-chat', scroller.outerHTML);
    history.pushState({}, '', '/c/fixture-other');
    scroller.replaceWith(scroller.cloneNode(false));
  });
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(0);
  await extensionPage.evaluate(() => {
    const holder = document.createElement('div');
    holder.innerHTML = sessionStorage.getItem('saved-chat')!;
    const replacement = holder.firstElementChild!;
    replacement.querySelector<HTMLElement>('[data-user-message-bubble] .whitespace-pre-wrap')!.textContent = '';
    document.querySelector('.thread-scroll-container')!.replaceWith(replacement);
  });
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(2);
  await expect(sidebar.locator('.scroll-pro-item-title').first()).toHaveText('Prompt');
  await expect(sidebar).not.toContainText(expected.prompts[0]);
  await extensionPage.evaluate(() => {
    history.back();
    const holder = document.createElement('div');
    holder.innerHTML = sessionStorage.getItem('saved-chat')!;
    document.querySelector('.thread-scroll-container')!.replaceWith(holder.firstElementChild!);
  });
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(2);
  await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText(expected.prompts);
  await extensionPage.evaluate(() => history.replaceState({}, '', '/'));
  await expect(extensionPage.getByRole('button', { name: 'Toggle outline' })).toHaveCount(0);
  await extensionPage.evaluate(() => history.replaceState({}, '', '/c/fixture-current-turn-unit'));
  await expect(extensionPage.getByRole('button', { name: 'Toggle outline' })).toBeVisible();
});

test('F13 assistant-only output omits a fabricated user [P3 synthetic state]', async ({ extensionContext, extensionPage }) => {
  await extensionPage.emulateMedia({ reducedMotion: 'reduce' });
  await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  await extensionPage.evaluate(() => document.querySelectorAll('[data-content-search-unit-key$=":user"]').forEach(unit => unit.remove()));
  const sidebar = await openOutline(extensionPage);
  const blocks = sidebar.locator('[data-block-key]');
  await expect(blocks).toHaveCount(2);
  await sidebar.getByRole('button', { name: 'Prompts' }).click();
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

test('F13 assistant-only TXT export has no user section [P3 synthetic state]', async ({ extensionContext, extensionPage }) => {
  await extensionPage.emulateMedia({ reducedMotion: 'reduce' });
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  await extensionPage.evaluate(() => document.querySelectorAll('[data-content-search-unit-key$=":user"]').forEach(unit => unit.remove()));
  const sidebar = await openOutline(extensionPage);
  const exportButton = sidebar.locator('[data-action="export-format"]');
  await exportButton.click({ button: 'right' });
  await extensionPage.getByRole('button', { name: /^Text/ }).click();
  const textPromise = extensionPage.waitForEvent('download');
  await extensionPage.getByRole('button', { name: 'Allow scrolling' }).click();
  const plainText = await readFile(await (await textPromise).path(), 'utf8');
  expect(plainText).toContain('Assistant:');
  expect(plainText).not.toContain('User:');
});

test('F13 assistant-only PDF print content has no user section [P3 synthetic state]', async ({ extensionContext, extensionPage }) => {
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
