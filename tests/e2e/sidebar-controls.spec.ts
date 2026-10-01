import type { Page } from '@playwright/test';
import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';
import { dragOutlineWidth } from '../helpers/sidebar';

const shortcut = process.platform === 'darwin' ? 'Meta+;' : 'Control+;';

async function openOutline(page: Page) {
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    return sidebar;
}

async function enableHover(page: Page) {
    await page.getByRole('button', { name: 'Outline settings' }).click();
    const control = page.getByRole('switch', { name: 'Hover mode' });
    await expect(control).not.toBeChecked();
    await control.click();
    await expect(control).toBeChecked();
    await page.getByRole('button', { name: 'Back to outline' }).click();
}

test('bulk collapse includes filtered turns, preserves host position and skips hidden headings with Tab', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const sidebar = await openOutline(page);
    await expect(sidebar.locator('.scroll-pro-outline-label')).toHaveText('All');
    const position = await page.locator('.thread-scroll-container').evaluate(element => element.scrollTop);
    const filter = sidebar.getByPlaceholder('Filter…');
    await filter.fill('Orbit Beta');
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await sidebar.getByRole('button', { name: 'Collapse all turns' }).click();
    await filter.fill('');
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: 'Expand answer outline' })).toHaveCount(2);
    expect(await page.locator('.thread-scroll-container').evaluate(element => element.scrollTop)).toBe(position);

    const first = sidebar.locator('[data-block-key]').first();
    const last = sidebar.locator('[data-block-key]').last();
    await first.getByRole('button', { name: 'Expand answer outline' }).focus();
    await page.keyboard.press('Tab');
    await expect(first.locator('.scroll-pro-item-title')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(last.getByRole('button', { name: 'Expand answer outline' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(last.locator('.scroll-pro-item-title')).toBeFocused();
    await first.getByRole('button', { name: 'Expand answer outline' }).click();
    await expect(first.locator('.scroll-pro-subheading')).toHaveCount(2);
    await expect(last.locator('.scroll-pro-subheading')).toHaveCount(0);
    await sidebar.getByRole('button', { name: 'Collapse all turns' }).click();
    await sidebar.getByRole('button', { name: 'Expand all turns' }).click();
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveCount(3);
});

test('collapsing during history refresh immediately moves reading highlight to the turn title', async ({ extensionContext, extensionPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const sidebar = await openOutline(page);
    const first = sidebar.locator('[data-block-key]').first();
    for (const action of ['single', 'all']) {
        await sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true }).click();
        await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toHaveAttribute('aria-current', 'location');
        await sidebar.getByRole('button', { name: 'Refresh history' }).click();
        await expect(sidebar.getByRole('button', { name: 'Stop refreshing history' })).toBeVisible();
        if (action === 'single') await first.getByRole('button', { name: 'Collapse answer outline' }).click();
        else await sidebar.getByRole('button', { name: 'Collapse all turns' }).click();
        expect(await first.getAttribute('aria-current')).toBe('location');
        await sidebar.getByRole('button', { name: 'Stop refreshing history' }).click();
        if (action === 'single') await first.getByRole('button', { name: 'Expand answer outline' }).click();
        else await sidebar.getByRole('button', { name: 'Expand all turns' }).click();
    }
});

test('assistant-only answers support individual and bulk collapse', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.evaluate(() => document.querySelectorAll('[data-content-search-unit-key$=":user"]').forEach(unit => unit.remove()));
    const sidebar = await openOutline(page);
    await expect(sidebar.getByRole('button', { name: 'Collapse answer outline' })).toHaveCount(2);
    const first = sidebar.locator('[data-block-key]').first();
    await first.getByRole('button', { name: 'Collapse answer outline' }).click();
    await expect(first.locator('.scroll-pro-item-title')).toHaveText('Orbit Alpha');
    await expect(first.locator('.scroll-pro-subheading')).toHaveCount(0);
    await sidebar.getByRole('button', { name: 'Collapse all turns' }).click();
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveCount(0);
    await sidebar.getByRole('button', { name: 'Expand all turns' }).click();
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveCount(3);
});

