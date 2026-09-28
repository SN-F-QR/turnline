import assert from 'node:assert/strict';
import test from 'node:test';
import { stripMarkdown } from '../../src/lib/markdownUtil.ts';

test('plain text removes Markdown formatting while preserving fenced code verbatim', () => {
    const code = 'const file_name = "**literal**";\nconsole.log(`value: ${file_name}`);';
    const markdown = [
        '# Example', '', 'Use **bold** and `inline_code`.', '',
        '```js', code, '```', '', 'After the example.', '',
        '```', '    keep indentation', '```',
    ].join('\n');

    assert.equal(stripMarkdown(markdown), [
        'Example', '', 'Use bold and inline_code.', '',
        code, '', 'After the example.', '', '    keep indentation',
    ].join('\n'));
});
