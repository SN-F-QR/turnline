import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

const sidebarSelector = '[aria-label="Scroll Pro outline"]';

test('F04/F05 real L02 headings keep their original nested levels', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'long-response-l02');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const levels = await page.locator('[data-markdown-text-style] h1, [data-markdown-text-style] h2, [data-markdown-text-style] h3').evaluateAll(nodes =>
        nodes.filter(node => !node.closest('[data-d-component="box"]')).map(node => node.tagName.slice(1))
    );
    const sidebar = page.locator(sidebarSelector);
    await expect(sidebar.locator('[data-outline-level]')).toHaveCount(levels.length);
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
    await sidebar.getByRole('button', { name: 'Back to outline' }).click();
    await expect(sidebar.locator('[data-outline-level]')).toHaveCount(0);
    await expect(sidebar.locator('[data-block-key]').first().locator('.scroll-pro-subheading')).toHaveCount(0);
    await expect(sidebar.locator('[data-block-key]').last().locator('.scroll-pro-subheading')).toHaveCount(1);
    await expect(sidebar.locator('[data-block-key]').first()).toHaveAttribute('aria-selected', 'true');
    await sidebar.getByPlaceholder('Filter…').fill('Orbit Beta');
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await expect(sidebar.locator('[data-outline-level]')).toHaveCount(0);
    await sidebar.getByPlaceholder('Filter…').fill('');
    for (const depth of ['4', '6']) {
        await sidebar.getByRole('button', { name: 'Outline settings' }).click();
        await sidebar.getByLabel('Heading depth').selectOption(depth);
        await sidebar.getByRole('button', { name: 'Back to outline' }).click();
        await expect(sidebar.locator('[data-outline-level]')).toHaveCount(2);
    }
    // Existing export flow serializes the original DOM, including hidden H2/H3.
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    await sidebar.getByLabel('Heading depth').selectOption('1');
    await sidebar.getByRole('button', { name: 'Back to outline' }).click();
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

