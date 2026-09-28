import type { Page } from '@playwright/test';
import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

test.beforeEach(async ({ extensionContext, extensionPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await expect(page.getByRole('button', { name: 'Refresh history' })).toBeVisible();
});

async function expectPromptAtTop(page: Page) {
    await expect.poll(() => page.locator('[data-user-message-bubble]').first().evaluate(element => {
        const offset = element.getBoundingClientRect().top - document.querySelector('.thread-scroll-container')!.getBoundingClientRect().top;
        return offset >= 0 && offset < 50;
    })).toBe(true);
}

// The sidebar renderer and hit areas are shared by all providers.
test('card whitespace preserves the reading position while its prompt title navigates', async ({ extensionPage: page }) => {
    await page.locator('[data-user-message-bubble]').first().evaluate(element => { element.textContent = 'Short prompt'; });
    const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
    const block = sidebar.locator('[data-block-key]').first();
    const title = block.getByRole('button', { name: 'Short prompt', exact: true });
    await expect(title).toBeVisible();
    const scroller = page.locator('.thread-scroll-container');
    const position = await scroller.evaluate(element => { element.scrollTop = 0; return element.scrollTop; });
    const blankPoints = await block.evaluate(element => {
        const card = element.getBoundingClientRect();
        const header = element.querySelector('.scroll-pro-item-header')!.getBoundingClientRect();
        const headings = element.querySelectorAll('.scroll-pro-subheading');
        const first = headings[0].getBoundingClientRect();
        const second = headings[1].getBoundingClientRect();
        return [
            { x: card.left + 1, y: card.top + 1 },
            { x: header.right - 12, y: header.top + header.height / 2 },
            { x: first.left + 10, y: (first.bottom + second.top) / 2 },
        ];
    });
    for (const point of blankPoints) {
        await page.mouse.click(point.x, point.y);
        // Reduced-motion navigation is immediate; flush queued rendering work.
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        expect(await scroller.evaluate(element => element.scrollTop)).toBe(position);
    }
    await title.click();
    await expectPromptAtTop(page);
    expect(await scroller.evaluate(element => element.scrollTop)).not.toBe(position);
});

test('Tab skips card containers and prompt titles activate with Space and Enter', async ({ extensionPage: page }) => {
    const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
    const block = sidebar.locator('[data-block-key]').first();
    const promptText = await page.locator('[data-user-message-bubble]').first().innerText();
    const title = block.getByRole('button', { name: promptText, exact: true });
    await sidebar.getByRole('button', { name: 'Refresh history' }).focus();
    await page.keyboard.press('Tab');
    await expect(block.getByRole('button', { name: 'Collapse answer outline' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(title).toBeFocused();
    await page.keyboard.press('Space');
    await expectPromptAtTop(page);
    await page.keyboard.press('Tab');
    await expect(block.getByRole('button', { name: 'Orbit Alpha', exact: true })).toBeFocused();
    await page.locator('.thread-scroll-container').evaluate(element => { element.scrollTop = 0; });
    await page.keyboard.press('Shift+Tab');
    await expect(title).toBeFocused();
    await page.keyboard.press('Enter');
    await expectPromptAtTop(page);
});
