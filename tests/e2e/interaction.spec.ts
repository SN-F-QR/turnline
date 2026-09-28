import { readFile } from 'node:fs/promises';
import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

async function open(page: import('@playwright/test').Page) {
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    return page.getByRole('complementary', { name: 'Turnline outline' });
}

test('reading follows a short final section at the bottom without changing the first prompt alignment', async ({ extensionContext, extensionPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const sidebar = await open(page);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    const blocks = sidebar.locator('[data-block-key]');

    await page.locator('.thread-scroll-container').evaluate(scroller => { scroller.scrollTop = 0; });
    await expect(blocks.last().locator('[aria-current="location"]')).toHaveCount(1);

    await sidebar.getByRole('button', { name: 'Collapse all turns', exact: true }).click();
    await expect(blocks.last()).toHaveAttribute('aria-current', 'location');
    await blocks.first().locator('.scroll-pro-item-title').click();
    await expect(blocks.first()).toHaveAttribute('aria-current', 'location');
    await expect.poll(() => page.locator('[data-user-message-bubble]').first().evaluate(node => {
        const viewport = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
        const offset = node.getBoundingClientRect().top - viewport.top;
        return offset >= 0 && offset < 50;
    })).toBe(true);
});

test('F10 reading follows headings independently of focus and never scrolls the host', async ({ extensionContext, extensionPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const expected = await loadScenario(extensionContext, page, 'long-response-l01');
    const sidebar = await open(page);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await sidebar.getByRole('button', { name: expected.cold.firstHeading!, exact: true }).click();
    await expect(sidebar.locator('[aria-current="location"]')).toHaveCount(1);
    await expect(sidebar.locator('[aria-current="location"]')).toHaveText(expected.cold.firstHeading!);
    const filter = sidebar.getByPlaceholder('Filter…');
    await filter.focus();
    const position = await page.locator('.thread-scroll-container').evaluate(scroller => {
        const headings = Array.from(document.querySelectorAll<HTMLElement>('[data-markdown-text-style] h2'));
        const target = headings[0];
        scroller.scrollTop += target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
        return { top: scroller.scrollTop, title: target.innerText };
    });
    await expect(sidebar.locator('[aria-current="location"]')).toHaveCount(1);
    await expect(sidebar.locator('[aria-current="location"]')).toHaveText(position.title);
    await expect(filter).toBeFocused();
    await expect.poll(() => page.locator('.thread-scroll-container').evaluate(el => el.scrollTop)).toBe(position.top);
    await sidebar.getByRole('button', { name: 'Collapse all turns', exact: true }).click();
    await expect(sidebar.locator('[data-block-key][aria-current="location"]')).toHaveCount(1);
    await expect.poll(() => page.locator('.thread-scroll-container').evaluate(el => el.scrollTop)).toBe(position.top);
    await sidebar.getByRole('button', { name: 'Expand all turns', exact: true }).click();
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    await sidebar.getByLabel('Outline depth', { exact: true }).selectOption('1');
    await sidebar.getByRole('button', { name: 'Back to outline' }).click();
    await expect(sidebar.locator('[aria-current="location"]')).toHaveCount(1);
    await expect(sidebar.locator('[data-block-key][aria-current="location"], [data-outline-level="1"][aria-current="location"]')).toHaveCount(1);
});

test('F10 latest click wins and wheel cancels the running animation', async ({ extensionContext, extensionPage: page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    const expected = await loadScenario(extensionContext, page, 'long-response-l01');
    const sidebar = await open(page);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    const first = sidebar.getByRole('button', { name: expected.cold.firstHeading!, exact: true });
    // Choose a reachable interior heading; the sampled virtualization heights
    // can leave the final heading outside the replay's reverse-scroll range.
    const targetTitle = await page.locator('[data-markdown-text-style] h1').nth(8).innerText();
    const last = sidebar.getByRole('button', { name: targetTitle, exact: true });
    await first.click();
    await last.click();
    await expect.poll(() => page.getByRole('heading', { name: targetTitle, exact: true }).evaluate(node => {
        const view = document.querySelector('.thread-scroll-container')!.getBoundingClientRect();
        return Math.abs(node.getBoundingClientRect().top - view.top - 24);
    })).toBeLessThan(2);
    await first.click();
    await page.locator('.thread-scroll-container').hover();
    await page.mouse.wheel(0, 250);
    await page.waitForTimeout(100);
    const interrupted = await page.locator('.thread-scroll-container').evaluate(el => el.scrollTop);
    await page.waitForTimeout(750); // Past the animation duration: no late frame may take control.
    expect(await page.locator('.thread-scroll-container').evaluate(el => el.scrollTop)).toBe(interrupted);
});

test('F15 cancellation restores reading position and export can be retried', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'long-response-l01');
    const initial = await page.locator('.thread-scroll-container').evaluate(el => el.scrollTop);
    const sidebar = await open(page);
    await sidebar.getByRole('button', { name: 'Stop refreshing history' }).click();
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect.poll(() => page.locator('.thread-scroll-container').evaluate(el => el.scrollTop)).toBe(initial);
    await sidebar.locator('[data-action="export-format"]').click({ button: 'right' });
    await page.getByRole('button', { name: /^JSON/ }).click();
    let downloads = 0;
    page.on('download', () => downloads++);
    await page.getByRole('button', { name: 'Allow scrolling' }).click();
    await sidebar.getByRole('button', { name: 'Stop refreshing history' }).click();
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    expect(downloads).toBe(0);
    const download = page.waitForEvent('download');
    await sidebar.locator('[data-action="export-format"]').click();
    const data = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    expect(data.turns).toHaveLength(5);
    expect(data.coverage.complete).toBeNull();
    expect(data.coverage.scanStatus).toBe('finished');
    await expect(sidebar.getByRole('button', { name: 'Stop refreshing history' })).toHaveCount(0);
    await expect.poll(() => page.locator('.thread-scroll-container').evaluate(el => el.scrollTop)).toBe(initial);
});

test('F15 empty content hydrates after scrolling and refreshes shared export data [synthetic transition]', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.evaluate(() => {
        const scroller = document.querySelector('.thread-scroll-container')!;
        const content = document.querySelector<HTMLElement>('[data-markdown-text-style]')!;
        const original = content.innerHTML;
        content.innerHTML = '<h2></h2>';
        // Preserve space while the real captured body is temporarily unmounted.
        content.style.minHeight = '2000px';
        scroller.addEventListener('scroll', () => setTimeout(() => { content.innerHTML = original; }, 100), { once: true });
    });
    const sidebar = await open(page);
    await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    const download = page.waitForEvent('download');
    await sidebar.locator('[data-action="export-format"]').click({ button: 'right' });
    await page.getByRole('button', { name: /^JSON/ }).click();
    await page.getByRole('button', { name: 'Allow scrolling' }).click();
    const data = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    expect(data.turns[0].response).toContain('## Orbit Alpha');
});

