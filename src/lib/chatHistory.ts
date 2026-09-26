import type { Turn } from '../types';
import { cancelScroll, findScrollable } from './scroll';

export type HistoryStatus = 'idle' | 'scanning' | 'finished' | 'partial' | 'cancelled' | 'failed';
export type HistoryResult = { turns: Turn[]; status: HistoryStatus; reason: string; complete: false | null };
export type HistorySnapshot = { live: Turn[]; turns: Turn[] };

const delay = (ms: number, signal: AbortSignal) => new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); signal.removeEventListener('abort', finish); resolve(); };
    const timer = window.setTimeout(finish, ms);
    signal.addEventListener('abort', finish, { once: true });
    if (signal.aborted) finish();
});
const scrollerFor = (live: Turn[]) => findScrollable(live.find(t => t.element.isConnected)?.element || document.querySelector('main'));
const topEdge = (el: HTMLElement) => getComputedStyle(el).flexDirection === 'column-reverse' ? -(el.scrollHeight - el.clientHeight) : 0;
const move = (el: HTMLElement, top: number) => el.scrollTo({ top, behavior: 'instant' });

export function describeHistory(history: Pick<HistoryResult, 'status' | 'reason'>, count: number) {
    if (history.status === 'scanning') return 'Discovering chat history…';
    if (history.status === 'finished') return `${count} messages discovered · Scan finished · ${history.reason}`;
    if (history.status === 'idle') return `${count} messages discovered · ${history.reason}`;
    return `${count} messages discovered · Incomplete: ${history.reason}`;
}

export function getHistoryCoverage(history: HistoryResult, count: number) {
    return {
        complete: history.complete,
        scanStatus: history.status,
        description: describeHistory(history, count) + (history.status === 'finished' ? '. Full history not verified.' : ''),
    };
}

// Finishing the DOM scan is distinct from verifying the first server-side
// message. A settled edge completes the scan; overall coverage remains unknown.
export async function discoverChatHistory(read: (direction?: 'older' | 'newer') => HistorySnapshot, signal: AbortSignal): Promise<HistoryResult> {
    cancelScroll();
    const url = location.href;
    const initial = read();
    const originalScroller = scrollerFor(initial.live);
    const originalTop = originalScroller.scrollTop;
    const viewportTop = originalScroller.getBoundingClientRect().top;
    const anchor = initial.live.find(t => t.element.getBoundingClientRect().bottom > viewportTop);
    const anchorOffset = anchor?.element.getBoundingClientRect().top;
    const started = performance.now();
    let status: HistoryStatus = 'partial';
    let reason = 'History scan timed out';
    let snapshot = initial;
    if (!initial.live.length) return { turns: initial.turns, status: 'failed', reason: 'No chat content is available', complete: false };
    const active = () => !signal.aborted && location.href === url;
    try {
        let quietSince = performance.now();
        const progressKey = (state: HistorySnapshot) => state.turns.map(turn =>
            `${turn.id}:${turn.text.trim() ? 1 : 0}:${turn.headings.filter(h => h.isPlaceholder).length}`
        ).join('|');
        let fingerprint = progressKey(initial);
        let lastSnapshot = initial;
        let foundMore = false;
        const attemptedHydration = new WeakSet<HTMLElement>();
        let probeNeeded = true;
        let reachedEdge = false;
        while (active()) {
            snapshot = read();
            if (performance.now() - started > 15000) { reason = 'History scan timed out'; break; }

            // Empty units and heading shells can hydrate only after scrolling.
            for (const turn of snapshot.live) {
                if (performance.now() - started > 15000 || !active()) break;
                const target = !turn.text.trim() ? turn.element : turn.headings.find(h => h.isPlaceholder && !attemptedHydration.has(h.element))?.element;
                if (!target?.isConnected || attemptedHydration.has(target) || !active()) continue;
                attemptedHydration.add(target);
                probeNeeded = true;
                const scroller = scrollerFor([turn]);
                move(scroller, scroller.scrollTop + target.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 24);
                await delay(150, signal);
            }
            if (!active()) break;
            if (probeNeeded) {
                const scroller = scrollerFor(read('older').live);
                const edge = topEdge(scroller);
                if (Math.abs(scroller.scrollTop - edge) > 2) move(scroller, edge);
                // Reach the current edge once, then leave the viewport alone
                // while waiting. Only newly discovered content triggers a probe.
                reachedEdge = Math.abs(scroller.scrollTop - edge) <= 2;
                probeNeeded = false;
            }
            await delay(100, signal);
            snapshot = read();
            const nextFingerprint = snapshot === lastSnapshot ? fingerprint : progressKey(snapshot);
            if (nextFingerprint !== fingerprint) {
                probeNeeded = true;
                foundMore ||= snapshot.turns.length > initial.turns.length;
                quietSince = performance.now();
                fingerprint = nextFingerprint;
            }
            lastSnapshot = snapshot;
            // Message discovery/hydration drives progress; full text streaming,
            // node identity and scrollHeight are deliberately not completion keys.
            if (reachedEdge && performance.now() - quietSince >= (foundMore ? 1800 : 1000)) {
                if (!snapshot.live.length || snapshot.turns.some(t => !t.text.trim() || t.headings.some(h => h.isPlaceholder))) {
                    reason = 'Some discovered content did not load';
                } else {
                    status = 'finished';
                    reason = 'No more messages found';
                }
                break;
            }
        }
        if (!active()) { status = 'cancelled'; reason = 'History scan cancelled'; }
    } catch {
        status = 'failed';
        reason = 'History scan failed';
    } finally {
        // Never restore a previous conversation's coordinates onto a new route.
        if (location.href === url && signal.reason !== 'conversation-changed' && signal.reason !== 'unmounted' && signal.reason !== 'user-interrupted') {
            let live = read('newer').live;
            let scroller = scrollerFor(live);
            move(scroller, originalTop);
            // Give a replaced virtual window a chance to remount the reading anchor.
            await delay(150, new AbortController().signal);
            if (!active()) {
                status = 'cancelled';
                reason = 'History scan cancelled';
            }
            live = read().live;
            scroller = scrollerFor(live);
            const restored = live.find(t => t.id === anchor?.id);
            if (location.href === url && signal.reason !== 'user-interrupted' && restored?.element.isConnected && anchorOffset !== undefined) {
                move(scroller, scroller.scrollTop + restored.element.getBoundingClientRect().top - anchorOffset);
            }
        }
    }
    if (!active()) { status = 'cancelled'; reason = 'History scan cancelled'; }
    return { turns: location.href === url ? read().turns : snapshot.turns, status, reason, complete: status === 'finished' ? null : false };
}
