import test from 'node:test';
import assert from 'node:assert/strict';
import { executeInSandbox, prepareAnalysisEvents, validateGeneratedCode } from '../src/sandbox.js';

const sampleEvents = [{
  id: 'event-1',
  kind: 'purchase',
  customerId: 'customer-1',
  customerName: 'Ada',
  amountNaira: 42_000,
  occurredAt: '2026-07-20T12:00:00.000Z',
  source: 'synthetic-test',
  rawText: 'This raw source text must not enter the isolate.',
  copy: { hidden: 'Nested UI metadata must not enter the isolate.' }
}];
const validProgram = 'console.log(JSON.stringify({ ok: true, eventCount: events.length, hiddenInput: typeof globalThis.__ariaEvents }));';

test('isolated-vm executes a constrained program with one JSON result and injected events', async () => {
  assert.deepEqual(await executeInSandbox(validProgram, sampleEvents), { ok: true, eventCount: 1, hiddenInput: 'undefined' });
});

test('analysis event preparation strips raw text and nested metadata before the isolate boundary', () => {
  const prepared = prepareAnalysisEvents(sampleEvents);
  assert.deepEqual(prepared, [{
    id: 'event-1',
    kind: 'purchase',
    customerId: 'customer-1',
    customerName: 'Ada',
    amountNaira: 42_000,
    occurredAt: '2026-07-20T12:00:00.000Z',
    source: 'synthetic-test'
  }]);
});

test('sandbox policy rejects obvious network and process access', () => {
  assert.throws(() => validateGeneratedCode("import net from 'node:net'; console.log(JSON.stringify({ eventCount: events.length }));"), /policy/);
  assert.throws(() => validateGeneratedCode('process.exit(1); console.log(JSON.stringify({ eventCount: events.length }));'), /policy/);
});

test('sandbox policy requires the injected event input and JSON output', () => {
  assert.throws(() => validateGeneratedCode('console.log(JSON.stringify({ ok: true }))'), /structured event input/);
  assert.throws(() => validateGeneratedCode('const events = []; console.log(JSON.stringify({ ok: true }))'), /must not replace/);
  assert.throws(() => validateGeneratedCode('console.log("hello", events.length)'), /JSON result/);
});

test('sandbox policy rejects every binding or write that could shadow the authoritative event input', () => {
  const shadowingPrograms = [
    '(function(events) { console.log(JSON.stringify({ eventCount: events.length })); })([]);',
    'const object = { [0](events) { return events; } }; console.log(JSON.stringify({ eventCount: object[0]([]).length }));',
    'function f/**/(events/**/) { return events; } console.log(JSON.stringify({ eventCount: f([]).length }));',
    'let events = []; console.log(JSON.stringify({ eventCount: events.length }));',
    'events = []; console.log(JSON.stringify({ eventCount: events.length }));',
    'for (events of []) {} console.log(JSON.stringify({ eventCount: events.length }));'
  ];
  for (const program of shadowingPrograms) {
    assert.throws(() => validateGeneratedCode(program), /must not replace/);
  }

  const escapedShadowingProgram = 'events; (function(\\u0065vents) { console.log(JSON.stringify({ eventCount: \\u0065vents.length })); })([]);';
  assert.throws(() => validateGeneratedCode(escapedShadowingProgram), /policy/);
});

test('sandbox policy requires an identifier reference to the injected event input', () => {
  assert.throws(() => validateGeneratedCode('console.log(JSON.stringify({ events: [] }));'), /structured event input/);
  assert.doesNotThrow(() => validateGeneratedCode('const report = { events: events.length }; console.log(JSON.stringify(report));'));
});

test('isolate receives a read-only copy of validated structured events', async () => {
  const mutationProgram = 'const mutationAccepted = Reflect.set(events[0], "customerName", "forged"); console.log(JSON.stringify({ mutationAccepted, customerName: events[0].customerName }));';
  assert.deepEqual(await executeInSandbox(mutationProgram, sampleEvents), { mutationAccepted: false, customerName: 'Ada' });
  assert.equal(sampleEvents[0].customerName, 'Ada');
});

test('isolate has no process access even when the token check is bypassed', async () => {
  const bypassProgram = "const target = globalThis['pro' + 'cess']; target.cwd(); console.log(JSON.stringify({ eventCount: events.length }));";
  assert.doesNotThrow(() => validateGeneratedCode(bypassProgram));
  await assert.rejects(() => executeInSandbox(bypassProgram, sampleEvents), /cwd|undefined|not a function/);
});

test('isolate has no require or filesystem access even when the token check is bypassed', async () => {
  const bypassProgram = "const loader = globalThis['requ' + 'ire']; loader('node:' + 'f' + 's'); console.log(JSON.stringify({ eventCount: events.length }));";
  assert.doesNotThrow(() => validateGeneratedCode(bypassProgram));
  await assert.rejects(() => executeInSandbox(bypassProgram, sampleEvents), /undefined|not a function/);
});

test('isolate has no network access even when the token check is bypassed', async () => {
  const bypassProgram = "const requester = globalThis['fe' + 'tch']; requester('ht' + 'tps://example.test'); console.log(JSON.stringify({ eventCount: events.length }));";
  assert.doesNotThrow(() => validateGeneratedCode(bypassProgram));
  await assert.rejects(() => executeInSandbox(bypassProgram, sampleEvents), /undefined|not a function/);
});

test('sandbox enforces the output limit before a value crosses into Node', async () => {
  const oversizedOutput = 'console.log(JSON.stringify({ eventCount: events.length, payload: "x".repeat(64001) }));';
  await assert.rejects(() => executeInSandbox(oversizedOutput, sampleEvents), /output exceeded/);
});

test('isolate interrupts synchronous runaway execution at the hard timeout', async () => {
  const runawayProgram = 'while (true) {} console.log(JSON.stringify({ eventCount: events.length }));';
  await assert.rejects(() => executeInSandbox(runawayProgram, sampleEvents), /timed out/i);
});

test('isolate interrupts runaway microtasks at the hard timeout', async () => {
  const runawayProgram = 'Promise.resolve().then(() => { while (true) {} }); console.log(JSON.stringify({ eventCount: events.length }));';
  await assert.rejects(() => executeInSandbox(runawayProgram, sampleEvents), /timed out/i);
});
