import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('tests/fixtures/chatgpt');
type SnapshotExpected = { turnKeys: string[]; contentUnits: number };

async function snapshot(scenario: string, file: string) {
  const html = await readFile(resolve(root, scenario, file), 'utf8');
  const turnKeys = [...html.matchAll(/data-turn-key="([^"]+)"/g)].map((match) => match[1]);
  const contentUnits = [...html.matchAll(/data-content-search-unit-key="/g)].length;
  return { html, turnKeys, contentUnits };
}

async function expected<T>(scenario: string): Promise<T> {
  return JSON.parse(await readFile(resolve(root, scenario, 'expected.json'), 'utf8')) as T;
}

function assertSafeOfflineHtml(html: string) {
  assert.doesNotMatch(html, /<script\b|<iframe\b|<form\b|data-chatgpt-composer|\bsrc="https?:\/\//i);
  assert.doesNotMatch(html, /6aaa27eb-9040-83e9-b7e3-29aaab63d23c|6ab359a9-3020-83e9-9feb-a9a442b49b70/);
}

test('L01 cold and loaded fixtures preserve the observed turn replacement', async () => {
  const [cold, loaded, checks] = await Promise.all([
    snapshot('long-response-l01', 'page.html'),
    snapshot('long-response-l01', 'loaded.html'),
    expected<{ cold: SnapshotExpected; loaded: SnapshotExpected }>('long-response-l01'),
  ]);
  assert.deepEqual(cold.turnKeys, checks.cold.turnKeys);
  assert.deepEqual(loaded.turnKeys, checks.loaded.turnKeys);
  assert.equal(cold.contentUnits, checks.cold.contentUnits);
  assert.equal(loaded.contentUnits, checks.loaded.contentUnits);
  assert(!cold.turnKeys.includes(loaded.turnKeys[0]));
  assert(!loaded.turnKeys.includes(cold.turnKeys.at(-1)));
  assert.deepEqual(loaded.turnKeys.slice(1), cold.turnKeys.slice(0, -1));
  assertSafeOfflineHtml(cold.html);
  assertSafeOfflineHtml(loaded.html);
});

test('L02 fixture retains five long-response turns without external resources', async () => {
  const [page, checks] = await Promise.all([
    snapshot('long-response-l02', 'page.html'),
    expected<SnapshotExpected>('long-response-l02'),
  ]);
  assert.deepEqual(page.turnKeys, checks.turnKeys);
  assert.equal(page.contentUnits, checks.contentUnits);
  assertSafeOfflineHtml(page.html);
});
