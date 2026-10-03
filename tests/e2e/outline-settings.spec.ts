import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';
import { dragOutlineWidth } from '../helpers/sidebar';

const sidebarSelector = '[aria-label="Turnline outline"]';

test('depth filtering preserves prompt matches, no-heading fallback and focus', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.locator(sidebarSelector);
    await sidebar.getByRole('button', { name: 'Orbit Beta', exact: true }).click();
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    await sidebar.getByLabel('Outline depth', { exact: true }).selectOption('1');
    await sidebar.getByRole('button', { name: 'Back to outline' }).click();
    await expect(sidebar.locator('[data-outline-level]')).toHaveText(['Orbit Alpha']);
    await expect(sidebar.locator('[data-block-key]').first().locator('.scroll-pro-subheading')).toHaveCount(1);
    await expect(sidebar.locator('[data-block-key]').last().locator('.scroll-pro-subheading')).toHaveCount(1);
    await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toHaveClass(/is-focused/);
    await sidebar.getByPlaceholder('Filter…').fill('Orbit Beta');
    // The captured prompt also mentions Orbit Beta, so its visible root remains.
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await expect(sidebar.locator('[data-outline-level]')).toHaveText(['Orbit Alpha']);
    await sidebar.getByPlaceholder('Filter…').fill('');
});