test('newly discovered turns expand and changing conversations resets collapsed turns', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const sidebar = await openOutline(page);
    await sidebar.getByRole('button', { name: 'Collapse all turns' }).click();
    await page.evaluate(() => {
        const turn = document.createElement('div');
        turn.setAttribute('data-turn-key', 'sidebar-new-turn');
        turn.innerHTML = '<div data-content-search-unit-key="sidebar-new-turn:user"><div data-user-message-bubble>Invent a blue moon</div></div><div data-content-search-unit-key="sidebar-new-turn:assistant"><div data-markdown-text-style="assistant-message"><h2>Blue moon</h2><p>A fictional moon shines blue.</p></div></div>';
        document.querySelector('[data-turn-key]')!.parentElement!.append(turn);
    });
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(3);
    await expect(sidebar.getByRole('button', { name: 'Blue moon', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Expand answer outline' })).toHaveCount(2);
    await expect(sidebar.getByRole('button', { name: 'Collapse all turns' })).toBeVisible();
    await page.evaluate(() => {
        // Model the new chat's DOM identity as well as its URL.
        document.querySelectorAll('[data-chatgpt-selection-conversation-id]').forEach(marker => {
            marker.setAttribute('data-chatgpt-selection-conversation-id', 'fixture-sidebar-new-chat');
        });
        history.pushState({}, '', '/c/fixture-sidebar-new-chat');
        window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(sidebar.getByRole('button', { name: 'Collapse answer outline' })).toHaveCount(3);
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveCount(4);
});

test('a prompt without answer content has no collapse control', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.evaluate(() => document.querySelectorAll('[data-content-search-unit-key$=":assistant"]').forEach(unit => unit.remove()));
    const sidebar = await openOutline(page);
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(2);
    await expect(sidebar.locator('.scroll-pro-collapse-btn')).toHaveCount(0);
    await expect(sidebar.getByRole('button', { name: 'Collapse all turns' })).toBeDisabled();
});

for (const direction of ['left', 'right'] as const) {
    test(`width drag clamps bounds, fixes the ${direction} anchor and double-click resets to 320px`, async ({ extensionContext, extensionPage: page }) => {
        await loadScenario(extensionContext, page, 'current-turn-unit');
        await page.evaluate(anchorX => localStorage.setItem('scroll-pro-sidebar-position:chatgpt', JSON.stringify({ anchorX, offsetX: 18, y: 72 })), direction === 'left' ? 'right' : 'left');
        await page.reload();
        const sidebar = await openOutline(page);
        const handle = sidebar.getByRole('separator', { name: 'Outline width' });
        await expect(handle).toHaveAttribute('aria-valuenow', '320');
        const originalBounds = (await sidebar.boundingBox())!;
        expect(originalBounds.width).toBe(320);
        const originalAnchor = direction === 'left' ? originalBounds.x + originalBounds.width : originalBounds.x;
        const toggle = (await page.getByRole('button', { name: 'Toggle outline' }).boundingBox())!;
        await dragOutlineWidth(page, 150);
        await expect(handle).toHaveAttribute('aria-valuenow', '214');
        expect((await sidebar.boundingBox())!.width).toBe(214);
        await dragOutlineWidth(page, 600);
        await expect(handle).toHaveAttribute('aria-valuenow', '420');
        expect((await sidebar.boundingBox())!.width).toBe(420);
        expect((await page.getByRole('button', { name: 'Toggle outline' }).boundingBox())!).toEqual(toggle);

        const rect = (await handle.boundingBox())!;
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await expect(handle).toHaveCSS('cursor', 'ew-resize');
        await expect(handle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await page.mouse.down();
        await page.mouse.move(rect.x + rect.width / 2 + (direction === 'left' ? 60 : -60), rect.y + rect.height / 2);
        await expect(handle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(page.locator('.scroll-pro-sidebar-shell')).toHaveAttribute('data-open-x', direction);
        const resized = (await sidebar.boundingBox())!;
        const anchor = direction === 'left' ? resized.x + resized.width : resized.x;
        expect(anchor).toBe(originalAnchor);
        await page.mouse.up();
        await expect(handle).toHaveAttribute('aria-valuenow', '360');
        await handle.focus();
        await page.keyboard.press(direction === 'left' ? 'ArrowLeft' : 'ArrowRight');
        await expect(handle).toHaveAttribute('aria-valuenow', '370');
        await page.keyboard.press(direction === 'left' ? 'ArrowRight' : 'ArrowLeft');
        await expect(handle).toHaveAttribute('aria-valuenow', '360');
        await handle.dblclick();
        await expect(handle).toHaveAttribute('aria-valuenow', '320');
        expect((await sidebar.boundingBox())!.width).toBe(320);
        await sidebar.getByRole('button', { name: 'Outline settings' }).click();
        await dragOutlineWidth(page, 214);
        await handle.dblclick();
        await expect(handle).toHaveAttribute('aria-valuenow', '320');
        await page.reload();
        await openOutline(page);
        await expect(handle).toHaveAttribute('aria-valuenow', '320');
    });
}

test('minimum width fits settings controls and a narrow viewport retains the saved width', async ({ extensionContext, extensionPage: page }, testInfo) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const sidebar = await openOutline(page);
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    await dragOutlineWidth(page, 214);
    await expect.poll(() => sidebar.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return Array.from(element.querySelectorAll('input, select, button')).every(control => {
            const rect = control.getBoundingClientRect();
            return rect.left >= bounds.left && rect.right <= bounds.right;
        });
    })).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('sidebar-minimum.png') });
    await dragOutlineWidth(page, 420);
    await page.setViewportSize({ width: 240, height: 900 });
    await expect(sidebar.getByRole('separator', { name: 'Outline width' })).toHaveAttribute('aria-valuenow', '420');
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(204);
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(420);
});

