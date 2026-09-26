import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

const sidebarSelector = '[aria-label="Scroll Pro outline"]';

test('F04/F05 real L02 headings keep their original nested levels', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'long-response-l02');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const levels = await page.locator('[data-markdown-text-style] h1, [data-markdown-text-style] h2, [data-markdown-text-style] h3').evaluateAll(nodes => nodes.map(node => node.tagName.slice(1)));
    const sidebar = page.locator(sidebarSelector);
    await expect(sidebar.locator('[data-outline-level]')).toHaveCount(80);
    // This real answer has only one Chinese chapter marker; preserve all raw levels.
    expect(await sidebar.locator('[data-outline-level]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-outline-level')))).toEqual(levels);
    await expect(sidebar.getByRole('button', { name: '一、先理解：Chapter 3 究竟在研究什么？', exact: true })).toHaveAttribute('data-outline-level', '2');

});

test('F12 depth filtering preserves search, no-heading fallback, selection and exports', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.locator(sidebarSelector);
    await sidebar.getByRole('button', { name: 'Orbit Beta', exact: true }).click();
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    await sidebar.getByLabel('Heading depth').selectOption('1');
    await expect(sidebar.locator('[data-outline-level]')).toHaveCount(0);
    await expect(sidebar.locator('[data-block-key]').first().locator('.scroll-pro-subheading')).toHaveCount(0);
    await expect(sidebar.locator('[data-block-key]').last().locator('.scroll-pro-subheading')).toHaveCount(1);
    await expect(sidebar.locator('[data-block-key]').first()).toHaveAttribute('aria-selected', 'true');
    await sidebar.getByPlaceholder('Filter…').fill('Orbit Beta');
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await expect(sidebar.locator('[data-outline-level]')).toHaveCount(0);
    await sidebar.getByPlaceholder('Filter…').fill('');
    for (const depth of ['4', '6']) {
        await sidebar.getByLabel('Heading depth').selectOption(depth);
        await expect(sidebar.locator('[data-outline-level]')).toHaveCount(2);
    }
    // Existing export flow serializes the original DOM, including hidden H2/H3.
    await sidebar.getByLabel('Heading depth').selectOption('1');
    await sidebar.locator('[data-action="export-format"]').click({ button: 'right' });
    await page.getByRole('button', { name: /JSON/ }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Allow scrolling' }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    let body = '';
    for await (const chunk of stream!) body += chunk.toString();
    expect(body).toContain('Orbit Alpha');
    expect(body).toContain('Orbit Beta');
    const exported = JSON.parse(body);
    expect(exported.turns[0].response).toContain('## Orbit Alpha');
    expect(exported.turns[0].response).toContain('### Orbit Beta');
});

