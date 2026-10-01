import { readFile } from 'node:fs/promises';
import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

async function openOutline(page: import('@playwright/test').Page) {
  await expect(page.locator('#scroll-pro-root')).toBeAttached();
  await page.getByRole('button', { name: 'Toggle outline' }).click();
  const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
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

test('ChatGPT project landing pages disable the outline across SPA navigation and reload', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  const projectChatPath = `/g/g-p-fixture${new URL(extensionPage.url()).pathname}`;
  const projectPath = '/g/g-p-fixture/project';
  const sidebar = await openOutline(extensionPage);
  const toggle = extensionPage.getByRole('button', { name: 'Toggle outline' });

  // Keep the old transcript mounted to model ChatGPT's cached workspaces.
  await extensionPage.evaluate(path => history.pushState({}, '', path), projectPath);
  await expect(toggle).toHaveCount(0);
  await expect(sidebar).toHaveCount(0);
  expect(await extensionPage.evaluate(() => {
    const event = new KeyboardEvent('keydown', {
      key: ';', bubbles: true, cancelable: true,
      [/Mac|iPhone|iPad/.test(navigator.platform) ? 'metaKey' : 'ctrlKey']: true,
    });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  })).toBe(false);
  await expect(sidebar).toHaveCount(0);

  await extensionPage.evaluate(path => history.pushState({}, '', path), projectChatPath);
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(sidebar).toBeVisible();
  await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText(expected.prompts);

  await extensionPage.evaluate(() => history.back());
  await expect(extensionPage).toHaveURL(`https://chatgpt.com${projectPath}`);
  await expect(toggle).toHaveCount(0);
  await expect(sidebar).toHaveCount(0);

  await extensionContext.route(`https://chatgpt.com${projectPath}`, route => route.fulfill({
    contentType: 'text/html', body: '<!doctype html><html><body><main><h1>Fixture project</h1></main></body></html>',
  }));
  await extensionPage.reload();
  await expect(extensionPage.locator('.scroll-pro-app-root')).toBeAttached();
  await expect(toggle).toHaveCount(0);
  await expect(sidebar).toHaveCount(0);
});

test('F11 toggle shortcut works in the outline and host editor across reload and route changes', async ({ extensionContext, extensionPage }) => {
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  const chatUrl = extensionPage.url();
  const sidebar = await openOutline(extensionPage);
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
  await extensionPage.evaluate((url) => {
    history.pushState({}, '', url);
    document.body.appendChild(document.createElement('span'));
  }, chatUrl);
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
    await expect(sidebar.getByRole('button', { name: heading, exact: true })).toBeVisible();
  }
  await expect(sidebar.locator('.scroll-pro-subheading')).toHaveCount(3);
  for (const text of expected.absentText ?? []) {
    await expect(sidebar).not.toContainText(text);
  }
  const filter = sidebar.getByPlaceholder('Filter…');
  await filter.fill('green satellite');
  await expect(blocks).toHaveCount(1);
  await filter.clear();
  await sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true }).click();
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
      await expect(sidebar.getByRole('button', { name: title, exact: true }).and(sidebar.locator('.scroll-pro-subheading'))).toBeVisible();
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
  await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toBeVisible();
  await extensionPage.evaluate(() => {
    const heading = document.querySelector<HTMLElement>('[data-markdown-text-style] h2')!;
    heading.firstChild!.textContent = 'Orbit Updated';
  });
  await expect(sidebar.getByRole('button', { name: 'Orbit Updated' })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toHaveCount(0);
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
  await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toHaveCount(0);
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
  const chatUrl = extensionPage.url();
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
    replacement.querySelectorAll('[data-chatgpt-selection-conversation-id]').forEach(marker => {
      marker.setAttribute('data-chatgpt-selection-conversation-id', 'fixture-other');
    });
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
  await extensionPage.evaluate((url) => history.replaceState({}, '', url), chatUrl);
  await expect(extensionPage.getByRole('button', { name: 'Toggle outline' })).toBeVisible();
});

