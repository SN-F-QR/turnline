import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';
import { openOutline } from '../helpers/sidebar';

test('current ChatGPT capture: turns, headings, search, and navigation', async ({ extensionContext, extensionPage }) => {
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

test('overlapping legacy wrapper does not duplicate a current turn [synthetic wrapper]', async ({ extensionContext, extensionPage }) => {
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

test('L02 outline preserves prompts and normalizes each response independently', async ({ extensionContext, extensionPage: page }) => {
    const expected = await loadScenario(extensionContext, page, 'long-response-l02');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const levels = await page.locator('[data-markdown-text-style] h1, [data-markdown-text-style] h2, [data-markdown-text-style] h3').evaluateAll(nodes =>
        nodes.filter(node => !node.closest('[data-d-component="box"]')).map(node => Number(node.tagName.slice(1)))
    );
    const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
    await expect(sidebar.locator('.scroll-pro-item-title').first()).toContainText(expected.firstPrompt!);
    await expect(sidebar.getByRole('button', { name: expected.firstHeading!, exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: expected.lastHeading!, exact: true })).toBeVisible();
    await expect(sidebar.locator('[data-outline-level]')).toHaveCount(levels.length);
    expect(levels).toEqual(expected.headingLevels!.flat());
    expect(await sidebar.locator('[data-outline-level]').evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-outline-level'))))).toEqual(expected.outlineDepths!.flat());
    await expect(sidebar.getByRole('button', { name: '一、先理解：Chapter 3 究竟在研究什么？', exact: true })).toHaveAttribute('data-outline-level', '2');
});

test('streamed chapter text recomputes display levels without modifying host tags', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const sidebar = await openOutline(page);
    await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toBeVisible();
    // Synthetic text updates on captured DOM; this tests reactivity, not new DOM coverage.
    await page.locator('[data-markdown-text-style] h2').evaluate(node => { node.firstChild!.textContent = '一、Overview'; });
    await expect(sidebar.getByRole('button', { name: '一、Overview' })).toHaveAttribute('data-outline-level', '1');
    await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: 'Orbit Beta', exact: true })).toHaveAttribute('data-outline-level', '2');
    await page.locator('[data-markdown-text-style] h3').evaluate(node => { node.firstChild!.textContent = '二、Summary'; });
    await expect(sidebar.getByRole('button', { name: '一、Overview' })).toHaveAttribute('data-outline-level', '1');
    await expect(sidebar.getByRole('button', { name: '二、Summary' })).toHaveAttribute('data-outline-level', '1');
    await expect(sidebar.getByRole('button', { name: 'Orbit Beta', exact: true })).toHaveCount(0);
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(2);
    await expect(page.locator('[data-markdown-text-style] h2')).toHaveText('一、Overview');
    await expect(page.locator('[data-markdown-text-style] h3')).toHaveText('二、Summary');
});
