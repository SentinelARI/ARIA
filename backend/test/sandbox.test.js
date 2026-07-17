import test from 'node:test';
import assert from 'node:assert/strict';
import { executeInSandbox, validateGeneratedCode } from '../src/sandbox.js';

const validProgram = 'const events = []; console.log(JSON.stringify({ ok: true }));';

test('sandbox policy accepts a structured-data program with JSON output', () => {
  assert.equal(validateGeneratedCode(validProgram), true);
});

test('sandbox policy rejects network and process access', () => {
  assert.throws(() => validateGeneratedCode("const events = []; import net from 'node:net'"), /policy/);
  assert.throws(() => validateGeneratedCode('const events = []; process.exit(1); console.log(JSON.stringify({}))'), /policy/);
});

test('sandbox policy requires structured data and JSON output', () => {
  assert.throws(() => validateGeneratedCode('console.log(JSON.stringify({ ok: true }))'), /structured event input/);
  assert.throws(() => validateGeneratedCode('const events = []; console.log("hello")'), /JSON result/);
});

test('production execution delegates to a configured remote sandbox runner', async () => {
  let received;
  const result = await executeInSandbox(validProgram, {
    runnerUrl: 'https://sandbox.example.test/execute',
    runnerToken: 'test-token',
    fetchImpl: async (url, options) => {
      received = { url, options };
      return new Response(JSON.stringify({ result: { ok: true } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(received.url, 'https://sandbox.example.test/execute');
  assert.equal(received.options.headers.authorization, 'Bearer test-token');
});

test('production execution refuses to fall back to Docker-in-Docker', async () => {
  const previousEnvironment = process.env.NODE_ENV;
  const previousRunnerUrl = process.env.SANDBOX_RUNNER_URL;
  process.env.NODE_ENV = 'production';
  delete process.env.SANDBOX_RUNNER_URL;
  try {
    await assert.rejects(() => executeInSandbox(validProgram), /requires SANDBOX_RUNNER_URL/);
  } finally {
    if (previousEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousEnvironment;
    if (previousRunnerUrl === undefined) delete process.env.SANDBOX_RUNNER_URL;
    else process.env.SANDBOX_RUNNER_URL = previousRunnerUrl;
  }
});
