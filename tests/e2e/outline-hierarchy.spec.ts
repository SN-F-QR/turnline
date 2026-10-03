import { readFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { test, expect } from './extension.fixture';
import { hierarchyProviders, hierarchyScenarios, hierarchyTitle, loadOutlineHierarchy } from '../helpers/outlineHierarchy';

async function openOutline(page: Page) {
    await page.getByRole('button', { name: 'Toggle outline' }).click();
    const sidebar = page.getByRole('complementary', { name: 'Turnline outline' });
    await expect(sidebar.locator('[data-block-key]')).toHaveCount(hierarchyScenarios.length);
    if (await sidebar.getByRole('button', { name: 'Refresh history' }).count()) {
        await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    }
    return sidebar;
}

async function setDepth(sidebar: Locator, depth: number) {
    await sidebar.getByRole('button', { name: 'Outline settings' }).click();
    await sidebar.getByLabel('Outline depth', { exact: true }).selectOption(String(depth));
    await sidebar.getByRole('button', { name: 'Back to outline' }).click();
    await expect(sidebar.getByRole('button', { name: 'Outline settings' })).toBeFocused();
}

const displayedDepths = (headings: Locator) => headings.evaluateAll(nodes => nodes.map(node => Number(node.getAttribute('data-outline-level'))));

for (const provider of hierarchyProviders) {
    test(`${provider.name} response hierarchy uses consistent depths and indentation across HTML levels`, async ({ extensionContext, extensionPage: page }) => {
        await loadOutlineHierarchy(extensionContext, page, provider);
        const sidebar = await openOutline(page);
        const shortcuts = sidebar.getByRole('group', { name: 'Outline depth shortcuts' });
        await expect(shortcuts.getByRole('button')).toHaveText(['H1', 'H2', 'H3', 'All']);
        await expect(shortcuts).toHaveAccessibleDescription('Showing up to 4 heading levels per response.');
        await expect(shortcuts.getByRole('button', { pressed: true })).toHaveCount(0);
        await sidebar.getByRole('button', { name: 'Outline settings' }).click();
        const setting = sidebar.getByLabel('Outline depth', { exact: true });
        await expect(setting).toHaveValue('4');
        await expect(setting.locator('option')).toHaveText(['1 level', '2 levels', '3 levels', '4 levels', '5 levels', 'All levels']);
        await expect(setting).toHaveAccessibleDescription('Controls how many heading levels appear in each response.');
        await expect(sidebar.getByRole('button', { name: 'About outline depth' })).toHaveCSS('cursor', 'default');
        await setting.selectOption('6');
        await sidebar.getByRole('button', { name: 'Back to outline' }).click();
        await expect(shortcuts.getByRole('button', { name: 'Show all heading levels' })).toHaveAttribute('aria-pressed', 'true');

        const paddingByDepth = ['38px', '50px', '62px', '74px', '86px', '98px'];
        for (const [index, scenario] of hierarchyScenarios.entries()) {
            const headings = sidebar.locator('[data-block-key]').nth(index).locator('[data-outline-level]');
            await expect(headings).toHaveText(scenario.levels.map((_, i) => hierarchyTitle(scenario.id, i)));
            expect(await displayedDepths(headings)).toEqual(scenario.depths);
            expect(await headings.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).paddingLeft))).toEqual(scenario.depths.map(depth => paddingByDepth[depth - 1]));
            expect(await page.locator(provider.response).nth(index).locator(':is(h1,h2,h3,h4,h5,h6)').evaluateAll(nodes => nodes.map(node => Number(node.tagName.slice(1))))).toEqual(scenario.levels);
        }

        for (const depth of [1, 2, 3, 6]) {
            const button = shortcuts.getByRole('button', { name: depth === 6 ? 'Show all heading levels' : `Show up to ${depth} heading ${depth === 1 ? 'level' : 'levels'}`, exact: true });
            if (depth === 2) {
                await shortcuts.getByRole('button', { name: 'Show up to 1 heading level', exact: true }).focus();
                await page.keyboard.press('Tab');
                await expect(button).toBeFocused();
                await page.keyboard.press('Enter');
            } else {
                await button.click();
            }
            await expect(button).toHaveAttribute('aria-pressed', 'true');
            await expect(shortcuts.getByRole('button', { pressed: true })).toHaveCount(1);
            await expect(button).toBeFocused();
            for (const [index, scenario] of hierarchyScenarios.entries()) {
                const headings = sidebar.locator('[data-block-key]').nth(index).locator('[data-outline-level]');
                await expect(headings).toHaveText(scenario.depths.flatMap((value, i) => value <= depth ? [hierarchyTitle(scenario.id, i)] : []));
                expect(await displayedDepths(headings)).toEqual(scenario.depths.filter(value => value <= depth));
            }
        }
    });

    test(`${provider.name} skipped-level child keeps its depth during search, keyboard navigation and reading`, async ({ extensionContext, extensionPage: page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await loadOutlineHierarchy(extensionContext, page, provider);
        const sidebar = await openOutline(page);
        const filter = sidebar.getByPlaceholder('Filter…');
        const leafTitle = hierarchyTitle('skips-h3', 2);
        await filter.fill(leafTitle);
        const leaf = sidebar.getByRole('button', { name: leafTitle, exact: true });
        await expect(leaf).toHaveAttribute('data-outline-level', '3');
        await expect(leaf).toHaveCSS('padding-left', '62px');
        await sidebar.getByRole('button', { name: 'Collapse answer outline' }).focus();
        await page.keyboard.press('Tab');
        await expect(sidebar.locator('.scroll-pro-item-title')).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(leaf).toBeFocused();
        await page.keyboard.press('Enter');
        const hostLeaf = page.locator(provider.response).nth(2).locator('h5');
        await expect.poll(() => hostLeaf.evaluate((node, selector) => {
            const scroller = document.querySelector(selector)!;
            return Math.abs(node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24);
        }, provider.scroller)).toBeLessThan(2);
        await expect(leaf).toHaveAttribute('aria-current', 'location');
        await leaf.click();
        await expect(leaf).toBeFocused();

        await filter.clear();
        await setDepth(sidebar, 1);
        await filter.focus();
        const position = await hostLeaf.evaluate((node, selector) => {
            const scroller = document.querySelector(selector)!;
            scroller.scrollTop += node.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24;
            scroller.dispatchEvent(new Event('scroll'));
            return scroller.scrollTop;
        }, provider.scroller);
        const active = sidebar.locator('[aria-current="location"]');
        await expect(active).toHaveText(hierarchyTitle('skips-h3', 0));
        await expect(filter).toBeFocused();
        expect(await page.locator(provider.scroller).evaluate(node => node.scrollTop)).toBe(position);
        await filter.fill(leafTitle);
        await expect(sidebar.locator('[data-block-key]')).toHaveCount(0);
    });

    test(`${provider.name} streamed headings and replacement tags recompute only their response hierarchy`, async ({ extensionContext, extensionPage: page }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await loadOutlineHierarchy(extensionContext, page, provider);
        const sidebar = await openOutline(page);
        const headings = sidebar.locator('[data-block-key]').first().locator('[data-outline-level]');
        const response = page.locator(provider.response).first();
        await response.evaluate(node => {
            node.innerHTML = '<h2>Stream root</h2><p style="height:180px">Root body</p><h4>Stream child</h4><p style="height:180px">Child body</p>';
        });
        await expect(headings).toHaveText(['Stream root', 'Stream child']);
        expect(await displayedDepths(headings)).toEqual([1, 2]);
        await response.evaluate(node => {
            node.insertAdjacentHTML('beforeend', '<h6>Stream detail</h6><p style="height:180px">Detail body</p>');
        });
        await expect(headings).toHaveText(['Stream root', 'Stream child', 'Stream detail']);
        expect(await displayedDepths(headings)).toEqual([1, 2, 3]);
        await response.locator('h4').evaluate(node => {
            const replacement = document.createElement('h2');
            replacement.textContent = node.textContent;
            node.replaceWith(replacement);
        });
        await expect.poll(() => displayedDepths(headings)).toEqual([1, 1, 2]);
        await response.evaluate(node => node.replaceWith(node.cloneNode(true)));
        await sidebar.getByRole('button', { name: 'Stream detail', exact: true }).click();
        await expect.poll(() => response.locator('h6').evaluate((node, selector) => {
            return Math.abs(node.getBoundingClientRect().top - document.querySelector(selector)!.getBoundingClientRect().top - 24);
        }, provider.scroller)).toBeLessThan(2);
        expect(await displayedDepths(headings)).toEqual([1, 1, 2]);
        expect(await displayedDepths(sidebar.locator('[data-block-key]').nth(1).locator('[data-outline-level]'))).toEqual([1, 2, 3]);
        expect(await response.locator(':is(h1,h2,h3,h4,h5,h6)').evaluateAll(nodes => nodes.map(node => node.tagName))).toEqual(['H2', 'H2', 'H6']);
    });

    test(`${provider.name} copy and export preserve raw Markdown and hidden heading content`, async ({ extensionContext, extensionPage: page }) => {
        await extensionContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(provider.url).origin });
        await loadOutlineHierarchy(extensionContext, page, provider);
        const sidebar = await openOutline(page);
        await setDepth(sidebar, 1);
        const assertComplete = (data: { turns: { headings: string[]; response: string }[] }) => {
            expect(data.turns).toHaveLength(hierarchyScenarios.length);
            for (const [index, scenario] of hierarchyScenarios.entries()) {
                expect(data.turns[index].headings).toEqual(scenario.levels.map((_, i) => hierarchyTitle(scenario.id, i)));
                scenario.levels.forEach((level, i) => expect(data.turns[index].response).toContain(`${'#'.repeat(level)} ${hierarchyTitle(scenario.id, i)}`));
            }
        };
        await sidebar.locator('[data-action="copy-format"]').click({ button: 'right' });
        await page.getByRole('button', { name: /^JSON/ }).click();
        await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain('starts-h5 section 2');
        assertComplete(JSON.parse(await page.evaluate(() => navigator.clipboard.readText())));

        await sidebar.locator('[data-action="export-format"]').click({ button: 'right' });
        const download = page.waitForEvent('download');
        await page.getByRole('button', { name: /^JSON/ }).click();
        if (provider.name === 'chatgpt') await page.getByRole('button', { name: 'Allow scrolling' }).click();
        assertComplete(JSON.parse(await readFile(await (await download).path(), 'utf8')));
        await expect(sidebar.locator('[data-outline-level="2"]')).toHaveCount(0);
    });
}

