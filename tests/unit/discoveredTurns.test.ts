import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Turn } from '../../src/types/index.ts';
import { mergeDiscoveredTurns } from '../../src/lib/discoveredTurns.ts';
import { buildConversationBlocks } from '../../src/lib/conversationBlocks.ts';
import { toExportBlocks } from '../../src/lib/conversationExport.ts';

const turn = (id: string, text = id): Turn => ({ id, turnId: id, role: 'assistant', text, element: {} as HTMLElement, headings: [] });

test('overlapping historical windows retain evicted messages in chronological order and refresh references', () => {
    const cold = ['b', 'c', 'd'].map(id => turn(id));
    const remounted = turn('b', 'updated');
    const discovered = mergeDiscoveredTurns(cold, [turn('a'), remounted, turn('c')]);
    assert.deepEqual(discovered.map(item => item.id), ['a', 'b', 'c', 'd']);
    assert.equal(discovered[1], remounted);
    const newer = mergeDiscoveredTurns(discovered, [turn('c'), turn('d'), turn('e')]);
    assert.deepEqual(newer.map(item => item.id), ['a', 'b', 'c', 'd', 'e']);
    assert.deepEqual(mergeDiscoveredTurns(newer, [turn('a'), turn('b')]).map(item => item.id), ['a', 'b', 'c', 'd', 'e']);
});

test('unidentified evicted nodes are not retained under an invented stable identity', () => {
    const unstable = { ...turn('node'), turnId: undefined };
    assert.deepEqual(mergeDiscoveredTurns([unstable], [turn('stable')]).map(item => item.id), ['stable']);
});

test('shared exports use full cached Markdown when DOM has been recycled', () => {
    const assistant = { ...turn('a', '## Original\n\n**Full** body'), headings: [{ innerText: 'Original', tagName: 'H2', outlineLevel: 6, element: {} as HTMLElement }] };
    const exported = toExportBlocks(buildConversationBlocks([assistant]));
    assert.deepEqual(exported[0], { prompt: undefined, answer: '## Original\n\n**Full** body', headings: ['Original'], kind: 'assistant', title: 'Original' });
});

test('fully replaced windows use the scan direction when no overlap remains', () => {
    const newer = ['c', 'd'].map(id => turn(id));
    const older = ['a', 'b'].map(id => turn(id));
    const all = mergeDiscoveredTurns(newer, older, 'older');
    assert.deepEqual(all.map(item => item.id), ['a', 'b', 'c', 'd']);
    assert.deepEqual(mergeDiscoveredTurns(all, newer, 'newer').map(item => item.id), ['a', 'b', 'c', 'd']);
});
