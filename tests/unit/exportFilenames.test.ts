import assert from 'node:assert/strict';
import test from 'node:test';
import { generateExportFilename } from '../../src/lib/exportFilenames.ts';

test('export filename removes unsafe path characters', () => {
  const name = generateExportFilename({ type: 'chat', title: 'A/B: C?', format: 'md' });
  assert.match(name, /^AB-C-\d{4}-\d{2}-\d{2}\.md$/);
});
