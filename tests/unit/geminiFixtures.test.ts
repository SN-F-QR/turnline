import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

test('Gemini capture is offline and excludes account data, tracking and real identifiers', async () => {
  const root = resolve('tests/fixtures/gemini/current-conversation');
  const [html, css, metadata, expectedText] = await Promise.all(
    ['page.html', 'layout.css', 'meta.json', 'expected.json'].map(file => readFile(resolve(root, file), 'utf8')),
  );
  const expected = JSON.parse(expectedText) as { roles: string[]; headings: string[]; headingCounts: number[] };
  assert.doesNotMatch(html, /<(?:script|iframe|object|embed|form|img|svg|video|audio)\b|\bon\w+\s*=|\b(?:src|srcset|id|jslog)\s*=|_ng(?:content|host)|https?:\/\//i);
  assert.doesNotMatch([html, css, metadata, expectedText].join('\n'), /\b[0-9a-f]{16}\b|[\w.+-]+@[\w.-]+\.[a-z]{2,}|accounts\.google|SignOutOptions|Google Account/i);
  assert.match(html, /<infinite-scroller class="chat-history\b/);
  assert.match(html, /class="[^"]*\bturn-content-visibility\b/);
  assert.match(css, /content-visibility:\s*auto/);
  const roles = [...html.matchAll(/<(user-query|model-response)(?:\s|>)/g)]
    .map(match => match[1] === 'user-query' ? 'user' : 'assistant');
  assert.deepEqual(roles, expected.roles);
  assert.equal([...html.matchAll(/<h[1-4](?:\s|>)/g)].length, expected.headings.length);
  assert.equal(expected.headingCounts.reduce((sum, count) => sum + count, 0), expected.headings.length);
});
