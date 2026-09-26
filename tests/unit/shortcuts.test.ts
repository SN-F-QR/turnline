import assert from 'node:assert/strict';
import test from 'node:test';
import { matchesToggleSidebar } from '../../src/lib/shortcuts.ts';

const key = (overrides: Record<string, string | number | boolean> = {}) => ({
  key: ';', repeat: false, isComposing: false, keyCode: 186,
  altKey: false, shiftKey: false, metaKey: true, ctrlKey: false,
  ...overrides,
});

test('toggle shortcut matches only the platform command and semicolon', () => {
  assert.equal(matchesToggleSidebar(key(), true), true);
  assert.equal(matchesToggleSidebar(key({ metaKey: false, ctrlKey: true }), false), true);

  for (const overrides of [
    { key: "'" }, { key: 'c' }, { repeat: true }, { isComposing: true },
    { keyCode: 229 }, { altKey: true }, { shiftKey: true }, { ctrlKey: true },
    { metaKey: false },
  ]) {
    assert.equal(matchesToggleSidebar(key(overrides), true), false, JSON.stringify(overrides));
  }
  assert.equal(matchesToggleSidebar(key(), false), false);
});
