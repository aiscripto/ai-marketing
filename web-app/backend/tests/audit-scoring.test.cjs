const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateWeightedAuditScore } = require('../dist/jobs/audit.js');
const { TOOL_NAMES } = require('../dist/jobs/tool.js');

test('exposes all fourteen original marketing workflows to the API', () => {
  assert.equal(TOOL_NAMES.length, 14);
  assert.deepEqual(new Set(TOOL_NAMES), new Set([
    'quick', 'copy', 'emails', 'social', 'ads', 'funnel', 'competitors', 'landing',
    'launch', 'proposal', 'report', 'report-pdf', 'seo', 'brand',
  ]));
});

test('uses the original six audit weights and returns a rounded score', () => {
  const result = calculateWeightedAuditScore({
    content: 80,
    conversion: 70,
    seo: 60,
    competitive: 90,
    brand: 50,
    growth: 100,
  });
  assert.deepEqual(result, { weighted: 75, coverage: 100 });
});

test('withholds the composite score when any category score is missing', () => {
  const result = calculateWeightedAuditScore({
    content: 80,
    conversion: 70,
    seo: null,
    competitive: 90,
    brand: 50,
    growth: 100,
  });
  assert.deepEqual(result, { weighted: null, coverage: 80 });
});

test('reports zero score coverage when all specialist scores are unavailable', () => {
  const result = calculateWeightedAuditScore({
    content: null,
    conversion: null,
    seo: null,
    competitive: null,
    brand: null,
    growth: null,
  });
  assert.deepEqual(result, { weighted: null, coverage: 0 });
});
