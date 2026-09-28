import { readFile } from 'node:fs/promises';
import type { BrowserContext, Page } from '@playwright/test';
import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

const promptText = 'Describe imaginary astronomy';
const command = process.platform === 'darwin' ? 'Meta' : 'Control';

async function openFilterScenario(context: BrowserContext, page: Page) {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadScenario(context, page, 'current-turn-unit');
    await page.locator('[data-user-message-bubble]').first().evaluate((bubble, text) => { bubble.textContent = text; }, promptText);
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect(sidebar.locator('.scroll-pro-item-title').first()).toHaveText(promptText);
    return sidebar;
}

test('filtering a section by typing and pasting keeps its original navigation index and keyboard focus', async ({ extensionContext, extensionPage: page }) => {
    await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
    const sidebar = await openFilterScenario(extensionContext, page);
    const filter = sidebar.getByPlaceholder('Filter…');
    const position = await page.locator('.thread-scroll-container').evaluate(scroller => scroller.scrollTop);
    await filter.pressSequentially('  oRBit BeTA  ');
    const blocks = sidebar.locator('[data-block-key]');
    await expect(blocks).toHaveCount(1);
    await expect(blocks.locator('.scroll-pro-item-title')).toHaveText(promptText);
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Orbit Beta']);
    await expect(filter).toBeFocused();
    expect(await page.locator('.thread-scroll-container').evaluate(scroller => scroller.scrollTop)).toBe(position);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();

    await sidebar.getByRole('button', { name: 'Collapse answer outline' }).focus();
    await page.keyboard.press('Tab');
    await expect(blocks.first().locator('.scroll-pro-item-title')).toBeFocused();
    await page.keyboard.press('Tab');
    const section = sidebar.getByRole('button', { name: 'Orbit Beta', exact: true });
    await expect(section).toBeFocused();
    await page.keyboard.press('Enter');
    await expect.poll(() => page.locator('[data-markdown-text-style] h3').first().evaluate(heading => {
        const scroller = document.querySelector('.thread-scroll-container')!;
        return Math.abs(heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24);
    })).toBeLessThan(2);
    await expect(section).toHaveAttribute('aria-current', 'location');

    await sidebar.getByRole('button', { name: 'Clear filter' }).click();
    await expect(blocks).toHaveCount(2);
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveCount(3);
    await page.evaluate(() => navigator.clipboard.writeText('Orbit Beta'));
    await filter.focus();
    await filter.press(`${command}+v`);
    await expect(filter).toHaveValue('Orbit Beta');
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Orbit Beta']);
});

test('filter excludes body text and preserves prompt matches and collapse state', async ({ extensionContext, extensionPage: page }) => {
    const sidebar = await openFilterScenario(extensionContext, page);
    const filter = sidebar.getByPlaceholder('Filter…');
    const blocks = sidebar.locator('[data-block-key]');
    for (const query of ['silver comet', 'Velorin', 'Alpha Orbit']) {
        await filter.fill(query);
        await expect(blocks).toHaveCount(0);
        await expect(sidebar.getByText('No items found', { exact: true })).toBeVisible();
    }
    await filter.fill('astronomy');
    await expect(blocks).toHaveCount(1);
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Orbit Alpha', 'Orbit Beta']);
    await filter.fill('green satellite');
    await expect(blocks).toHaveCount(1);
    await expect(sidebar.locator('.scroll-pro-subheading')).toContainText('Velorin');
    await filter.clear();

    await blocks.first().getByRole('button', { name: 'Collapse answer outline' }).click();
    await filter.fill('Orbit Beta');
    await expect(blocks).toHaveCount(1);
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveCount(0);
    await sidebar.getByRole('button', { name: 'Expand answer outline' }).click();
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Orbit Beta']);
    await sidebar.getByRole('button', { name: 'Collapse answer outline' }).click();
    await sidebar.getByRole('button', { name: 'Clear filter' }).click();
    await expect(blocks).toHaveCount(2);
    await expect(blocks.first().getByRole('button', { name: 'Expand answer outline' })).toBeVisible();
    await expect(blocks.first().locator('.scroll-pro-subheading')).toHaveCount(0);
    await expect(blocks.last().locator('.scroll-pro-subheading')).toHaveCount(1);
});

