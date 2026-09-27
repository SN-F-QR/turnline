import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getHeadingLevel,
    getHexColorTone,
    getOutlineFontSizes,
    getOutlineWidth,
    normalizeAccentPreset,
    normalizeDepth,
    normalizeHexColor,
    normalizeOutlineFontSize,
    normalizeThemeMode,
    normalizeWidth,
    parseOutlineFontSize,
} from '../../src/lib/outlineSettings.ts';

test('invalid stored preferences fall back, including nonfinite and out-of-range values', () => {
    for (const value of [undefined, null, '4', NaN, Infinity, 0, 7, 1.5]) assert.equal(normalizeDepth(value), 4);
    for (const value of [undefined, null, '420', NaN, Infinity, 319, 641]) assert.equal(normalizeWidth(value), 420);
    for (const value of [1, 4, 6]) assert.equal(normalizeDepth(value), value);
    for (const value of [320, 420, 640]) assert.equal(normalizeWidth(value), value);
});

test('appearance preferences accept known values and fall back safely', () => {
    for (const value of ['system', 'light', 'dark'] as const) assert.equal(normalizeThemeMode(value), value);
    for (const value of ['blue', 'green', 'yellow', 'pink', 'orange', 'purple'] as const) assert.equal(normalizeAccentPreset(value), value);
    assert.equal(normalizeAccentPreset('amber'), 'yellow');
    assert.equal(normalizeAccentPreset('violet'), 'purple');

    for (const value of [undefined, null, 'auto', 'LIGHT', 1]) assert.equal(normalizeThemeMode(value), 'system');
    for (const value of [undefined, null, 'cyan', 'BLUE', 1]) assert.equal(normalizeAccentPreset(value), 'blue');
});

test('outline font size accepts direct pixels and migrates legacy presets', () => {
    assert.equal(parseOutlineFontSize(10), 10);
    assert.equal(parseOutlineFontSize('16px'), 16);
    assert.equal(parseOutlineFontSize(24), 24);
    for (const value of [9, 25, 14.5, 'large', '16rem']) assert.equal(parseOutlineFontSize(value), null);
    assert.equal(normalizeOutlineFontSize('small'), 12);
    assert.equal(normalizeOutlineFontSize('large'), 14);
    assert.equal(normalizeOutlineFontSize('extra-large'), 16);
    assert.equal(normalizeOutlineFontSize('invalid'), 13);
    assert.deepEqual(getOutlineFontSizes(14), { title: 14, secondary: 13 });
    assert.deepEqual(getOutlineFontSizes(16), { title: 16, secondary: 15 });
});

test('custom colors normalize supported hex values and reject malformed input', () => {
    assert.equal(normalizeHexColor('#abc'), '#AABBCC');
    assert.equal(normalizeHexColor(' #12aBcF '), '#12ABCF');
    for (const value of [undefined, null, '', '123456', '#12', '#1234', '#12345G', '#12345678']) {
        assert.equal(normalizeHexColor(value), null);
    }
    assert.equal(getHexColorTone('#000'), 'dark');
    assert.equal(getHexColorTone('#2563EB'), 'dark');
    assert.equal(getHexColorTone('#FFF'), 'light');
    assert.equal(getHexColorTone('#FDE68A'), 'light');
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