for (const prefix of ['/c/', '/g/g-p-fixture/c/']) {
  test(`new ChatGPT submissions survive local-to-permanent conversation IDs (${prefix})`, async ({ extensionContext, extensionPage }) => {
    const expected = await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
    const originalUrl = extensionPage.url();
    const sidebar = await openOutline(extensionPage);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await extensionPage.evaluate(prefix => {
      const main = document.querySelector('main')!;
      const cached = document.createElement('div');
      cached.id = 'cached-before-submit';
      main.replaceWith(cached);
      cached.append(main);
      cached.style.display = 'none';
      const active = document.createElement('div');
      active.id = 'new-submission-workspace';
      active.innerHTML = `<main><div class="thread-scroll-container"><div data-chatgpt-conversation-selection-target>
        <div data-turn-key="pending-chatgpt-submit">
          <div data-content-search-unit-key="fallback-turn-0:0:user"><div data-user-message-bubble>Describe a fictional comet</div></div>
          <div data-content-search-unit-key="fallback-turn-0:2:assistant"><div data-chatgpt-selection-conversation-id="local-chatgpt:fixture-local-submission">
            <div data-markdown-text-style="assistant-message"><h2>Comet overview</h2><p>Streaming text.</p></div>
          </div></div>
        </div>
      </div></div></main>`;
      document.body.append(active);
      history.pushState({}, '', `${prefix}local-chatgpt%3Afixture-local-submission`);
    }, prefix);
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await expect(sidebar.getByRole('button', { name: 'Comet overview', exact: true })).toBeVisible();

    // Promotion changes the URL while the selection marker remains local.
    await extensionPage.evaluate(prefix => history.replaceState({}, '', `${prefix}fixture-permanent-submission`), prefix);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await extensionPage.evaluate(() => {
      const turn = document.querySelector('#new-submission-workspace [data-turn-key]')!;
      turn.setAttribute('data-turn-key', 'submitted-comet-turn');
      turn.querySelector('[data-markdown-text-style]')!.insertAdjacentHTML('beforeend', '<h2>Comet tail</h2><p>Completed answer.</p>');
    });
    await expect(sidebar.getByRole('button', { name: 'Comet tail', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('status')).toHaveText('2 messages discovered');

    // Navigating away must reject this already assigned local transcript even
    // before the host hides it, or history discovery would retain stale turns.
    await extensionPage.evaluate(url => history.pushState({}, '', url), originalUrl);
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(0);
    await extensionPage.evaluate(() => {
      document.querySelector<HTMLElement>('#cached-before-submit')!.style.removeProperty('display');
      document.querySelector<HTMLElement>('#new-submission-workspace')!.style.display = 'none';
    });
    await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText(expected.prompts);
    await expect(sidebar).not.toContainText('Comet overview');

    await extensionPage.evaluate(() => {
      document.querySelector<HTMLElement>('#cached-before-submit')!.style.display = 'none';
      document.querySelector<HTMLElement>('#new-submission-workspace')!.style.removeProperty('display');
      history.back();
    });
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText('Describe a fictional comet');
    await expect(sidebar.getByRole('button', { name: 'Comet tail', exact: true })).toBeVisible();
  });
}

test('ChatGPT local markers mounted after the permanent URL is assigned populate the outline', async ({ extensionContext, extensionPage }) => {
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  await extensionPage.evaluate(() => {
    history.pushState({}, '', '/c/fixture-direct-permanent');
    document.querySelector('[data-chatgpt-conversation-selection-target]')!.innerHTML = `<div data-turn-key="direct-new-turn">
      <div data-content-search-unit-key="fallback-turn-0:0:user"><div data-user-message-bubble>Describe a fictional island</div></div>
      <div data-content-search-unit-key="fallback-turn-0:2:assistant"><div data-chatgpt-selection-conversation-id="local-chatgpt:fixture-direct-local">
        <div data-markdown-text-style="assistant-message"><h2>Island geography</h2></div>
      </div></div>
    </div>`;
  });
  const sidebar = await openOutline(extensionPage);
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
  await expect(sidebar.getByRole('button', { name: 'Island geography', exact: true })).toBeVisible();
});

test('SPA navigation waits for the new conversation before retaining history', async ({ extensionContext, extensionPage }) => {
  const expected = await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  const sidebar = await openOutline(extensionPage);
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  await extensionPage.evaluate(() => {
    // The router commits the URL while the previous transcript is still mounted.
    history.pushState({}, '', '/c/fixture-delayed-chat');
    document.title = 'Delayed conversation - ChatGPT';
  });
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(0);

  await extensionPage.evaluate(() => {
    const transcript = document.querySelector('[data-chatgpt-conversation-selection-target]')!;
    transcript.innerHTML = `<div data-turn-key="delayed-turn">
      <div data-content-search-unit-key="fallback-turn-0:0:user"><div data-user-message-bubble>Plan an imaginary voyage</div></div>
      <div data-content-search-unit-key="fallback-turn-0:2:assistant"><div data-markdown-text-style="assistant-message"><h2>Voyage itinerary</h2><p>Visit a fictional moon.</p></div></div>
    </div>`;
  });
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
  await expect(sidebar.getByRole('button', { name: 'Voyage itinerary', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  for (const text of [...expected.prompts, ...expected.headings]) {
    await expect(sidebar).not.toContainText(text);
  }
});

for (const prefix of ['/c/', '/g/g-p-fixture/c/']) {
  test(`cached ChatGPT workspaces stay isolated across navigation (${prefix})`, async ({ extensionContext, extensionPage }) => {
    const expected = await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
    const chatUrl = extensionPage.url();
    const sidebar = await openOutline(extensionPage);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await extensionPage.evaluate((prefix) => {
      // Live ChatGPT preserves entire workspaces with display:none !important.
      // The cached chat deliberately has more turns than the active chat.
      const main = document.querySelector('main')!;
      const cached = document.createElement('div');
      cached.id = 'cached-original';
      main.replaceWith(cached);
      cached.append(main);
      cached.style.setProperty('display', 'none', 'important');
      const active = document.createElement('div');
      active.id = 'cached-other';
      active.innerHTML = `<main><div class="thread-scroll-container"><div data-chatgpt-conversation-selection-target>
        <div data-turn-key="cached-other-turn">
          <div data-content-search-unit-key="fallback-turn-0:0:user"><div data-user-message-bubble>Plan an imaginary voyage</div></div>
          <div data-content-search-unit-key="fallback-turn-0:2:assistant"><div data-chatgpt-selection-conversation-id="fixture-cached-other">
            <div data-markdown-text-style="assistant-message"><h2>Voyage itinerary</h2><p style="min-height:900px">Visit a fictional moon.</p><h2>Landing plan</h2><p>Explore the imaginary coast.</p></div>
          </div></div>
        </div>
      </div></div></main>`;
      document.body.append(active);
      history.pushState({}, '', `${prefix}fixture-cached-other`);
    }, prefix);
    await expect(extensionPage.locator('[data-turn-key]')).toHaveCount(3);
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText('Plan an imaginary voyage');
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect(sidebar.getByRole('status')).toHaveText('2 messages discovered');
    for (const text of [...expected.prompts, ...expected.headings]) {
      await expect(sidebar).not.toContainText(text);
    }
    const cachedPosition = await extensionPage.locator('#cached-original .thread-scroll-container').evaluate(el => el.scrollTop);
    await sidebar.getByRole('button', { name: 'Voyage itinerary', exact: true }).click();
    await expect.poll(() => extensionPage.getByRole('heading', { name: 'Voyage itinerary', exact: true }).evaluate(heading => {
      const target = heading.getBoundingClientRect();
      const scroller = heading.closest('.thread-scroll-container')!.getBoundingClientRect();
      return target.top >= scroller.top && target.top < scroller.bottom;
    })).toBe(true);
    expect(await extensionPage.locator('#cached-original .thread-scroll-container').evaluate(el => el.scrollTop)).toBe(cachedPosition);

    // Returning to a cached workspace only changes styles and the route; no
    // transcript nodes are inserted, removed, or replaced.
    await extensionPage.evaluate(() => {
      document.querySelector<HTMLElement>('#cached-original')!.style.removeProperty('display');
      document.querySelector<HTMLElement>('#cached-other')!.style.setProperty('display', 'none', 'important');
      history.back();
    });
    await expect(extensionPage).toHaveURL(chatUrl);
    await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText(expected.prompts);
    await expect(sidebar).not.toContainText('Voyage itinerary');
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect(sidebar.getByRole('status')).toHaveText('4 messages discovered');

    await extensionPage.evaluate(() => {
      document.querySelector<HTMLElement>('#cached-original')!.style.setProperty('display', 'none', 'important');
      document.querySelector<HTMLElement>('#cached-other')!.style.removeProperty('display');
      history.forward();
    });
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await expect(sidebar.locator('.scroll-pro-item-title')).toHaveText('Plan an imaginary voyage');
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect(sidebar.getByRole('status')).toHaveText('2 messages discovered');
  });
}

test('cached workspace visibility changes rebind the conversation observer without a URL change', async ({ extensionContext, extensionPage }) => {
  await loadScenario(extensionContext, extensionPage, 'current-turn-unit');
  const sidebar = await openOutline(extensionPage);
  await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
  await extensionPage.evaluate(() => {
    const main = document.querySelector('main')!;
    const original = document.createElement('div');
    original.id = 'original-workspace';
    main.replaceWith(original);
    original.append(main);
    const cached = document.createElement('div');
    cached.id = 'replacement-workspace';
    cached.append(main.cloneNode(true));
    cached.querySelector('[data-markdown-text-style] h2')!.textContent = 'Cached view updated';
    cached.style.setProperty('display', 'none', 'important');
    document.body.append(cached);
  });
  await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Cached view updated', exact: true })).toHaveCount(0);
  await extensionPage.evaluate(() => {
    document.querySelector<HTMLElement>('#original-workspace')!.style.setProperty('display', 'none', 'important');
    document.querySelector<HTMLElement>('#replacement-workspace')!.style.removeProperty('display');
  });
  await expect(sidebar.getByRole('button', { name: 'Cached view updated', exact: true })).toBeVisible();
  await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toHaveCount(0);
  await expect(sidebar.locator('[data-block-key]')).toHaveCount(2);
});

test('F13 assistant-only output omits a fabricated user [P3 synthetic state]', async ({ extensionContext, extensionPage }) => {
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
