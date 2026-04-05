const test = require('node:test');
const assert = require('node:assert/strict');
const { buildStructuredOutput } = require('../ai');

test('AI output is structured', () => {
  const result = buildStructuredOutput({
    inputText: 'Need to update docs. We should fix login copy and summarize key steps.',
    mode: 'summarize',
    level: 'beginner',
    style: 'concise',
    tone: 'professional',
    memory: [],
  });

  assert.ok(result.meta);
  assert.ok(result.sections);
  assert.equal(result.meta.mode, 'summarize');
  assert.ok(typeof result.sections.summary === 'string' && result.sections.summary.length > 0);
  assert.ok(Array.isArray(result.sections.keyPoints));
  assert.ok(Array.isArray(result.sections.actionItems));
});
