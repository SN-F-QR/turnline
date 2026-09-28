import type { Heading, Provider, Turn } from '../types';
import { serializeNodeToMarkdown } from '../lib/markdownUtil';

export const gemini: Provider = {
    name: 'gemini',
    isMatch: () => {
        const host = window.location.hostname.toLowerCase();
        return host === 'gemini.google.com' || host.endsWith('.gemini.google.com');
    },
    scrollContainerSelector: 'infinite-scroller.chat-history, .mat-sidenav-content',
    getTurns: (container: HTMLElement): Turn[] => {
        const turns: Turn[] = [];
        const items = Array.from(container.querySelectorAll('user-query, model-response'));
        items.forEach((item, index) => {
            const isUser = item.tagName.toLowerCase() === 'user-query';
            let text = '';
            let headings: Heading[] = [];

            if (isUser) {
                // User query text is in div.query-text, but it contains a
                // screen-reader-only "You said" span (.cdk-visually-hidden).
                // Clone the node and strip hidden elements before serializing.
                const queryContainer = item.querySelector('div.query-text');
                if (queryContainer) {
                    const clone = queryContainer.cloneNode(true) as HTMLElement;
                    clone.querySelectorAll('.cdk-visually-hidden').forEach(el => el.remove());
                    text = serializeNodeToMarkdown(clone);
                }
                if (!text) {
                    const queryLines = Array.from(item.querySelectorAll('div.query-text p.query-text-line'));
                    text = queryLines
                        .map(p => (p as HTMLElement).textContent?.trim() || '')
                        .filter(line => line.length > 0)
                        .join('\n');
                }
            } else {
                const markdown = item.querySelector('message-content .markdown');
                if (markdown) {
                    text = serializeNodeToMarkdown(markdown) || (markdown as HTMLElement).innerText || '';
                    // Offscreen turns use content-visibility:auto: innerText can
                    // be empty even though their heading text remains in the DOM.
                    headings = Array.from(markdown.querySelectorAll<HTMLElement>('h1, h2, h3, h4')).map(h => ({
                        innerText: h.innerText.trim() || h.textContent?.trim() || '',
                        element: h,
                        tagName: h.tagName
                    })).filter(h => h.innerText.length > 0);
                }
            }

            turns.push({
                id: `gemini-${index}`,
                turnId: `gemini-${index}`,
                role: isUser ? 'user' : 'assistant',
                element: item as HTMLElement,
                text: text,
                headings: headings
            });
        });
        return turns;
    },
    getChatTitle: () => {
        const titleEl = document.querySelector('[data-test-id="conversation-title"]')
            || document.querySelector('.conversation-title');
        return titleEl?.textContent?.trim() || null;
    }
};
