import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { test, expect } from './extension.fixture';

for (const [provider, url] of [['claude', 'https://claude.ai/chat/fixture-basic'], ['gemini', 'https://gemini.google.com/app/fixture-basic']]) {
    test(`F12 ${provider} shared settings compatibility (synthetic fixture)`, async ({ extensionContext, extensionPage: page }) => {
        const html = await readFile(resolve('tests/fixtures', provider, 'basic.html'), 'utf8');
        await extensionContext.route('**/*', async route => {
            if (route.request().url() === url) await route.fulfill({ contentType: 'text/html', body: html });
            else if (/^https?:/.test(route.request().url())) await route.abort();
            else await route.continue();
        });
        await page.goto(url);
        await page.getByRole('button', { name: 'Toggle outline' }).click();
        const sidebar = page.getByRole('complementary');
        await expect(sidebar.locator('[data-outline-level]')).toHaveCount(3);
        await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toHaveCount(0);
        const filter = sidebar.getByPlaceholder('Filter…');
        await filter.fill('Details');
        await expect(sidebar.locator('[data-outline-level]')).toHaveText(['Details']);
        await filter.fill('Compatibility answer');
        await expect(sidebar.locator('[data-block-key]')).toHaveCount(0);
        await filter.fill('Compatibility prompt');
        await expect(sidebar.locator('[data-outline-level]')).toHaveCount(3);
        await filter.clear();
        await sidebar.getByRole('button', { name: 'Collapse all turns' }).click();
        await expect(sidebar.locator('[data-outline-level]')).toHaveCount(0);
        await sidebar.getByRole('button', { name: 'Expand all turns' }).click();
        await expect(sidebar.locator('[data-outline-level]')).toHaveCount(3);
        // ChatGPT's Chinese chapter inference must not leak into other adapters.
        await expect(sidebar.getByRole('button', { name: '一、Overview' })).toHaveAttribute('data-outline-level', '2');
        await sidebar.getByRole('button', { name: 'Outline settings' }).click();
        await sidebar.getByLabel('Heading depth').selectOption('1');
        await sidebar.getByRole('button', { name: 'Back to outline' }).click();
        await expect(sidebar.locator('[data-outline-level]')).toHaveCount(0);
        await sidebar.getByRole('button', { name: 'Outline settings' }).click();
        await sidebar.getByLabel('Heading depth').selectOption('6');
        await sidebar.getByRole('button', { name: 'Back to outline' }).click();
        await expect(sidebar.locator('[data-outline-level]')).toHaveCount(3);
        await expect(sidebar).toBeVisible();
    });
}

test('F14 unsupported domain does not inject the extension', async ({ extensionContext, extensionPage: page }) => {
    await extensionContext.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body><main>Unsupported site</main></body></html>' }));
    await page.goto('https://example.com/c/fixture-basic');
    await expect(page.locator('main')).toHaveText('Unsupported site');
    await expect(page.locator('#scroll-pro-root')).toHaveCount(0);
});

test('F14 supported www ChatGPT homepage hides outline until a conversation opens', async ({ extensionContext, extensionPage: page }) => {
    await extensionContext.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<html><body><main>Supported site</main></body></html>' }));
    await page.goto('https://www.chatgpt.com/');
    await expect(page.locator('#scroll-pro-root')).toBeAttached();
    await expect(page.getByRole('button', { name: 'Toggle outline' })).toHaveCount(0);
    await page.evaluate(() => { history.pushState({}, '', '/c/fixture-basic'); window.dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByRole('button', { name: 'Toggle outline' })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await expect(page.getByRole('complementary')).toBeVisible();
});
