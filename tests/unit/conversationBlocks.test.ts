import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationBlocks } from '../../src/lib/conversationBlocks.ts';
import type { Turn } from '../../src/types/index.ts';

type Entry = Pick<Turn, 'id' | 'role' | 'text' | 'headings' | 'contextLabel' | 'timeLabel'>;
const U = (id: string): Entry => ({ id, role: 'user', text: id, headings: [] });
const A = (id: string, contextLabel?: string): Entry => ({ id, role: 'assistant', text: id, headings: [], contextLabel });

test('conversation blocks use each message once in source order', () => {
    const cases: Array<[Entry[], string[]]> = [
        [[A('a')], ['assistant:a']],
        [[A('a'), A('b')], ['assistant:a', 'assistant:b']],
        [[U('u'), A('a')], ['exchange:u+a']],
        [[U('u'), A('a'), A('b')], ['exchange:u+a', 'assistant:b']],
        [[U('u'), U('v'), A('a')], ['prompt:u', 'exchange:v+a']],
        [[U('u'), A('scheduled', 'Daily brief'), A('reply')], ['prompt:u', 'assistant:scheduled', 'assistant:reply']],
    ];
    for (const [turns, expected] of cases) {
        const blocks = buildConversationBlocks(turns);
        assert.deepEqual(blocks.map(block => `${block.kind}:${[block.prompt?.id, block.answer?.id].filter(Boolean).join('+')}`), expected);
        assert.deepEqual(blocks.flatMap(block => [block.prompt?.id, block.answer?.id].filter(Boolean)), turns.map(turn => turn.id));
    }
});

test('independent assistant title prefixes time and prefers context, populated heading, then text', () => {
    const base: Entry = A('text');
    const heading = { innerText: ' Overview ', tagName: 'H2', element: {} as HTMLElement };
    const cases: Array<[Partial<Entry>, string]> = [
        [{}, 'text'],
        [{ timeLabel: '9:30 AM' }, '9:30 AM · text'],
        [{ headings: [heading] }, 'Overview'],
        [{ headings: [heading], timeLabel: '9:30 AM' }, '9:30 AM · Overview'],
        [{ headings: [heading], contextLabel: ' Daily brief ', timeLabel: '9:30 AM' }, '9:30 AM · Daily brief'],
        [{ headings: [{ ...heading, isPlaceholder: true }] }, 'text'],
        [{ headings: [{ ...heading, innerText: ' ' }, heading] }, 'Overview'],
        [{ contextLabel: ' ', timeLabel: ' ', text: '' }, 'Assistant update'],
    ];
    for (const [overrides, expected] of cases) {
        assert.equal(buildConversationBlocks([{ ...base, ...overrides }])[0].title, expected);
    }
});

test('each answer gets independent depths without changing source headings or counting the prompt', () => {
    const headings = (levels: number[]) => levels.map(level => ({ innerText: `Level ${level}`, tagName: `H${level}`, element: {} as HTMLElement }));
    const turns: Entry[] = [
        { ...U('u'), headings: headings([1, 2]) },
        { ...A('a'), headings: headings([2, 4, 5]) },
        { ...A('b', 'Independent update'), headings: headings([5, 6]) },
        U('unanswered'),
    ];
    turns.forEach(turn => {
        turn.headings.forEach(Object.freeze);
        Object.freeze(turn.headings);
        Object.freeze(turn);
    });
    const blocks = buildConversationBlocks(turns);
    assert.deepEqual(blocks.map(block => block.headingDepths), [[1, 2, 3], [1, 2], []]);
    assert.equal(blocks[0].headings, turns[1].headings);
    assert.equal(blocks[1].headings, turns[2].headings);
    assert.equal(blocks[0].headings[1], turns[1].headings[1]);
    assert.equal(blocks[0].answer, turns[1]);
    assert.deepEqual(turns[1].headings.map(heading => heading.tagName), ['H2', 'H4', 'H5']);
});
