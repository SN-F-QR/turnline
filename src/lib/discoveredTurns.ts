import type { Turn } from '../types/index.ts';

// Overlapping DOM windows supply chronology; stable identity supplies deduplication.
export function mergeDiscoveredTurns(previous: readonly Turn[], live: readonly Turn[], direction: 'older' | 'newer' = 'newer'): Turn[] {
    const result = previous.filter(turn => turn.turnId || live.some(item => item.id === turn.id));
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
