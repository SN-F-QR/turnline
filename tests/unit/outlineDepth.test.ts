import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { getHeadingDepths } from '../../src/lib/outlineDepth.ts';
import { inferChatGptOutlineLevels } from '../../src/providers/chatgptHeadingLevels.ts';

const scenarios = JSON.parse(readFileSync(new URL('../fixtures/outline-hierarchy.json', import.meta.url), 'utf8')) as {
    id: string; levels: number[]; depths: number[];
}[];

for (const scenario of scenarios) {
    test(`response nesting: ${scenario.id}`, () => {
        const headings = scenario.levels.map(level => Object.freeze({ tagName: `H${level}` }));
        Object.freeze(headings);
        assert.deepEqual(getHeadingDepths(headings), scenario.depths);
        assert.deepEqual(headings.map(heading => heading.tagName), scenario.levels.map(level => `H${level}`));
    });
}

test('empty responses and single deep headings need no missing parent levels', () => {
    assert.deepEqual(getHeadingDepths([]), []);
    assert.deepEqual(getHeadingDepths([{ tagName: 'h6' }]), [1]);
    assert.deepEqual(getHeadingDepths([{ tagName: 'H4' }, { tagName: 'H4' }]), [1, 1]);
});

test('ChatGPT numbered chapter correction precedes response depth normalization', () => {
    const headings = [
        { tagName: 'H2', text: '一、Overview' },
        { tagName: 'H4', text: 'Details' },
        { tagName: 'H1', text: '二、Terms' },
        { tagName: 'H5', text: '1. First term' },
        { tagName: 'H6', text: '2. Second term' },
    ];
    const inferred = inferChatGptOutlineLevels(headings);
    assert.deepEqual(inferred, [1, 4, 1, 5, 5]);
    assert.deepEqual(getHeadingDepths(headings.map((heading, index) => ({ ...heading, outlineLevel: inferred[index] }))), [1, 2, 1, 2, 2]);
    assert.deepEqual(headings.map(heading => heading.tagName), ['H2', 'H4', 'H1', 'H5', 'H6']);
});
