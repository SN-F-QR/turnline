import { inferChatGptOutlineLevels } from './chatgptHeadingLevels';
import type { Provider, Turn } from '../types';
import { CHATGPT_TURN_SELECTOR, chatgptContentElement, chatgptMarkdown } from './chatgptContent';

export const isChatGptChatPage = (path: string): boolean => {
    // Project landing pages have no transcript; project and custom GPT chats do.
    return /^\/(c|g)\//.test(path) && !/^\/g\/[^/]+\/project(?:\/|$)/.test(path);
};

const nodeIds = new WeakMap<HTMLElement, number>();
const localConversationIds = new Map<string, string>();
let nextNodeId = 0;
const fallbackId = (node: HTMLElement) => {
    if (!nodeIds.has(node)) nodeIds.set(node, ++nextNodeId);
    return `node-${nodeIds.get(node)}`;
};

const headingList = (content: HTMLElement) => {
    // DIL cards use heading tags for visual emphasis (product names, stats, etc.).
    // Keep the renderer's document headings, but omit headings inside its boxes.
    // Logged-in responses do not have the share page's widget-copy-target wrapper.
    const headings = Array.from(content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6'))
        .filter(heading => !heading.closest('[data-d-component="box"]'))
        .map((heading, index) => {
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
        const routeId = window.location.pathname.match(/\/c\/([^/]+)/)?.[1];
        const localRoute = /^local-chatgpt(?::|%3A)/i.test(routeId || '');
        const conversationId = routeId?.replace(/^local-chatgpt(?::|%3A)/i, '');
        const candidates = Array.from(container.querySelectorAll<HTMLElement>(CHATGPT_TURN_SELECTOR)).filter(root => {
            // ChatGPT keeps inactive workspaces mounted, and commits the new URL
            // before hiding the old transcript. Neither belongs in the new history.
            if (!root.getClientRects().length) return false;
            const transcript = root.closest('[data-chatgpt-conversation-selection-target]') || root;
            const marker = root.querySelector('[data-chatgpt-selection-conversation-id]')
                || transcript.querySelector('[data-chatgpt-selection-conversation-id]');
            const id = marker?.getAttribute('data-chatgpt-selection-conversation-id');
            if (!conversationId || !id) return true;
            if (!id.startsWith('local-chatgpt:')) return id === conversationId;
            if (localRoute) return id.slice('local-chatgpt:'.length) === conversationId;
            // A new chat keeps its local selection ID after the URL gets a
            // permanent ID. Remember that assignment across cached workspaces
            // so subsequent navigation cannot associate it with a different chat.
            if (!localConversationIds.has(id)) localConversationIds.set(id, conversationId);
            return localConversationIds.get(id) === conversationId;
        });
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
                    // The prefix can change from fallback-turn to a resolved search key
                    // while the same conversation turn stays mounted.
                    const unitSlot = unitKey.match(/:\d+:(?:user|assistant)$/)?.[0] || `:${unitKey}`;
                    const id = `gpt-${turnKey}${unitSlot}`;
                    if (seenIds.has(id)) continue;
                    seenIds.add(id);
                    // Optimistic submissions use a temporary root key until the server
                    // assigns the real turn. Show them live, but do not retain them
                    // as historical messages once their DOM node/key disappears.
                    const turnId = turnKey === 'pending-chatgpt-submit' ? undefined : `${turnKey}${unitSlot}`;
                    turns.push({ ...makeTurn(unit, content, role, id, turnId), sourceTurnKey: turnKey });
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
