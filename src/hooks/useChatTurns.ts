import { useCallback, useEffect, useRef, useState } from 'react';
import type { Provider, Turn } from '../types';
import { inferChatGptOutlineLevels } from '../providers/chatgptHeadingLevels';
import { chatgpt } from '../providers/chatgpt';
import { claude } from '../providers/claude';
import { gemini } from '../providers/gemini';
import { CHATGPT_TURN_SELECTOR } from '../providers/chatgptContent';
import { mergeDiscoveredTurns } from '../lib/discoveredTurns';
import { discoverChatHistory, type HistoryResult, type HistorySnapshot } from '../lib/chatHistory';
import { cancelScroll, findScrollable, scrollToElement } from '../lib/scroll';

const PROVIDERS: Provider[] = [chatgpt, claude, gemini];
const TURN_SELECTORS: Record<Provider['name'], string> = {
    chatgpt: CHATGPT_TURN_SELECTOR,
    claude: '[data-testid="conversation-turn"], [data-testid="user-message"], [data-testid="assistant-response"], [data-testid="assistant-message"], .font-user-message, .font-claude-response',
    gemini: 'user-query, model-response',
};

export function useChatTurns(isOpen: boolean) {
    const readRef = useRef<(direction?: 'older' | 'newer') => HistorySnapshot>(() => ({ live: [], turns: [] }));
    const retained = useRef(false);
    const controller = useRef<AbortController | null>(null);
    const running = useRef<Promise<HistoryResult> | null>(null);
    const navigation = useRef(0);
    const [history, setHistory] = useState<HistoryResult>({ turns: [], status: 'idle', reason: 'Visible messages only', complete: null });
    const cancelHistory = useCallback(() => { controller.current?.abort(); }, []);
    const discoverHistory = useCallback(() => {
        if (running.current) return running.current;
        retained.current = true;
        const abort = new AbortController();
        controller.current = abort;
        const url = location.href;
        setHistory(current => ({ ...current, status: 'scanning', reason: 'Discovering chat history…', complete: null }));
        const promise = discoverChatHistory(direction => readRef.current(direction), abort.signal).catch((): HistoryResult => ({ turns: [], status: 'failed', reason: 'History scan failed', complete: null })).then(result => {
            if (controller.current === abort && location.href === url) setHistory(result);
            return result;
        }).finally(() => {
            if (running.current === promise) running.current = null;
        });
        running.current = promise;
        return promise;
    }, []);
    const navigateToTurn = useCallback(async (id: string, headingIndex?: number) => {
        const request = ++navigation.current;
        const url = location.href;
        cancelScroll();
        controller.current?.abort();
        await running.current;
        const until = performance.now() + 2500;
        let searchScroller: HTMLElement | null = null;
        let searchRange = -1;
        let lower = 0;
        let upper = 0;
        while (request === navigation.current && location.href === url) {
            const snapshot = readRef.current();
            const turn = snapshot.live.find(item => item.id === id);
            if (turn) {
                const resolveTarget = () => {
                    if (request !== navigation.current || location.href !== url) return undefined;
                    const current = readRef.current().live.find(item => item.id === id);
                    return current && (headingIndex === undefined ? current.element : current.headings[headingIndex]?.element || current.element);
                };
                scrollToElement(resolveTarget(), resolveTarget);
                return true;
            }
            if (performance.now() > until) break;
            const wanted = snapshot.turns.findIndex(item => item.id === id);
            const firstLive = snapshot.turns.findIndex(item => item.id === snapshot.live[0]?.id);
            const lastLive = snapshot.turns.findIndex(item => item.id === snapshot.live.at(-1)?.id);
            if (wanted < 0 || firstLive < 0 || lastLive < 0) break;
            const scroller = findScrollable(snapshot.live[0]?.element || null);
            const reverse = getComputedStyle(scroller).flexDirection === 'column-reverse';
            const range = Math.max(0, scroller.scrollHeight - scroller.clientHeight);
            if (scroller !== searchScroller || searchRange === 0) {
                searchScroller = scroller;
                lower = reverse ? -range : 0;
                upper = reverse ? 0 : range;
            } else if (searchRange > 0 && range !== searchRange) {
                lower *= range / searchRange;
                upper *= range / searchRange;
            }
            searchRange = range;
            const current = scroller.scrollTop;
            if (wanted < firstLive) upper = Math.min(upper, current);
            else if (wanted > lastLive) lower = Math.max(lower, current);
            else break;
            const next = (lower + upper) / 2;
            if (Math.abs(next - current) < 1) break;
            readRef.current(wanted < firstLive ? 'older' : 'newer');
            scroller.scrollTo({ top: next, behavior: 'instant' });
            await new Promise(resolve => setTimeout(resolve, 150));
        }
        return request !== navigation.current || location.href !== url;
    }, []);
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
        let discovered: Turn[] = [];
        let snapshot: HistorySnapshot = { live: [], turns: [] };
        let dirty = true;
        let mergeDirection: 'older' | 'newer' = 'newer';
        const textCache = new Map<string, string>();
        const headingCache = new Map<string, string>();

        const parse = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            if (!currentContainer || !dirty) return snapshot;
            dirty = false;
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
                    const levels = inferChatGptOutlineLevels(turn.headings.map(h => ({ text: h.innerText, tagName: h.tagName })));
                    turn.headings.forEach((heading, index) => { heading.outlineLevel = levels[index]; });
                }
            }
            discovered = provider.name === 'chatgpt' && retained.current ? mergeDiscoveredTurns(discovered, next, mergeDirection) : next;
            setTurns(discovered);
            snapshot = { live: next, turns: discovered };
            return snapshot;
        };
        const scheduleParse = () => {
            dirty = true;
            if (!frame) frame = requestAnimationFrame(parse);
        };
        const check = () => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                controller.current?.abort('conversation-changed');
                controller.current = null;
                running.current = null;
                navigation.current++;
                cancelScroll();
                retained.current = false;
                discovered = [];
                snapshot = { live: [], turns: [] };
                dirty = true;
                mergeDirection = 'newer';
                setHistory({ turns: [], status: 'idle', reason: 'Visible messages only', complete: null });
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
                    attributeFilter: ['data-turn-key', 'data-turn-id', 'data-message-id', 'data-turn', 'data-content-search-unit-key', 'data-message-author-role', 'data-markdown-text-style', 'data-user-message-bubble', 'href', 'src', 'alt'],
                });
                scheduleParse();
            }
        };

        readRef.current = direction => {
            if (direction) mergeDirection = direction;
            if (location.href !== lastUrl || !currentContainer?.isConnected) check();
            // Reuse the parsed snapshot during polling. Flush pending mutations
            // so navigation/export can still read a just-replaced node immediately.
            if (turnObserver?.takeRecords().length) dirty = true;
            return parse();
        };
        check();
        const bodyObserver = new MutationObserver(records => {
            // Chat text is handled by turnObserver. Activity in the account
            // sidebar, composer or our own host must not reserialize the chat.
            const structureChanged = records.some(record => Array.from(record.addedNodes).some(node =>
                node instanceof HTMLElement && (node.matches(provider.scrollContainerSelector) || node.matches(selector) || node.querySelector(selector))
            ));
            if (location.href !== lastUrl || !currentContainer?.isConnected || structureChanged) check();
        });
        bodyObserver.observe(document.body, { childList: true, subtree: true });
        const timer = window.setInterval(() => {
            if (location.href !== lastUrl) check();
        }, 250);
        window.addEventListener('popstate', check);
        return () => {
            controller.current?.abort('unmounted');
            controller.current = null;
            navigation.current++;
            cancelScroll();
            bodyObserver.disconnect();
            turnObserver?.disconnect();
            window.clearInterval(timer);
            window.removeEventListener('popstate', check);
            cancelAnimationFrame(frame);
        };
    }, [provider]);

    useEffect(() => {
        const interrupt = (event: Event) => {
            navigation.current++;
            cancelScroll();
            // A real host-page interaction takes priority over automatic history
            // loading. Do not cancel clicks on our Stop/export/outline controls.
            const inOutline = event.composedPath().some(node => node instanceof HTMLElement && node.id === 'scroll-pro-root');
            if (!inOutline) controller.current?.abort('user-interrupted');
        };
        const events = ['wheel', 'touchstart', 'mousedown', 'keydown'] as const;
        events.forEach(event => window.addEventListener(event, interrupt, { capture: true, passive: true }));
        return () => events.forEach(event => window.removeEventListener(event, interrupt, true));
    }, []);

    useEffect(() => {
        if (isOpen && provider?.name === 'chatgpt' && turns.length && history.status === 'idle') void discoverHistory();
        if (!isOpen) cancelHistory();
    }, [isOpen, provider, turns.length, history.status, discoverHistory, cancelHistory]);

    return { turns, provider, container, history, discoverHistory, cancelHistory, navigateToTurn };
}
