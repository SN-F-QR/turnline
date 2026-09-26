import { serializeNodeToMarkdown } from '../lib/markdownUtil';

const CONTENT_SELECTORS = {
    user: ['[data-user-message-bubble] .whitespace-pre-wrap', '[data-user-message-bubble]', '[data-message-author-role="user"] .whitespace-pre-wrap', '[data-message-author-role="user"]'],
    assistant: ['[data-markdown-text-style]', '[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
};

export const CHATGPT_TURN_SELECTOR = '[data-turn-key], section[data-turn], section[data-testid^="conversation-turn"], article[data-turn], article[data-testid^="conversation-turn"]';

export function chatgptContentElement(root: HTMLElement, role: 'user' | 'assistant'): HTMLElement | null {
    for (const selector of CONTENT_SELECTORS[role]) {
        if (root.matches(selector)) return root;
        const content = root.querySelector<HTMLElement>(selector);
        if (content) return content;
    }
    return null;
}

export function chatgptMarkdown(root: HTMLElement | null): string {
    if (!root) return '';
    return (serializeNodeToMarkdown(root) || root.innerText || root.textContent || '').trim();
}
