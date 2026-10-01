import { test, expect } from './extension.fixture';
import { loadScenario } from '../helpers/scenario';

test('loaded long conversation: record history scan performance [measurement only]', async ({ extensionContext, extensionPage: page }, testInfo) => {
    await loadScenario(extensionContext, page, 'long-response-l01');
    const toggle = page.getByRole('button', { name: 'Toggle outline' });
    await expect(toggle).toBeVisible();
    const session = await extensionContext.newCDPSession(page);
    await session.send('Performance.enable');
    const before = await session.send('Performance.getMetrics');
    const started = Date.now();
    await toggle.click();
    await expect(page.getByRole('complementary').getByRole('button', { name: 'Refresh history' })).toBeVisible();
    const after = await session.send('Performance.getMetrics');
    const metric = (values: typeof before, name: string) => values.metrics.find(item => item.name === name)!.value;
    const sample = {
        wallMs: Date.now() - started,
        scriptMs: (metric(after, 'ScriptDuration') - metric(before, 'ScriptDuration')) * 1000,
        taskMs: (metric(after, 'TaskDuration') - metric(before, 'TaskDuration')) * 1000,
    };
    console.log('History performance:', JSON.stringify(sample));
    await testInfo.attach('history-performance', { body: JSON.stringify(sample), contentType: 'application/json' });
});

test('F15 layout and unrelated DOM churn do not keep a loaded chat scanning [synthetic activity]', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.evaluate(() => {
        const scroller = document.querySelector<HTMLElement>('.thread-scroll-container')!;
        const spacer = document.createElement('div');
        spacer.style.flexShrink = '0';
        spacer.style.minHeight = '0';
        scroller.append(spacer);
        const unrelated = document.createElement('aside');
        document.body.append(unrelated);
        let tick = 0;
        const timer = setInterval(() => {
            spacer.style.height = `${100 + (++tick % 3) * 10}px`;
            unrelated.replaceChildren(document.createTextNode(String(tick)));
        }, 80);
        setTimeout(() => clearInterval(timer), 8000);
    });
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    await expect(page.getByRole('complementary').getByRole('button', { name: 'Refresh history' })).toBeVisible({ timeout: 3500 });
});


test('F15 streaming an existing response does not prolong history discovery [synthetic streaming]', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'current-turn-unit');
    await page.evaluate(() => {
        const content = document.querySelector('[data-markdown-text-style] p')!;
        const timer = setInterval(() => content.append(' more'), 100);
        setTimeout(() => clearInterval(timer), 8000);
    });
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.getByRole('complementary');
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible({ timeout: 3500 });
    // Normal turn observation continues after history discovery has finished.
    await sidebar.getByPlaceholder('Filter…').fill('more');
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(0);
    await page.locator('[data-markdown-text-style] h3').first().evaluate(heading => {
        heading.firstChild!.textContent += ' more';
    });
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(1);
    await expect(sidebar.getByRole('button', { name: 'Orbit Beta more', exact: true })).toBeVisible();
});

test('F15 manual scrolling stops discovery without pulling the reader back', async ({ extensionContext, extensionPage: page }) => {
    await loadScenario(extensionContext, page, 'long-response-l01');
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const status = page.getByRole('complementary').getByRole('status');
    await expect(status).toContainText('Refreshing');
    await page.locator('.thread-scroll-container').hover();
    await page.mouse.wheel(0, 400);
    await expect(page.getByRole('complementary').getByRole('button', { name: 'Refresh history' })).toBeVisible();
    await page.waitForTimeout(100);
    const position = await page.locator('.thread-scroll-container').evaluate(el => el.scrollTop);
    await page.waitForTimeout(600); // No later probe or restoration may override user input.
    expect(await page.locator('.thread-scroll-container').evaluate(el => el.scrollTop)).toBe(position);
});