test('ChatGPT cached response depths survive whole-turn eviction and remount with fresh navigation targets', async ({ extensionContext, extensionPage: page }) => {
    const provider = hierarchyProviders[0];
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await loadOutlineHierarchy(extensionContext, page, provider);
    const sidebar = await openOutline(page);
    await expect(sidebar.getByRole('button', { name: 'Refresh history' })).toBeVisible();
    const headings = sidebar.locator('[data-block-key]').nth(2).locator('[data-outline-level]');
    await expect(headings).toHaveText(['skips-h3 section 1', 'skips-h3 section 2', 'skips-h3 section 3']);
    expect(await displayedDepths(headings)).toEqual([1, 2, 3]);

    const html = await page.locator('[data-turn-key="fixture-skips-h3"]').evaluate(root => {
        const html = root.outerHTML;
        const placeholder = document.createElement('div');
        placeholder.dataset.headingEviction = 'fixture';
        placeholder.style.height = `${root.getBoundingClientRect().height}px`;
        root.replaceWith(placeholder);
        return html;
    });
    // A changed live heading proves the provider has reparsed the smaller DOM
    // window before checking the evicted response's retained outline.
    await page.locator(provider.response).first().locator('h1').evaluate(node => { node.textContent = 'Eviction parse sentinel'; });
    await expect(sidebar.getByRole('button', { name: 'Eviction parse sentinel', exact: true })).toBeVisible();
    await expect(page.locator('[data-turn-key="fixture-skips-h3"]')).toHaveCount(0);
    expect(await displayedDepths(headings)).toEqual([1, 2, 3]);
    await setDepth(sidebar, 1);
    await expect(headings).toHaveText(['skips-h3 section 1']);
    await setDepth(sidebar, 3);
    expect(await displayedDepths(headings)).toEqual([1, 2, 3]);

    await page.locator('[data-heading-eviction="fixture"]').evaluate((placeholder, html) => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = html;
        placeholder.replaceWith(wrapper.firstElementChild!);
    }, html);
    const leaf = sidebar.getByRole('button', { name: 'skips-h3 section 3', exact: true });
    await leaf.click();
    await expect.poll(() => page.locator('[data-turn-key="fixture-skips-h3"] h5').evaluate(node => {
        return Math.abs(node.getBoundingClientRect().top - document.querySelector('.thread-scroll-container')!.getBoundingClientRect().top - 24);
    })).toBeLessThan(2);
    expect(await displayedDepths(headings)).toEqual([1, 2, 3]);
    await expect(leaf).toHaveAttribute('aria-current', 'location');
});
