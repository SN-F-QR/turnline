import assert from 'node:assert/strict';
import test from 'node:test';
import { describeHistory, getHistoryCoverage } from '../../src/lib/historyCoverage.ts';
import type { HistoryStatus } from '../../src/lib/chatHistory.ts';

test('ChatGPT coverage distinguishes a finished scan of unknown completeness from every unfinished state', () => {
    const cases: Array<[HistoryStatus, string, false | null]> = [
        ['idle', 'Visible messages only', false],
        ['scanning', 'Discovering chat history…', false],
        ['finished', 'No more messages found', null],
        ['partial', 'History scan timed out', false],
        ['partial', 'Some discovered content did not load', false],
        ['cancelled', 'History scan cancelled', false],
        ['failed', 'History scan failed', false],
    ];
    for (const [status, reason, complete] of cases) {
        assert.deepEqual(getHistoryCoverage({ status, reason }, 4), {
            complete, scanStatus: status, reason,
            description: '4 messages discovered. Full history not verified.',
        });
        assert.equal(describeHistory({ status }, 4), status === 'scanning'
            ? '4 messages discovered · Refreshing…'
            : '4 messages discovered');
    }
});
