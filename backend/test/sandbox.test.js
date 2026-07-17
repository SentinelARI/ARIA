import test from 'node:test';
import assert from 'node:assert/strict';
import { executeInSandbox, validateGeneratedCode } from '../src/sandbox.js';

const validProgram = 'const events = []; console.log(JSON.stringify({ ok: true }));';

test('isolated-vm executes a constrained program with one JSON result', async () => {
  assert.deepEqual(await executeInSandbox(validProgram), { ok: true });
});

test('sandbox policy rejects obvious network and process access', () => {
  assert.throws(() => validateGeneratedCode("const events = []; import net from 'node:net'"), /policy/);
  assert.throws(() => validateGeneratedCode('const events = []; process.exit(1); console.log(JSON.stringify({}))'), /policy/);
});

test('sandbox policy requires structured data and JSON output', () => {
  assert.throws(() => validateGeneratedCode('console.log(JSON.stringify({ ok: true }))'), /structured event input/);
  assert.throws(() => validateGeneratedCode('const events = []; console.log("hello")'), /JSON result/);
});

test('isolate has no process access even when the token check is bypassed', async () => {
  const bypassProgram = "const events = []; const target = globalThis['pro' + 'cess']; target.cwd(); console.log(JSON.stringify({ ok: true }));";
  assert.doesNotThrow(() => validateGeneratedCode(bypassProgram));
  await assert.rejects(() => executeInSandbox(bypassProgram), /cwd|undefined|not a function/);
});

test('isolate has no require or filesystem access even when the token check is bypassed', async () => {
  const bypassProgram = "const events = []; const loader = globalThis['requ' + 'ire']; loader('node:' + 'f' + 's'); console.log(JSON.stringify({ ok: true }));";
  assert.doesNotThrow(() => validateGeneratedCode(bypassProgram));
  await assert.rejects(() => executeInSandbox(bypassProgram), /undefined|not a function/);
});

test('isolate has no network access even when the token check is bypassed', async () => {
  const bypassProgram = "const events = []; const requester = globalThis['fe' + 'tch']; requester('ht' + 'tps://example.test'); console.log(JSON.stringify({ ok: true }));";
  assert.doesNotThrow(() => validateGeneratedCode(bypassProgram));
  await assert.rejects(() => executeInSandbox(bypassProgram), /undefined|not a function/);
});

test('isolate interrupts runaway execution at the hard timeout', async () => {
  const runawayProgram = 'const events = []; while (true) {} console.log(JSON.stringify({ ok: true }));';
  await assert.rejects(() => executeInSandbox(runawayProgram), /timed out/i);
});