test('resizing cleans host styles and discards unfinished changes on cancel, close and unmount', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await openOutline(page);
    await page.evaluate(() => { document.body.style.cursor = 'crosshair'; document.body.style.userSelect = 'text'; });
    for (const action of ['cancel', 'close', 'unmount']) {
        const handle = page.getByRole('separator', { name: 'Outline width' });
        await handle.hover();
        const rect = (await handle.boundingBox())!;
        await page.mouse.down();
        await page.mouse.move(rect.x - 40, rect.y + rect.height / 2);
        await expect(page.locator('.scroll-pro-sidebar-shell')).toHaveClass(/is-resizing/);
        await expect.poll(() => page.evaluate(() => document.body.style.cursor)).toBe('ew-resize');
        if (action === 'cancel') await handle.dispatchEvent('pointercancel', { pointerId: 1 });
        if (action === 'close') await page.keyboard.press(shortcut);
        if (action === 'unmount') await page.evaluate(() => { history.replaceState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); });
        await expect.poll(() => page.evaluate(() => [document.body.style.cursor, document.body.style.userSelect])).toEqual(['crosshair', 'text']);
        await page.mouse.up();
        if (action === 'close') await page.keyboard.press(shortcut);
        if (action !== 'unmount') await expect(handle).toHaveAttribute('aria-valuenow', '320');
    }
});

test('hover is opt-in, crosses the toggle gap, cancels closing and preserves click toggling', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const toggle = page.getByRole('button', { name: 'Toggle outline' });
    const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
    await toggle.hover();
    await page.waitForTimeout(250);
    await expect(sidebar).toBeHidden();
    await openOutline(page);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    await expect(sidebar).toBeVisible();
    await enableHover(page);
    await page.mouse.move(0, 0);
    await expect(sidebar).toBeHidden();
    await toggle.hover();
    await expect(sidebar).toBeVisible();
    const button = (await toggle.boundingBox())!;
    const panel = (await sidebar.boundingBox())!;
    await page.mouse.move(button.x + button.width / 2, button.y + button.height + 5);
    await page.waitForTimeout(75);
    await page.mouse.move(panel.x + panel.width / 2, panel.y + 15);
    await page.waitForTimeout(250);
    await expect(sidebar).toBeVisible();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(75);
    await toggle.hover();
    await page.waitForTimeout(250);
    await expect(sidebar).toBeVisible();
    await toggle.click();
    await expect(sidebar).toBeHidden();
    await page.mouse.move(button.x + 10, button.y + 10);
    await page.waitForTimeout(250);
    await expect(sidebar).toBeHidden();
    await toggle.click();
    await expect(sidebar).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(sidebar).toBeHidden();
    await toggle.hover();
    await expect(sidebar).toBeVisible();
    await page.getByRole('button', { name: 'Outline settings' }).click();
    await page.getByRole('switch', { name: 'Hover mode' }).click();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
    await expect(sidebar).toBeVisible();
});