test('F15 continued discovery reaches a bounded timeout and clears busy [synthetic history loading]', async ({ extensionContext, extensionPage: page }) => {
    await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://chatgpt.com' });
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.evaluate(() => {
        const turn = document.querySelector('[data-turn-key]')!;
        let sequence = 0;
        // Keep discovering messages until teardown so natural settling cannot pass.
        setInterval(() => turn.setAttribute('data-turn-key', `older-${++sequence}`), 200);
    });
    const sidebar = await open(page);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible({ timeout: 20000 });
    await expect(sidebar.getByRole('button', { name: 'Stop refreshing history' })).toHaveCount(0);
    await expect(sidebar.getByRole('status')).toContainText('messages discovered');
    await sidebar.locator('[data-action="copy-format"]').click({ button: 'right' });
    await page.getByRole('button', { name: /^JSON/ }).click();
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toMatch(/"scanStatus"\s*:\s*"partial"/);
});

test('F15 settled discovery shows a count and refresh action', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const sidebar = await open(page);
    const status = sidebar.getByRole('status');
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect(status).toContainText('4 messages discovered');
    await sidebar.getByRole('button', { name: 'Refresh history' }).click();
    await expect(status).toContainText('Refreshing…');
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect(status).toContainText('4 messages discovered');

    const download = page.waitForEvent('download');
    await sidebar.locator('[data-action="export-format"]').click({ button: 'right' });
    await page.getByRole('button', { name: /^JSON/ }).click();
    await page.getByRole('button', { name: 'Allow scrolling' }).click();
    const data = JSON.parse(await readFile(await (await download).path(), 'utf8'));
    expect(data.coverage).toMatchObject({ complete: null, scanStatus: 'finished' });
    expect(data.coverage.description).toContain('Full history not verified');
});

test('F15 missing content hydrates on refresh [synthetic placeholder]', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    const original = await page.locator('[data-markdown-text-style]').first().evaluate(content => {
        const html = content.innerHTML;
        // A previously unseen unit has no cached text that could fill this shell.
        content.closest('[data-content-search-unit-key]')!.setAttribute('data-content-search-unit-key', 'unloaded:assistant');
        content.innerHTML = '<h2></h2>';
        return html;
    });
    const sidebar = await open(page);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect(sidebar.getByRole('status')).toContainText('4 messages discovered');
    await page.locator('[data-markdown-text-style]').first().evaluate((content, html) => { content.innerHTML = html; }, original);
    await sidebar.getByRole('button', { name: 'Refresh history' }).click();
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await expect(sidebar.getByRole('status')).toContainText('4 messages discovered');
    await expect(sidebar.getByRole('button', { name: 'Orbit Alpha', exact: true })).toBeVisible();
});
