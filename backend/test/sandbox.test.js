import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticEvents } from '../src/data.js';
import { generateAnalysisCode, validateGeneratedCode } from '../src/sandbox.js';

test('analysis generator creates executable constrained code for a supported question', () => {
  const code = generateAnalysisCode('sales this week vs last', createSyntheticEvents());
  assert.equal(validateGeneratedCode(code), true);
  assert.match(code, /currentWeekNaira/);
});

test('sandbox policy rejects network and process access', () => {
  assert.throws(() => validateGeneratedCode("import net from 'node:net'"), /policy/);
  assert.throws(() => validateGeneratedCode('process.exit(1)'), /policy/);
});

test('sandbox policy requires structured data and JSON output', () => {
  assert.throws(() => validateGeneratedCode('console.log(JSON.stringify({ ok: true }))'), /structured event input/);
  assert.throws(() => validateGeneratedCode('const events = []; console.log("hello")'), /JSON result/);
});
