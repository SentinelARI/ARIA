import ivm from 'isolated-vm';

const MEMORY_LIMIT_MB = 128;
const MAX_CODE_LENGTH = 20_000;
const MAX_OUTPUT_LENGTH = 64_000;
const SANDBOX_TIMEOUT_MS = 5_000;
const forbiddenTokens = [/\bimport\b/, /\brequire\b/, /\bprocess\b/, /\bchild_process\b/, /\bfetch\b/, /\bhttp\b/, /\bhttps\b/, /\bnet\b/, /\bfs\b/, /\beval\b/, /\bFunction\b/, /\bWebSocket\b/, /\bdynamicImport\b/];

export function validateGeneratedCode(code) {
  if (typeof code !== 'string') throw new Error('Generated analysis code must be text.');
  if (forbiddenTokens.some((pattern) => pattern.test(code))) throw new Error('Generated analysis code failed the sandbox policy.');
  if (code.length > MAX_CODE_LENGTH) throw new Error('Generated analysis code exceeds the sandbox size limit.');
  if (!code.startsWith('const events = [')) throw new Error('Generated analysis code is missing its structured event input.');
  if (!code.includes('console.log(JSON.stringify(')) throw new Error('Generated analysis code must emit one JSON result.');
  return true;
}

function isolateProgram(code) {
  return `'use strict';
const __outputs = [];
const console = Object.freeze({
  log(value) {
    if (__outputs.length > 0) throw new Error('Sandbox programs may emit only one result.');
    if (typeof value !== 'string') throw new Error('Sandbox output must be serialized JSON text.');
    __outputs.push(value);
  }
});
${code}
if (__outputs.length !== 1) throw new Error('Sandbox returned no output.');
__outputs[0];`;
}

export async function executeInSandbox(code) {
  validateGeneratedCode(code);
  const isolate = new ivm.Isolate({ memoryLimit: MEMORY_LIMIT_MB });
  try {
    const context = await isolate.createContext();
    const script = await isolate.compileScript(isolateProgram(code));
    const output = await script.run(context, { timeout: SANDBOX_TIMEOUT_MS, copy: true });
    if (typeof output !== 'string') throw new Error('Sandbox returned an invalid analysis result.');
    if (output.length > MAX_OUTPUT_LENGTH) throw new Error('Sandbox output exceeded the 64 KB limit.');
    try {
      return JSON.parse(output);
    } catch {
      throw new Error('Sandbox returned an invalid analysis result.');
    }
  } finally {
    isolate.dispose();
  }
}