test('F12 settings view preserves outline state and applies appearance preferences', async ({ extensionContext, extensionPage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await loadScenario(extensionContext, page, 'long-response-l01');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.locator(sidebarSelector);
    const list = sidebar.locator('.scroll-pro-sidebar-list');
    const firstItem = sidebar.locator('[data-block-key]').first();
    await sidebar.getByPlaceholder('Filter…').fill('Chapter');
    await firstItem.locator('.scroll-pro-item-title').click();
    await expect(firstItem).toHaveAttribute('aria-selected', 'true');
    await list.evaluate(element => { element.scrollTop = 120; });
    const savedScroll = await list.evaluate(element => element.scrollTop);
    const toolbarFontSize = await sidebar.getByRole('button', { name: 'All', exact: true }).evaluate(element => getComputedStyle(element).fontSize);

    const settingsButton = sidebar.getByRole('button', { name: 'Outline settings' });
    await expect(sidebar.locator('.scroll-pro-history-status')).toBeVisible();
    await settingsButton.click();
    await expect(sidebar.getByRole('button', { name: 'Back to outline' })).toBeFocused();
    await expect(sidebar.getByRole('heading', { name: 'Settings' })).toHaveCSS('font-size', toolbarFontSize);
    await expect(sidebar.getByPlaceholder('Filter…')).toHaveCount(0);
    await expect(sidebar.locator('.scroll-pro-history-status')).toHaveCount(0);
    await page.keyboard.press('ArrowDown');

    const themeColors = [
        ['Blue', '#3566f0'],
        ['Green', '#19b79e'],
        ['Yellow', '#fdcd53'],
        ['Pink', '#fb70ab'],
        ['Orange', '#ff8671'],
        ['Purple', '#ab5eff'],
    ] as const;
    for (const [color, hex] of themeColors) {
        await sidebar.getByRole('button', { name: color, exact: true }).click();
        await expect(page.locator('.scroll-pro-app-root')).toHaveAttribute('data-accent', color.toLowerCase());
        await expect.poll(() => page.locator('.scroll-pro-app-root').evaluate(element => getComputedStyle(element).getPropertyValue('--accent').trim())).toBe(hex);
    }
    await sidebar.getByLabel('Custom theme color hex').fill('#123456');
    await expect(page.locator('.scroll-pro-app-root')).toHaveAttribute('data-custom-accent', 'true');
    await expect.poll(() => page.locator('.scroll-pro-app-root').evaluate(element => getComputedStyle(element).getPropertyValue('--accent').trim())).toBe('#123456');
    await expect(sidebar.getByRole('button', { name: 'Purple', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await sidebar.getByLabel('Custom theme color hex').fill('');
    await expect(page.locator('.scroll-pro-app-root')).not.toHaveAttribute('data-custom-accent', 'true');
    await expect(sidebar.getByRole('button', { name: 'Purple', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await sidebar.getByLabel('Custom theme color hex').fill('#654321');
    await sidebar.getByRole('button', { name: 'Blue', exact: true }).click();
    await expect(sidebar.getByLabel('Custom theme color hex')).toHaveValue('');

    await sidebar.getByLabel('Background color hex').fill('#FEF3C7');
    await expect(page.locator('.scroll-pro-app-root')).toHaveAttribute('data-custom-background-tone', 'light');
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(254, 243, 199)');
    await expect(sidebar).toHaveCSS('color', 'rgb(21, 23, 28)');

    // Verify dark mode overrides custom background without dropping the setting
    await sidebar.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(page.locator('.scroll-pro-app-root')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('.scroll-pro-app-root')).not.toHaveAttribute('data-custom-background-tone');
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(5, 6, 8)');
    await expect(sidebar.getByLabel('Background color hex')).toHaveValue('#FEF3C7');

    // Switching back to Light restores the custom background
    await sidebar.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('.scroll-pro-app-root')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('.scroll-pro-app-root')).toHaveAttribute('data-custom-background-tone', 'light');
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(254, 243, 199)');
    await expect(sidebar.getByLabel('Background color hex')).toHaveValue('#FEF3C7');

    await sidebar.getByLabel('Background color hex').fill('');
    await expect(page.locator('.scroll-pro-app-root')).not.toHaveAttribute('data-custom-background-tone');
    await sidebar.getByRole('button', { name: 'Light', exact: true }).click();
    await expect(page.locator('.scroll-pro-app-root')).toHaveAttribute('data-theme', 'light');
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(248, 247, 244)');
    await sidebar.getByRole('button', { name: 'System', exact: true }).click();
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(5, 6, 8)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(248, 247, 244)');
    await sidebar.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(5, 6, 8)');
    await sidebar.getByLabel('Outline text size').fill('16');

    await page.keyboard.press('Escape');
    await expect(settingsButton).toBeFocused();
    await expect(sidebar.locator('.scroll-pro-history-status')).toBeVisible();
    await expect(sidebar.getByPlaceholder('Filter…')).toHaveValue('Chapter');
    await expect(firstItem).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(savedScroll);
    await expect(firstItem.locator('.scroll-pro-item-title')).toHaveCSS('font-size', '16px');
    await expect(sidebar.getByRole('button', { name: 'All', exact: true })).toHaveCSS('font-size', toolbarFontSize);
});

test('F12 settings persist across reload and synchronize a second tab', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await page.getByRole('button', { name: 'Outline settings' }).click();
    await page.getByLabel('Heading depth').selectOption('6');
    await page.getByRole('button', { name: 'Wide', exact: true }).click();
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.getByRole('button', { name: 'Purple', exact: true }).click();
    await page.getByLabel('Outline text size').fill('15');
    await page.getByLabel('Custom theme color hex').fill('#0EA5E9');
    await page.getByLabel('Background color hex').fill('#FFF7ED');
    const second = await extensionContext.newPage();
    await second.goto(page.url());
    await second.getByRole('button', { name: 'Toggle outline' }).click();
    await second.getByRole('button', { name: 'Outline settings' }).click();
    await expect(second.getByLabel('Heading depth')).toHaveValue('6');
    await expect(second.getByRole('button', { name: 'Wide', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(second.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(second.getByRole('button', { name: 'Purple', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(second.getByLabel('Outline text size')).toHaveValue('15');
    await expect(second.getByLabel('Custom theme color hex')).toHaveValue('#0EA5E9');
    await expect(second.getByLabel('Background color hex')).toHaveValue('#FFF7ED');
    await second.getByLabel('Heading depth').selectOption('1');
    await second.getByRole('button', { name: 'Narrow', exact: true }).click();
    await second.getByRole('button', { name: 'Dark', exact: true }).click();
    await second.getByLabel('Outline text size').fill('16');
    await second.getByLabel('Custom theme color hex').fill('#14B8A6');
    await second.getByLabel('Background color hex').fill('#111827');
    await expect(page.getByLabel('Heading depth')).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Narrow', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Outline text size')).toHaveValue('16');
    await expect(page.getByLabel('Custom theme color hex')).toHaveValue('#14B8A6');
    await expect(page.getByLabel('Background color hex')).toHaveValue('#111827');
    await page.reload();
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await page.getByRole('button', { name: 'Outline settings' }).click();
    await expect(page.getByLabel('Heading depth')).toHaveValue('1');
    await expect(page.getByRole('button', { name: 'Narrow', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Outline text size')).toHaveValue('16');
    await expect(page.getByLabel('Custom theme color hex')).toHaveValue('#14B8A6');
    await expect(page.getByLabel('Background color hex')).toHaveValue('#111827');
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
