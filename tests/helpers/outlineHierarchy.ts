import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { loadScenario } from './scenario';

type HierarchyScenario = { id: string; levels: number[]; depths: number[] };
export const hierarchyScenarios = JSON.parse(readFileSync(resolve('tests/fixtures/outline-hierarchy.json'), 'utf8')) as HierarchyScenario[];
export const hierarchyTitle = (id: string, index: number) => `${id} section ${index + 1}`;

export const hierarchyProviders = [
    { name: 'chatgpt', url: 'https://chatgpt.com/c/fixture-current-turn-unit', scroller: '.thread-scroll-container', response: '[data-markdown-text-style]' },
    { name: 'claude', url: 'https://claude.ai/chat/fixture-hierarchy', scroller: 'main > .overflow-y-auto', response: '[data-testid="assistant-response"]' },
    { name: 'gemini', url: 'https://gemini.google.com/app/fixture-hierarchy', scroller: '.mat-sidenav-content', response: 'message-content .markdown' },
] as const;

export async function loadOutlineHierarchy(context: BrowserContext, page: Page, provider: typeof hierarchyProviders[number]) {
    if (provider.name === 'chatgpt') {
        await loadScenario(context, page, 'current-turn-unit');
    } else {
        const html = await readFile(resolve('tests/fixtures', provider.name, 'basic.html'), 'utf8');
        await context.route('**/*', async route => {
            if (route.request().url() === provider.url) await route.fulfill({ contentType: 'text/html', body: html });
            else if (/^https?:/.test(route.request().url())) await route.abort();
            else await route.continue();
        });
        await page.goto(provider.url);
    }

    // Model different heading structures in known offline response wrappers.
    // Cloning those wrappers keeps this fixture independent of production code.
    await page.evaluate(({ provider, scenarios }) => {
        const scroller = document.querySelector<HTMLElement>(provider.scroller)!;
        scroller.style.flexDirection = 'column';
        scroller.style.height = '600px';
        const populate = (response: Element, scenario: HierarchyScenario) => {
            response.replaceChildren();
            scenario.levels.forEach((level, index) => {
                const heading = document.createElement(`h${level}`);
                heading.textContent = `${scenario.id} section ${index + 1}`;
                const body = document.createElement('p');
                body.textContent = `Invented body for ${scenario.id}, section ${index + 1}.`;
                body.style.minHeight = '180px';
                response.append(heading, body);
            });
        };

        if (provider.name === 'chatgpt') {
            const roots = Array.from(scroller.querySelectorAll('[data-turn-key]'));
            const template = roots[0].cloneNode(true) as HTMLElement;
            const parent = roots[0].parentElement!;
            roots.forEach(root => root.remove());
            for (const scenario of scenarios) {
                const root = template.cloneNode(true) as HTMLElement;
                root.setAttribute('data-turn-key', `fixture-${scenario.id}`);
                root.querySelector('[data-content-search-turn-key]')!.setAttribute('data-content-search-turn-key', `fixture-${scenario.id}`);
                root.querySelectorAll('[data-content-search-unit-key]').forEach(unit => {
                    const role = unit.getAttribute('data-content-search-unit-key')!.endsWith(':user') ? 'user' : 'assistant';
                    unit.setAttribute('data-content-search-unit-key', `fixture-${scenario.id}:0:${role}`);
                });
                root.querySelector('[data-user-message-bubble] .whitespace-pre-wrap')!.textContent = `Hierarchy ${scenario.id}`;
                populate(root.querySelector(provider.response)!, scenario);
                parent.appendChild(root);
            }
        } else if (provider.name === 'claude') {
            const userTemplate = scroller.querySelector('[data-testid="conversation-turn"]')!.cloneNode(true) as HTMLElement;
            const answerTemplate = scroller.querySelectorAll('[data-testid="conversation-turn"]')[1].cloneNode(true) as HTMLElement;
            scroller.replaceChildren();
            for (const scenario of scenarios) {
                const user = userTemplate.cloneNode(true) as HTMLElement;
                const answer = answerTemplate.cloneNode(true) as HTMLElement;
                user.setAttribute('data-turn-id', `fixture-${scenario.id}-user`);
                answer.setAttribute('data-turn-id', `fixture-${scenario.id}-assistant`);
                user.querySelector('[data-testid="user-message"]')!.textContent = `Hierarchy ${scenario.id}`;
                populate(answer.querySelector(provider.response)!, scenario);
                scroller.append(user, answer);
            }
        } else {
            const userTemplate = scroller.querySelector('user-query')!.cloneNode(true);
            const answerTemplate = scroller.querySelector('model-response')!.cloneNode(true);
            scroller.replaceChildren();
            for (const scenario of scenarios) {
                const user = userTemplate.cloneNode(true) as HTMLElement;
                const answer = answerTemplate.cloneNode(true) as HTMLElement;
                user.querySelector('.query-text')!.textContent = `Hierarchy ${scenario.id}`;
                populate(answer.querySelector(provider.response)!, scenario);
                scroller.append(user, answer);
            }
        }
        scroller.scrollTop = 0;
    }, { provider, scenarios: hierarchyScenarios });
}
