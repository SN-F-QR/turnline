import type { Turn } from '../types/index.ts';

// Overlapping DOM windows supply chronology; stable identity supplies deduplication.
export function mergeDiscoveredTurns(previous: readonly Turn[], live: readonly Turn[], direction: 'older' | 'newer' = 'newer'): Turn[] {
    // Search can reindex/replace assistant units within a mounted ChatGPT turn.
    // Reconcile that role's current units at their original position, rather than
    // retaining the pre-search snapshot as an extra answer. Absent turns (and
    // roles with no readable content yet) still survive DOM virtualization.
    const scope = (turn: Turn) => turn.sourceTurnKey ? `${turn.sourceTurnKey}:${turn.role}` : undefined;
    const liveScopes = new Map<string, Turn[]>();
    for (const turn of live) {
        const key = scope(turn);
        if (key) liveScopes.set(key, [...(liveScopes.get(key) || []), turn]);
    }
    const replaced = new Set<string>();
    const result = previous.flatMap(turn => {
        const key = scope(turn);
        if (key && liveScopes.has(key)) {
            if (replaced.has(key)) return [];
            replaced.add(key);
            return liveScopes.get(key)!;
        }
        return turn.turnId || live.some(item => item.id === turn.id) ? [turn] : [];
    });
    if (direction === 'older' && live.length && !live.some(turn => result.some(item => item.id === turn.id))) return [...live, ...result];
    for (let i = 0; i < live.length; i++) {
        const turn = live[i];
        const existing = result.findIndex(item => item.id === turn.id);
        if (existing >= 0) {
            result[existing] = turn;
            continue;
        }
        const next = live.slice(i + 1).find(item => result.some(known => known.id === item.id));
        const before = next ? result.findIndex(item => item.id === next.id) : result.length;
        result.splice(before, 0, turn);
    }
    return result;
}
