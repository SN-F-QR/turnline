import { inferChatGptOutlineLevels } from './chatgptHeadingLevels';
import type { Provider, Turn } from '../types';
import { CHATGPT_TURN_SELECTOR, chatgptContentElement, chatgptMarkdown } from './chatgptContent';

const nodeIds = new WeakMap<HTMLElement, number>();
let nextNodeId = 0;
const fallbackId = (node: HTMLElement) => {
    if (!nodeIds.has(node)) nodeIds.set(node, ++nextNodeId);
    return `node-${nodeIds.get(node)}`;
};

const headingList = (content: HTMLElement) => {
    const headings = Array.from(content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).map((heading, index) => {
        const text = (heading.innerText || heading.textContent || '').trim();
        return { innerText: text || `Section ${index + 1}`, element: heading, tagName: heading.tagName, isPlaceholder: !text };
    });
    const levels = inferChatGptOutlineLevels(headings.map(h => ({ text: h.innerText, tagName: h.tagName })));
    return headings.map((heading, index) => ({ ...heading, outlineLevel: levels[index] }));
};

const makeTurn = (root: HTMLElement, content: HTMLElement, role: Turn['role'], id: string, turnId?: string): Turn => ({
    id,
    turnId,
    role,
    element: root,
    contentElement: content,
    text: chatgptMarkdown(content),
    headings: role === 'assistant' ? headingList(content) : [],
    contextLabel: role === 'assistant' ? root.querySelector<HTMLElement>(':scope > button span.truncate, [data-conversation-screenshot-content] > div > button > span.truncate')?.innerText?.trim() : undefined,
    timeLabel: role === 'assistant' ? root.closest<HTMLElement>('[data-turn-key]')?.querySelector<HTMLElement>('[data-content-search-turn-key] > [role="separator"][aria-label]')?.getAttribute('aria-label')?.trim()
        || (root.previousElementSibling?.matches('[role="separator"][aria-label]') ? root.previousElementSibling.getAttribute('aria-label')?.trim() : undefined) : undefined,
});

export const chatgpt: Provider = {
    name: 'chatgpt',
    isMatch: () => window.location.hostname.includes('chatgpt') || window.location.hostname.includes('openai'),
    scrollContainerSelector: '.thread-scroll-container, main, main div[class*="overflow-y-auto"]',
    getTurns: (container: HTMLElement): Turn[] => {
        const turns: Turn[] = [];
        const seenIds = new Set<string>();
        const candidates = Array.from(container.querySelectorAll<HTMLElement>(CHATGPT_TURN_SELECTOR));
        const validModern = candidates.filter(root => root.hasAttribute('data-turn-key') &&
            Array.from(root.querySelectorAll<HTMLElement>('[data-content-search-unit-key]')).some(unit => {
                const key = unit.getAttribute('data-content-search-unit-key') || '';
                const role = key.endsWith(':user') ? 'user' : key.endsWith(':assistant') ? 'assistant' : null;
                return role && chatgptContentElement(unit, role);
            }));
        const parsedRoots = new Set<HTMLElement>();
        for (const root of candidates) {
            if (Array.from(parsedRoots).some(parsed => parsed.contains(root))) continue;
            if (!root.hasAttribute('data-turn-key') && validModern.some(modern => modern.contains(root) || root.contains(modern))) continue;
            if (root.hasAttribute('data-turn-key')) {
                const turnKey = root.getAttribute('data-turn-key')!;
                let found = false;
                for (const unit of root.querySelectorAll<HTMLElement>('[data-content-search-unit-key]')) {
                    const unitKey = unit.getAttribute('data-content-search-unit-key')!;
                    const role = unitKey.endsWith(':user') ? 'user' : unitKey.endsWith(':assistant') ? 'assistant' : null;
                    if (!role) continue;
                    const content = chatgptContentElement(unit, role);
                    if (!content) continue;
                    const id = `gpt-${turnKey}:${unitKey}`;
                    if (seenIds.has(id)) continue;
                    seenIds.add(id);
                    turns.push(makeTurn(unit, content, role, id, `${turnKey}:${unitKey}`));
                    found = true;
                }
                if (found) {
                    parsedRoots.add(root);
                    continue;
                }
                continue;
            }
            const roleAttr = root.getAttribute('data-turn');
            const role: Turn['role'] = roleAttr === 'user' || (!!root.querySelector('[data-message-author-role="user"]') && roleAttr !== 'assistant') ? 'user' : 'assistant';
            const content = chatgptContentElement(root, role);
            if (!content) continue;
            const stable = root.getAttribute('data-turn-id') || root.querySelector('[data-message-id]')?.getAttribute('data-message-id') || root.getAttribute('data-turn-key');
            const id = `gpt-${stable || fallbackId(root)}-${role}`;
            if (seenIds.has(id)) continue;
            seenIds.add(id);
            turns.push(makeTurn(root, content, role, id, stable || undefined));
            parsedRoots.add(root);
        }
        return turns;
    },
    getChatTitle: () => {
        return document.title || null;
    }
};
