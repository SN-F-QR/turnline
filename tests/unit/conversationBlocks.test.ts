import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildConversationBlocks } from '../../src/lib/conversationBlocks.ts';

type Entry = { id: string; role: 'user' | 'assistant'; text: string; headings: []; contextLabel?: string; timeLabel?: string };
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

test('independent assistant title prefers context, time, heading, then text', () => {
    const base: Entry = A('text');
    assert.equal(buildConversationBlocks([base])[0].title, 'text');
    assert.equal(buildConversationBlocks([{ ...base, timeLabel: '9:30 AM' }])[0].title, '9:30 AM · text');
    assert.equal(buildConversationBlocks([{ ...base, contextLabel: 'Daily brief', timeLabel: '9:30 AM' }])[0].title, '9:30 AM · Daily brief');
});
