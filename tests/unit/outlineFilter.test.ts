import assert from 'node:assert/strict';
import test from 'node:test';
import type { Heading, Turn } from '../../src/types/index.ts';
import { buildConversationBlocks } from '../../src/lib/conversationBlocks.ts';
import { filterOutlineBlocks } from '../../src/lib/outlineFilter.ts';

type Entry = Pick<Turn, 'id' | 'role' | 'text' | 'headings' | 'contextLabel' | 'timeLabel'>;
const heading = (innerText: string, level: number, outlineLevel?: number): Heading => ({
    innerText, tagName: `H${level}`, outlineLevel, element: {} as HTMLElement,
});
const prompt = (id: string, text: string): Entry => ({ id, role: 'user', text, headings: [] });
const answer = (id: string, text: string, headings: Heading[] = []): Entry => ({ id, role: 'assistant', text, headings });
const conversation = () => buildConversationBlocks([
    prompt('u1', 'Describe imaginary astronomy'),
    answer('a1', '## Orbit Alpha\nA silver comet.\n### Orbit Beta\nLuminous moons.', [
        heading('Orbit Alpha', 2), heading('Orbit Beta', 3), heading('Moon archive', 5),
    ]),
    prompt('u2', 'Explain green satellites'),
    answer('a2', 'A tiny satellite named Velorin.'),
    prompt('u3', 'An unanswered prompt'),
]);

test('prompt matches keep all headings within the selected depth and preserve source data', () => {
    const blocks = conversation();
    const originalHeadings = blocks[0].headings;
    blocks.forEach(block => { Object.freeze(block); Object.freeze(block.headings); });
    const results = filterOutlineBlocks(blocks, '  ASTRONOMY  ', 4);
    assert.equal(results.length, 1);
    assert.equal(results[0].block, blocks[0]);
    assert.equal(results[0].block.headings, originalHeadings);
    assert.deepEqual(results[0].headingIndices, [0, 1]);
    assert.equal(blocks[0].headings.length, 3);
    assert.match(blocks[0].answer!.text, /silver comet/);
});

test('section matches preserve original indices without retaining nonmatching relatives', () => {
    const blocks = conversation();
    const results = filterOutlineBlocks(blocks, '  oRBit BeTA  ', 4);
    assert.equal(results.length, 1);
    assert.equal(results[0].block, blocks[0]);
    assert.deepEqual(results[0].headingIndices, [1]);
    assert.deepEqual(filterOutlineBlocks(blocks, 'Orbit', 4)[0].headingIndices, [0, 1]);
});

test('body text and no-heading answer summaries cannot match', () => {
    const blocks = conversation();
    for (const query of ['silver comet', 'luminous moons', 'Velorin']) {
        assert.deepEqual(filterOutlineBlocks(blocks, query, 6), []);
    }
    const results = filterOutlineBlocks(blocks, 'green satellites', 4);
    assert.equal(results.length, 1);
    assert.equal(results[0].block, blocks[1]);
    assert.deepEqual(results[0].headingIndices, []);
});

test('independent answers only match section headings, excluding title, context and time', () => {
    const blocks = buildConversationBlocks([
        { ...answer('a1', 'Body-only words', [heading('Status overview', 2)]), contextLabel: 'Daily brief', timeLabel: '9:30 AM' },
        answer('a2', 'Summary-only words'),
    ]);
    for (const query of ['Body-only', 'Daily brief', '9:30 AM', 'Summary-only']) {
        assert.deepEqual(filterOutlineBlocks(blocks, query, 4), []);
    }
    assert.deepEqual(filterOutlineBlocks(blocks, 'overview', 4), [{ block: blocks[0], headingIndices: [0] }]);
});

test('empty or whitespace queries restore every block, including prompts and independent answers', () => {
    const blocks = [...conversation(), ...buildConversationBlocks([answer('a3', 'Independent answer')])];
    for (const query of ['', ' \n\t ']) {
        const results = filterOutlineBlocks(blocks, query, 2);
        assert.deepEqual(results.map(result => result.block), blocks);
        assert.deepEqual(results.map(result => result.headingIndices), [[0], [], [], []]);
    }
    const results = filterOutlineBlocks(blocks, 'unanswered', 4);
    assert.deepEqual(results, [{ block: blocks[2], headingIndices: [] }]);
});

test('section matching obeys depth, including inferred outline levels', () => {
    const blocks = conversation();
    assert.deepEqual(filterOutlineBlocks(blocks, 'Orbit Beta', 2), []);
    assert.deepEqual(filterOutlineBlocks(blocks, 'Moon archive', 4), []);
    assert.deepEqual(filterOutlineBlocks(blocks, 'Orbit Beta', 3)[0].headingIndices, [1]);
    assert.deepEqual(filterOutlineBlocks(blocks, 'Moon archive', 6)[0].headingIndices, [2]);
    const inferred = buildConversationBlocks([answer('a3', '', [heading('Inferred chapter', 4, 1)])]);
    assert.deepEqual(filterOutlineBlocks(inferred, 'chapter', 1)[0].headingIndices, [0]);
});

test('queries are literal substrings within a single heading', () => {
    const blocks = conversation();
    for (const query of ['Alpha Orbit', 'Orbit.*Beta', 'Orbit Beta Moon']) {
        assert.deepEqual(filterOutlineBlocks(blocks, query, 6), []);
    }
});

test('full prompts and Chinese section titles are searchable', () => {
    const blocks = buildConversationBlocks([
        prompt('u1', `${'Long prompt '.repeat(20)}结尾关键词`),
        answer('a1', '正文包含隐藏关键词', [heading('第一章：安装说明', 2), heading('第二章：使用方法', 2)]),
    ]);
    assert.deepEqual(filterOutlineBlocks(blocks, '结尾关键词', 4)[0].headingIndices, [0, 1]);
    assert.deepEqual(filterOutlineBlocks(blocks, '使用方法', 4)[0].headingIndices, [1]);
    assert.deepEqual(filterOutlineBlocks(blocks, '隐藏关键词', 4), []);
});
