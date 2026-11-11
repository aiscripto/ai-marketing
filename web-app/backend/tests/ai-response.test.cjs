const test = require('node:test');
const assert = require('node:assert/strict');
const { extractOpenAIResponseText } = require('../dist/lib/ai.js');

test('extracts text from the raw Responses API output content', () => {
  const result = extractOpenAIResponseText({
    output: [
      { content: [{ type: 'reasoning', text: 'not user-facing' }] },
      { content: [{ type: 'output_text', text: 'Audit findings' }] },
      { content: [{ type: 'output_text', text: 'Next steps' }] },
    ],
  });

  assert.equal(result, 'Audit findings\nNext steps');
});

test('supports responses that include a top-level output_text field', () => {
  assert.equal(extractOpenAIResponseText({ output_text: '  Audit findings  ' }), 'Audit findings');
});

test('returns an empty string when a response contains no output text', () => {
  assert.equal(extractOpenAIResponseText({ output: [{ content: [{ type: 'refusal', text: 'Cannot help' }] }] }), '');
});
