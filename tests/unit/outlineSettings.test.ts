import assert from 'node:assert/strict';
import test from 'node:test';
import { getHeadingLevel, getOutlineWidth, normalizeDepth, normalizeWidth } from '../../src/lib/outlineSettings.ts';

test('invalid stored preferences fall back, including nonfinite and out-of-range values', () => {
    for (const value of [undefined, null, '4', NaN, Infinity, 0, 7, 1.5]) assert.equal(normalizeDepth(value), 4);
    for (const value of [undefined, null, '420', NaN, Infinity, 319, 641]) assert.equal(normalizeWidth(value), 420);
    for (const value of [1, 4, 6]) assert.equal(normalizeDepth(value), value);
    for (const value of [320, 420, 640]) assert.equal(normalizeWidth(value), value);
});

test('effective levels prefer valid inference and otherwise preserve H1–H6', () => {
    assert.equal(getHeadingLevel({ tagName: 'H4', outlineLevel: 2 }), 2);
    for (let level = 1; level <= 6; level++) {
        assert.equal(getHeadingLevel({ tagName: `h${level}`, outlineLevel: NaN }), level);
    }
    assert.equal(getHeadingLevel({ tagName: 'DIV', outlineLevel: 7 }), 6);
});

test('width respects both expansion directions without changing preference', () => {
    for (const viewport of [375, 768, 1440]) {
        for (const x of [18, viewport / 2, viewport - 60]) {
            for (const direction of ['left', 'right'] as const) {
                const width = getOutlineWidth(640, viewport, x, direction);
                const left = direction === 'left' ? x + 42 - width : x;
                assert.ok(left >= 18 && left + width <= viewport - 18);
            }
        }
    }
    assert.equal(getOutlineWidth(640, 1440, 1380, 'left'), 640);
});
