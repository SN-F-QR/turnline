import type { HistoryResult } from './chatHistory.ts';

export function describeHistory(history: Pick<HistoryResult, 'status'>, count: number) {
    return `${count} messages discovered${history.status === 'scanning' ? ' · Refreshing…' : ''}`;
}

export function getHistoryCoverage(history: Pick<HistoryResult, 'status' | 'reason'>, count: number) {
    return {
        // A finished DOM scan cannot verify full server-side history. Every
        // other state still has an unfinished scan, so its range is incomplete.
        complete: history.status === 'finished' ? null : false,
        scanStatus: history.status,
        reason: history.reason,
        description: `${count} messages discovered. Full history not verified.`,
    };
}