test('F12 settings persist across reload and synchronize a second tab', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await page.getByRole('button', { name: 'Outline settings' }).click();
    await page.getByLabel('Heading depth').selectOption('6');
    await page.getByRole('button', { name: 'Wide', exact: true }).click();
    const second = await extensionContext.newPage();
    await second.goto(page.url());
    await second.getByRole('button', { name: 'Toggle outline' }).click();
    await second.getByRole('button', { name: 'Outline settings' }).click();
    await expect(second.getByLabel('Heading depth')).toHaveValue('6');
    await expect(second.getByRole('button', { name: 'Wide', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await second.getByLabel('Heading depth').selectOption('1');
    await second.getByRole('button', { name: 'Narrow', exact: true }).click();
    await expect(page.getByLabel('Heading depth')).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Narrow', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.reload();
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await page.getByRole('button', { name: 'Outline settings' }).click();
    await expect(page.getByLabel('Heading depth')).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Narrow', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await second.close();
});

for (const anchor of ['left', 'right']) {
    test(`F12 width stays within 375/768/1440 viewports when opening ${anchor}`, async ({ extensionContext, extensionPage: page }) => {
        await loadScenario(extensionContext, page, 'current-turn-unit');
        await page.evaluate(anchorX => localStorage.setItem('scroll-pro-sidebar-position:chatgpt', JSON.stringify({ anchorX, offsetX: 18, y: 72 })), anchor === 'left' ? 'right' : 'left');
        await page.reload();
        await page.getByRole('button', { name: 'Toggle outline' }).click();
        await page.getByRole('button', { name: 'Outline settings' }).click();
        await page.getByRole('button', { name: 'Wide', exact: true }).click();
        for (const width of [375, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            await expect.poll(async () => {
                const rect = await page.locator(sidebarSelector).boundingBox();
                return !!rect && rect.x >= 0 && rect.x + rect.width <= width;
            }).toBe(true);
            await expect(page.locator('.scroll-pro-sidebar-shell')).toHaveAttribute('data-open-x', anchor);
            await expect(page.getByRole('button', { name: 'Wide', exact: true })).toHaveAttribute('aria-pressed', 'true');
        }
        expect((await page.locator(sidebarSelector).boundingBox())!.width).toBe(640);
        await page.getByRole('button', { name: 'Standard', exact: true }).focus();
        await page.keyboard.press('Space');
        await expect(page.getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute('aria-pressed', 'true');
    });
}

test('F05 streamed chapter text recomputes display levels without modifying host tags', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    // Synthetic text updates on captured DOM; this tests reactivity, not new DOM coverage.
    await page.locator('[data-markdown-text-style] h2').evaluate(node => { node.firstChild!.textContent = '一、Overview'; });
    await expect(page.locator(sidebarSelector).getByRole('button', { name: '一、Overview' })).toHaveAttribute('data-outline-level', '2');
    await page.locator('[data-markdown-text-style] h3').evaluate(node => { node.firstChild!.textContent = '二、Summary'; });
    await expect(page.locator(sidebarSelector).getByRole('button', { name: '一、Overview' })).toHaveAttribute('data-outline-level', '1');
    await expect(page.locator(sidebarSelector).getByRole('button', { name: '二、Summary' })).toHaveAttribute('data-outline-level', '1');
    await expect(page.locator('[data-markdown-text-style] h2')).toHaveText('一、Overview');
    await expect(page.locator('[data-markdown-text-style] h3')).toHaveText('二、Summary');
});

test('F12 moving the toggle cleans host styles on cancel, close and unmount', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await page.evaluate(() => { document.body.style.cursor = 'crosshair'; document.body.style.userSelect = 'text'; });
    for (const action of ['cancel', 'close', 'unmount']) {
        const toggle = page.getByRole('button', { name: 'Toggle outline' });
        await toggle.hover();
        await page.mouse.down();
        await expect(page.locator('.scroll-pro-sidebar-shell')).toHaveClass(/is-dragging/);
        await page.mouse.move(800, 200);
        await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe('grabbing');
        if (action === 'cancel') await toggle.dispatchEvent('pointercancel', { pointerId: 1 });
        if (action === 'close') await page.keyboard.press(process.platform === 'darwin' ? 'Meta+;' : 'Control+;');
        if (action === 'unmount') await page.evaluate(() => { history.replaceState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); });
        await expect.poll(() => page.evaluate(() => [document.body.style.cursor, document.body.style.userSelect])).toEqual(['crosshair', 'text']);
        await page.mouse.up();
        if (action === 'close') await toggle.click();
    }
});

test('prompt collapse hides only its answer outline and preserves it across view changes', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.locator(sidebarSelector);
    const first = sidebar.locator('[data-block-key]').first();
    const last = sidebar.locator('[data-block-key]').last();
    await expect(first.locator('.scroll-pro-subheading')).toHaveCount(2);
    await expect(last.locator('.scroll-pro-subheading')).toHaveCount(1);
    await expect(first.locator('.scroll-pro-collapse-btn')).toHaveCount(1);
    const position = await page.locator('.thread-scroll-container').evaluate(el => el.scrollTop);
    await first.getByRole('button', { name: 'Collapse answer outline' }).click();
    await expect(first.locator('.scroll-pro-subheading')).toHaveCount(0);
    await expect(last.locator('.scroll-pro-subheading')).toHaveCount(1);
    expect(await page.locator('.thread-scroll-container').evaluate(el => el.scrollTop)).toBe(position);
    await sidebar.getByRole('button', { name: 'Prompts', exact: true }).click();
    await expect(sidebar.locator('.scroll-pro-collapse-btn')).toHaveCount(0);
    await sidebar.getByRole('button', { name: 'All', exact: true }).click();
    const expand = first.getByRole('button', { name: 'Expand answer outline' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expand.focus();
    await page.keyboard.press('Space');
    await expect(first.locator('.scroll-pro-subheading')).toHaveCount(2);
    await expect(first.getByRole('button', { name: 'Collapse answer outline' })).toHaveAttribute('aria-expanded', 'true');
});
