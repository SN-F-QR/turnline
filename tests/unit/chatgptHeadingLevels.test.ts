import assert from 'node:assert/strict';
import test from 'node:test';

import { inferChatGptOutlineLevels } from '../../src/providers/chatgptHeadingLevels.ts';

test('repairs numbered Chinese chapters and inconsistent numbered children', () => {
    const headings = [
        { tagName: 'H2', text: '一、全文翻译' },
        { tagName: 'H3', text: '中秋月要到 9 月 27 日才真正圆' },
        { tagName: 'H1', text: '二、你可能不认识或不熟悉的单词' },
        { tagName: 'H3', text: '几个尤其值得记住的词' },
        { tagName: 'H4', text: '1. lunar' },
        { tagName: 'H4', text: '2. phase' },
        { tagName: 'H1', text: '三、你可能不熟悉的语法' },
        { tagName: 'H2', text: '1. will reach ... at ...' },
        { tagName: 'H1', text: '2. two calendar dates after ...' },
        { tagName: 'H1', text: '3. After all' },
        { tagName: 'H1', text: '四、最容易翻译错的句子' },
        { tagName: 'H2', text: '1. First sentence' },
        { tagName: 'H2', text: '2. Second sentence' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [
        1, 3,
        1, 3, 4, 4,
        1, 2, 2, 2,
        1, 2, 2,
    ]);
});

test('keeps ordinary heading levels literal without multiple chapter markers', () => {
    const headings = [
        { tagName: 'H2', text: '一、Only one numbered title' },
        { tagName: 'H1', text: '2. A separate heading' },
        { tagName: 'H3', text: 'Details' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [2, 1, 3]);
});

test('does not flatten a non-increasing numbered hierarchy', () => {
    const headings = [
        { tagName: 'H1', text: '一、Overview' },
        { tagName: 'H2', text: '1. Parent' },
        { tagName: 'H3', text: '1. Child' },
        { tagName: 'H3', text: '2. Child' },
        { tagName: 'H1', text: '二、Summary' },
    ];

    assert.deepEqual(inferChatGptOutlineLevels(headings), [1, 2, 3, 3, 1]);
});

test('empty, English, single chapter and H5/H6 headings remain literal', () => {
    for (const headings of [[], [{ tagName: 'H5', text: '一、Single' }], [
        { tagName: 'H2', text: 'Introduction' }, { tagName: 'H5', text: 'Details' }, { tagName: 'H6', text: 'Details' },
    ]]) {
        assert.deepEqual(inferChatGptOutlineLevels(headings), headings.map(h => Number(h.tagName.slice(1))));
    }
});

test('number resets and duplicate child titles do not flatten nested levels', () => {
    const headings = [
        { tagName: 'H1', text: '一、Start' },
        { tagName: 'H2', text: '1. Parent' },
        { tagName: 'H5', text: '2. Detail' },
        { tagName: 'H6', text: '1. Reset' },
        { tagName: 'H6', text: '1. Reset' },
        { tagName: 'H1', text: '二、End' },
    ];
    assert.deepEqual(inferChatGptOutlineLevels(headings), [1, 2, 5, 6, 6, 1]);
});

test('ordinary H5/H6 nesting inside Chinese chapters is preserved', () => {
    assert.deepEqual(inferChatGptOutlineLevels([
        { tagName: 'H1', text: '一、Start' }, { tagName: 'H5', text: 'Detail' },
        { tagName: 'H6', text: 'More detail' }, { tagName: 'H1', text: '二、End' },
    ]), [1, 5, 6, 1]);
});