test('F12 outline depth help shows a tooltip on hover and keyboard focus', async ({ extensionContext, extensionPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.locator(sidebarSelector);
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    const help = sidebar.getByRole('button', { name: 'About outline depth' });
    const tooltip = sidebar.getByRole('tooltip');
    const helpText = 'Controls how many heading levels appear in each response.';
    await expect(help).toHaveCSS('cursor', 'default');
    await expect(help).not.toHaveAttribute('title');
    await expect(tooltip).toHaveCount(0);
    await help.hover();
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toHaveText(helpText);
    await tooltip.hover();
    await expect(tooltip).toBeVisible();
    await sidebar.getByRole('heading', { name: 'Settings', exact: true }).hover();
    await expect(tooltip).toHaveCount(0);
    await help.focus();
    await expect(tooltip).toBeVisible();
    await expect(help).toHaveAccessibleDescription(helpText);
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
    await expect(help).toBeFocused();
    await expect(sidebar.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
    await sidebar.getByRole('button', { name: 'Back to outline' }).focus();

    for (const width of [320, 214]) {
        await dragOutlineWidth(page, width);
        await help.hover();
        await expect(tooltip).toBeVisible();
        const bounds = (await sidebar.boundingBox())!;
        const bubble = (await tooltip.boundingBox())!;
        expect(bubble.x).toBeGreaterThanOrEqual(bounds.x);
        expect(bubble.x + bubble.width).toBeLessThanOrEqual(bounds.x + bounds.width);
        await sidebar.getByRole('heading', { name: 'Settings', exact: true }).hover();
    }
    await expect(sidebar.getByLabel('Outline depth', { exact: true })).toHaveValue('4');
});

test('F12 settings view preserves outline state and applies appearance preferences', async ({ extensionContext, extensionPage: page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await loadScenario(extensionContext, page, 'long-response-l01');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.locator(sidebarSelector);
    const list = sidebar.locator('.scroll-pro-sidebar-list');
    const firstItem = sidebar.locator('[data-block-key]').first();
    await sidebar.getByPlaceholder('Filter…').fill('预习');
    await firstItem.locator('.scroll-pro-item-title').click();
    await expect(firstItem).toHaveAttribute('aria-selected', 'true');
    await list.evaluate(element => { element.scrollTop = 120; });
    const savedScroll = await list.evaluate(element => element.scrollTop);
    const toolbarFontSize = await sidebar.locator('.scroll-pro-depth-btn').first().evaluate(element => getComputedStyle(element).fontSize);

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
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
    await sidebar.getByRole('button', { name: 'System', exact: true }).click();
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(5, 6, 8)');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(255, 255, 255)');
    await sidebar.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect.poll(() => sidebar.evaluate(element => getComputedStyle(element).backgroundColor)).toBe('rgb(5, 6, 8)');
    await sidebar.getByLabel('Outline text size').fill('16');

    await page.keyboard.press('Escape');
    await expect(settingsButton).toBeFocused();
    await expect(sidebar.locator('.scroll-pro-history-status')).toBeVisible();
    await expect(sidebar.getByPlaceholder('Filter…')).toHaveValue('预习');
    await expect(firstItem).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => list.evaluate(element => element.scrollTop)).toBe(savedScroll);
    await expect(firstItem.locator('.scroll-pro-item-title')).toHaveCSS('font-size', '16px');
    await expect(sidebar.locator('.scroll-pro-depth-btn').first()).toHaveCSS('font-size', toolbarFontSize);
});

test('F12 settings persist across reload and synchronize a second tab', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await page.getByRole('button', { name: 'Show all heading levels' }).click();
    await page.getByRole('button', { name: 'Outline settings' }).click();
    await expect(page.getByLabel('Outline depth', { exact: true })).toHaveValue('6');
    await dragOutlineWidth(page, 357);
    await page.getByRole('button', { name: 'Light', exact: true }).click();
    await page.getByRole('button', { name: 'Purple', exact: true }).click();
    await page.getByLabel('Outline text size').fill('15');
    await page.getByLabel('Custom theme color hex').fill('#0EA5E9');
    await page.getByLabel('Background color hex').fill('#FFF7ED');
    const second = await extensionContext.newPage();
    await second.goto(page.url());
    await second.getByRole('button', { name: 'Toggle outline' }).click();
    await expect(second.getByRole('button', { name: 'Show all heading levels' })).toHaveAttribute('aria-pressed', 'true');
    await second.getByRole('button', { name: 'Outline settings' }).click();
    await expect(second.getByLabel('Outline depth', { exact: true })).toHaveValue('6');
    await expect(second.getByRole('separator', { name: 'Outline width' })).toHaveAttribute('aria-valuenow', '357');
    await expect(second.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(second.getByRole('button', { name: 'Purple', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(second.getByLabel('Outline text size')).toHaveValue('15');
    await expect(second.getByLabel('Custom theme color hex')).toHaveValue('#0EA5E9');
    await expect(second.getByLabel('Background color hex')).toHaveValue('#FFF7ED');
    await second.getByRole('button', { name: 'Back to outline' }).click();
    await second.getByRole('button', { name: 'Show up to 1 heading level', exact: true }).click();
    await second.getByRole('button', { name: 'Outline settings' }).click();
    await dragOutlineWidth(second, 290);
    await second.getByRole('button', { name: 'Dark', exact: true }).click();
    await second.getByLabel('Outline text size').fill('16');
    await second.getByLabel('Custom theme color hex').fill('#14B8A6');
    await second.getByLabel('Background color hex').fill('#111827');
    await second.getByRole('switch', { name: 'Hover mode' }).click();
    await expect(page.getByLabel('Outline depth', { exact: true })).toHaveValue('1');
    await expect(page.getByRole('separator', { name: 'Outline width' })).toHaveAttribute('aria-valuenow', '290');
    await expect(page.getByRole('switch', { name: 'Hover mode' })).toBeChecked();
    await expect(page.getByRole('button', { name: 'Dark', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('Outline text size')).toHaveValue('16');
    await expect(page.getByLabel('Custom theme color hex')).toHaveValue('#14B8A6');
    await expect(page.getByLabel('Background color hex')).toHaveValue('#111827');
    await page.reload();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+;' : 'Control+;');
    await expect(page.getByRole('button', { name: 'Show up to 1 heading level', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Outline settings' }).click();
    await expect(page.getByLabel('Outline depth', { exact: true })).toHaveValue('1');
    await expect(page.getByRole('separator', { name: 'Outline width' })).toHaveAttribute('aria-valuenow', '290');
    await expect(page.getByRole('switch', { name: 'Hover mode' })).toBeChecked();
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
        await dragOutlineWidth(page, 420);
        for (const width of [375, 768, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            await expect.poll(async () => {
                const rect = await page.locator(sidebarSelector).boundingBox();
                return !!rect && rect.x >= 0 && rect.x + rect.width <= width;
            }).toBe(true);
            await expect(page.locator('.scroll-pro-sidebar-shell')).toHaveAttribute('data-open-x', anchor);
            await expect(page.getByRole('separator', { name: 'Outline width' })).toHaveAttribute('aria-valuenow', '420');
        }
        expect((await page.locator(sidebarSelector).boundingBox())!.width).toBe(420);
        await page.getByRole('separator', { name: 'Outline width' }).focus();
        await page.keyboard.press(anchor === 'left' ? 'ArrowRight' : 'ArrowLeft');
        await expect(page.getByRole('separator', { name: 'Outline width' })).toHaveAttribute('aria-valuenow', '410');
    });
}