test('hover crosses an upward gap and keyboard opening works while touch hover is ignored', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.evaluate(() => localStorage.setItem('scroll-pro-sidebar-position:chatgpt', JSON.stringify({ anchorX: 'right', offsetX: 18, y: innerHeight - 60 })));
    await page.reload();
    const sidebar = await openOutline(page);
    await enableHover(page);
    await page.mouse.move(0, 0);
    await expect(sidebar).toBeHidden();
    const toggle = page.getByRole('button', { name: 'Toggle outline' });
    await toggle.dispatchEvent('pointerover', { pointerType: 'touch', pointerId: 42 });
    await expect(sidebar).toBeHidden();
    await page.keyboard.press(shortcut);
    await page.waitForTimeout(250);
    await expect(sidebar).toBeVisible();
    await page.keyboard.press(shortcut);
    await expect(sidebar).toBeHidden();
    await toggle.hover();
    await expect(sidebar).toBeVisible();
    await expect(page.locator('.scroll-pro-sidebar-shell')).toHaveAttribute('data-open-y', 'up');
    const button = (await toggle.boundingBox())!;
    const panel = (await sidebar.boundingBox())!;
    await page.mouse.move(button.x + button.width / 2, button.y - 5);
    await page.waitForTimeout(75);
    await page.mouse.move(panel.x + panel.width / 2, panel.y + panel.height - 15);
    await page.waitForTimeout(250);
    await expect(sidebar).toBeVisible();
});

test('hover keeps menus usable and pauses closing while an export dialog is open', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const sidebar = await openOutline(page);
    await enableHover(page);
    await sidebar.locator('[data-action="copy-format"]').click({ button: 'right' });
    const menu = page.locator('.scroll-pro-context-menu');
    await menu.hover();
    await page.waitForTimeout(250);
    await expect(sidebar).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(sidebar).toBeHidden();
    await expect(menu).toHaveCount(0);
    await page.getByRole('button', { name: 'Toggle outline' }).hover();
    await sidebar.locator('[data-action="export-format"]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.mouse.move(0, 0);
    await page.waitForTimeout(300);
    await expect(sidebar).toBeVisible();
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.mouse.move(0, 0);
    await expect(sidebar).toBeHidden();
});

test('hover stays open during toggle dragging and resizing and resumes closing on release', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const sidebar = await openOutline(page);
    await enableHover(page);
    const toggle = page.getByRole('button', { name: 'Toggle outline' });
    await toggle.hover();
    await page.mouse.down();
    await expect(page.locator('.scroll-pro-sidebar-shell')).toHaveClass(/is-dragging/);
    await page.mouse.move(1050, 220);
    await page.waitForTimeout(300);
    await expect(sidebar).toBeVisible();
    await page.mouse.up();
    const handle = sidebar.getByRole('separator', { name: 'Outline width' });
    const rect = (await handle.boundingBox())!;
    await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(0, rect.y + rect.height / 2);
    await page.waitForTimeout(300);
    await expect(sidebar).toBeVisible();
    await page.mouse.up();
    await expect(sidebar).toBeHidden();
});

test('moving the toggle cleans host styles on cancel, close and unmount', async ({ extensionContext, extensionPage: page }) => {
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

test('prompt collapse hides only its answer outline and preserves it across settings and reopening', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
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
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    await sidebar.getByRole('button', { name: 'Back to outline' }).click();
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const expand = first.getByRole('button', { name: 'Expand answer outline' });
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await expand.focus();
    await page.keyboard.press('Space');
    await expect(first.locator('.scroll-pro-subheading')).toHaveCount(2);
    await expect(first.getByRole('button', { name: 'Collapse answer outline' })).toHaveAttribute('aria-expanded', 'true');
});
