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

test('outline depths survive answer eviction and refresh when the same answer remounts', () => {
    const headings = (levels: number[]) => levels.map(level => ({ innerText: `Level ${level}`, tagName: `H${level}`, element: {} as HTMLElement }));
    const original = { ...turn('a'), headings: headings([2, 4, 5]) };
    const retained = mergeDiscoveredTurns([original], [turn('b')]);
    assert.deepEqual(buildConversationBlocks(retained).map(block => block.headingDepths), [[1, 2, 3], []]);
    const replacement = { ...turn('a'), headings: headings([4, 4, 6]) };
    const updated = buildConversationBlocks(mergeDiscoveredTurns(retained, [replacement]));
    assert.deepEqual(updated[0].headingDepths, [1, 1, 2]);
    assert.equal(updated[0].headings, replacement.headings);
    assert.deepEqual(original.headings.map(heading => heading.tagName), ['H2', 'H4', 'H5']);
});

test('fully replaced windows use the scan direction when no overlap remains', () => {
    const newer = ['c', 'd'].map(id => turn(id));
    const older = ['a', 'b'].map(id => turn(id));
    const all = mergeDiscoveredTurns(newer, older, 'older');
    assert.deepEqual(all.map(item => item.id), ['a', 'b', 'c', 'd']);
    assert.deepEqual(mergeDiscoveredTurns(all, newer, 'newer').map(item => item.id), ['a', 'b', 'c', 'd']);
});

const scoped = (id: string, sourceTurnKey = 'stream'): Turn => ({ ...turn(id), sourceTurnKey });

test('search unit reindex replaces the partial answer without duplicate headings or exports', () => {
    const prompt: Turn = { ...scoped('user'), role: 'user' };
    const partial = { ...scoped('assistant-1'), text: '## Comparison\n\nBefore search', headings: [{ innerText: 'Comparison', tagName: 'H2', element: {} as HTMLElement }] };
    const complete = { ...scoped('assistant-2'), text: '## Comparison\n\nBefore search\n\n## Findings\n\nAfter search', headings: [...partial.headings, { innerText: 'Findings', tagName: 'H2', element: {} as HTMLElement }] };
    const merged = mergeDiscoveredTurns([prompt, partial], [prompt, complete]);
    assert.deepEqual(merged, [prompt, complete]);
    const blocks = buildConversationBlocks(merged);
    assert.equal(blocks.length, 1);
    assert.equal(blocks[0].kind, 'exchange');
    assert.deepEqual(blocks[0].headings.map(h => h.innerText), ['Comparison', 'Findings']);
    assert.equal(toExportBlocks(blocks)[0].answer, complete.text);
});

test('reconciliation preserves evicted history, chronology, and roles temporarily missing from the DOM', () => {
    const prompt: Turn = { ...scoped('user'), role: 'user' };
    const old = scoped('assistant-1');
    const historical = scoped('earlier-answer', 'earlier');
    const newer = scoped('later-answer', 'later');
    const previous = [historical, prompt, old, newer];
    assert.deepEqual(mergeDiscoveredTurns(previous, [prompt]), previous);
    assert.deepEqual(mergeDiscoveredTurns(previous, []), previous);
    const updated = scoped('assistant-2');
    assert.deepEqual(mergeDiscoveredTurns(previous, [updated]), [historical, prompt, updated, newer]);
});

test('all live assistant units in a turn remain distinct; only obsolete snapshots are removed', () => {
    const first = scoped('assistant-1');
    const second = scoped('assistant-2');
    const updated = { ...first, text: 'Updated first message' };
    assert.deepEqual(mergeDiscoveredTurns([first], [updated, second]), [updated, second]);
    assert.deepEqual(mergeDiscoveredTurns([first, second], [second]), [second]);
    assert.deepEqual(mergeDiscoveredTurns([first, second], [updated, second]), [updated, second]);
});

test('temporary submission is visible live but not retained after resolution or removal', () => {
    const pending: Turn = { ...scoped('pending:0:user', 'pending-chatgpt-submit'), role: 'user', turnId: undefined, text: 'Same question' };
    const resolved: Turn = { ...scoped('resolved:0:user', 'resolved'), role: 'user', text: pending.text };
    const earlier: Turn = { ...resolved, id: 'earlier:0:user', turnId: 'earlier:0:user', sourceTurnKey: 'earlier' };
    const previous = [earlier, pending];
    assert.deepEqual(mergeDiscoveredTurns([earlier], [pending]), previous);
    assert.deepEqual(mergeDiscoveredTurns(previous, [pending]), previous);
    assert.deepEqual(mergeDiscoveredTurns(previous, [resolved]), [earlier, resolved]);
    assert.deepEqual(mergeDiscoveredTurns(previous, []), [earlier]);
});
