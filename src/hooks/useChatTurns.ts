import { useEffect, useState } from 'react';
import type { Provider, Turn } from '../types';
import { chatgpt } from '../providers/chatgpt';
import { claude } from '../providers/claude';
import { gemini } from '../providers/gemini';
import { CHATGPT_TURN_SELECTOR } from '../providers/chatgptContent';

const PROVIDERS: Provider[] = [chatgpt, claude, gemini];
const TURN_SELECTORS: Record<Provider['name'], string> = {
    chatgpt: CHATGPT_TURN_SELECTOR,
    claude: '[data-testid="conversation-turn"], [data-testid="user-message"], [data-testid="assistant-response"], [data-testid="assistant-message"], .font-user-message, .font-claude-response',
    gemini: 'user-query, model-response',
};

export function useChatTurns() {
    const [turns, setTurns] = useState<Turn[]>([]);
    const [provider] = useState<Provider | null>(() => PROVIDERS.find(p => p.isMatch()) || null);
    const [container, setContainer] = useState<HTMLElement | null>(null);

    useEffect(() => {
        if (!provider) return;
        let currentContainer: HTMLElement | null = null;
        let turnObserver: MutationObserver | null = null;
        let frame = 0;
        let lastUrl = location.href;
        const selector = TURN_SELECTORS[provider.name];
        const textCache = new Map<string, string>();
        const headingCache = new Map<string, string>();

        const parse = () => {
            frame = 0;
            if (!currentContainer) return;
            const next = provider.getTurns(currentContainer);
            if (provider.name === 'chatgpt') {
                for (const turn of next) {
                    const key = `${location.href}:${turn.id}`;
                    if (turn.text.trim()) textCache.set(key, turn.text);
                    else if (turn.turnId) turn.text = textCache.get(key) || '';
                    turn.headings.forEach((heading, index) => {
                        const headingKey = `${key}:${index}`;
                        if (!heading.isPlaceholder) headingCache.set(headingKey, heading.innerText);
                        else if (turn.turnId && headingCache.has(headingKey)) {
                            heading.innerText = headingCache.get(headingKey)!;
                            heading.isPlaceholder = false;
                        }
                    });
                }
            }
            setTurns(next);
        };
        const scheduleParse = () => {
            if (!frame) frame = requestAnimationFrame(parse);
        };
        const check = () => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                textCache.clear();
                headingCache.clear();
                setTurns([]);
                turnObserver?.disconnect();
                currentContainer = null;
            }
            const candidates = Array.from(document.querySelectorAll<HTMLElement>(provider.scrollContainerSelector));
            let best: HTMLElement | null = null;
            let count = 0;
            for (const candidate of candidates) {
                const found = candidate.querySelectorAll(selector).length;
                if (found > 0 && found >= count) {
                    count = found;
                    best = candidate;
                }
            }
            const nextContainer = best || document.querySelector<HTMLElement>('main') || document.body;
            if (nextContainer !== currentContainer) {
                turnObserver?.disconnect();
                currentContainer = nextContainer;
                setContainer(nextContainer);
                turnObserver = new MutationObserver(scheduleParse);
                turnObserver.observe(nextContainer, {
                    childList: true, characterData: true, subtree: true,
                    attributes: true,
                    attributeFilter: ['data-turn-key', 'data-content-search-unit-key', 'data-message-author-role', 'data-markdown-text-style'],
                });
                scheduleParse();
            }
        };

        check();
        const bodyObserver = new MutationObserver(() => {
            check();
            scheduleParse();
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
        const timer = window.setInterval(() => {
            if (location.href !== lastUrl) check();
        }, 250);
        window.addEventListener('popstate', check);
        return () => {
            bodyObserver.disconnect();
            turnObserver?.disconnect();
            window.clearInterval(timer);
            window.removeEventListener('popstate', check);
            cancelAnimationFrame(frame);
        };
    }, [provider]);

    return { turns, provider, container };
}