test('section filter follows response depth while a prompt match retains the available outline', async ({ extensionContext, extensionPage: page }) => {
    const sidebar = await openFilterScenario(extensionContext, page);
    const filter = sidebar.getByPlaceholder('Filter…');
    await filter.fill('Orbit Beta');
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Orbit Beta']);
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    await sidebar.getByLabel('Outline depth', { exact: true }).selectOption('1');
    await sidebar.getByRole('button', { name: 'Back to outline' }).click();
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(0);
    await expect(sidebar.getByText('No items found', { exact: true })).toBeVisible();
    await filter.fill('astronomy');
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Orbit Alpha']);
    await filter.fill('Orbit Beta');
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    await sidebar.getByLabel('Outline depth', { exact: true }).selectOption('2');
    await sidebar.getByRole('button', { name: 'Back to outline' }).click();
    await expect(filter).toHaveValue('Orbit Beta');
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Orbit Beta']);
});

test('reading a filtered-out section highlights a visible ancestor or its block without moving focus', async ({ extensionContext, extensionPage: page }) => {
    const sidebar = await openFilterScenario(extensionContext, page);
    await page.locator('[data-markdown-text-style]').first().evaluate(content => {
        content.innerHTML = '<h2>Match parent</h2><p style="height:180px">Parent body.</p>' +
            '<h3>Hidden child</h3><p style="height:180px">Child body.</p>' +
            '<h2>Other root</h2><p style="height:180px">Root body.</p>' +
            '<h3>Match leaf</h3><p style="height:180px">Leaf body.</p>';
    });
    await expect(sidebar.locator('[data-outline-level]')).toHaveCount(4);
    const filter = sidebar.getByPlaceholder('Filter…');
    await filter.fill('Match');
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Match parent', 'Match leaf']);
    for (const [title, expected] of [['Hidden child', 'Match parent'], ['Other root', promptText]]) {
        const position = await page.locator('.thread-scroll-container').evaluate((scroller, title) => {
            const heading = Array.from(document.querySelectorAll<HTMLElement>('[data-markdown-text-style] h2, [data-markdown-text-style] h3')).find(node => node.innerText === title)!;
            scroller.scrollTop += heading.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
            return scroller.scrollTop;
        }, title);
        const active = sidebar.locator('[aria-current="location"]');
        await expect(active).toHaveCount(1);
        if (expected === promptText) await expect(active.locator('.scroll-pro-item-title')).toHaveText(promptText);
        else await expect(active).toHaveText(expected);
        await expect(filter).toBeFocused();
        expect(await page.locator('.thread-scroll-container').evaluate(scroller => scroller.scrollTop)).toBe(position);
    }
});

test('filtered outlines still copy and export full answers and the discovered conversation', async ({ extensionContext, extensionPage: page }) => {
    await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
    const sidebar = await openFilterScenario(extensionContext, page);
    await sidebar.getByPlaceholder('Filter…').fill('Orbit Beta');
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Orbit Beta']);
    await sidebar.locator('[data-block-key]').click({ button: 'right' });
    await page.getByRole('button', { name: 'Copy response', exact: true }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Orbit Alpha');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('silver comet');
    await sidebar.locator('[data-action="copy-format"]').click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('Velorin');

    await sidebar.locator('[data-action="export-format"]').click({ button: 'right' });
    await page.getByRole('button', { name: /^JSON/ }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Allow scrolling' }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile(await download.path(), 'utf8'));
    expect(exported.turns).toHaveLength(2);
    expect(exported.turns[0].headings).toEqual(['Orbit Alpha', 'Orbit Beta']);
    expect(exported.turns[0].response).toContain('silver comet');
    expect(exported.turns[1].response).toContain('Velorin');
    await expect(sidebar.locator('.scroll-pro-subheading')).toHaveText(['Orbit Beta']);
});
