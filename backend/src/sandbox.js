import { spawn } from 'node:child_process';

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

async function executeWithDocker(code) {
  validateGeneratedCode(code);
  const output = await new Promise((resolve, reject) => {
      const child = spawn('docker', ['run', '--rm', '-i', '--network', 'none', '--read-only', '--memory', '128m', '--pids-limit', '64', '--cpus', '1', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--tmpfs', '/scratch:rw,noexec,nosuid,size=16m', '--workdir', '/scratch', 'aria-analysis-sandbox:latest', 'node', '--max-old-space-size=96', '--input-type=module'], { windowsHide: true });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        callback(value);
      };
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, SANDBOX_TIMEOUT_MS);
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
        if (stdout.length > MAX_OUTPUT_LENGTH) child.kill('SIGKILL');
      });
      child.stderr.on('data', (chunk) => { stderr += chunk; });
      child.on('error', (error) => finish(reject, new Error(`Sandbox runtime unavailable: ${error.message}`)));
      child.on('close', (exitCode) => {
        if (timedOut) return finish(reject, new Error('Sandbox execution timed out after five seconds.'));
        if (stdout.length > MAX_OUTPUT_LENGTH) return finish(reject, new Error('Sandbox output exceeded the 64 KB limit.'));
        if (exitCode === 0) return finish(resolve, stdout.trim());
        return finish(reject, new Error(`Sandbox execution failed: ${stderr.trim() || 'non-zero exit'}`));
      });
      child.stdin.end(code, 'utf8');
  });
  try {
    return JSON.parse(output);
  } catch {
    throw new Error('Sandbox returned an invalid analysis result.');
  }
}

async function executeWithRemoteRunner(code, { fetchImpl = fetch, runnerUrl, runnerToken }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SANDBOX_TIMEOUT_MS + 1_000);
  try {
    const response = await fetchImpl(runnerUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(runnerToken ? { authorization: `Bearer ${runnerToken}` } : {})
      },
      body: JSON.stringify({ code }),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Sandbox runner returned ${response.status}.`);
    if (!Object.hasOwn(payload, 'result')) throw new Error('Sandbox runner returned no result.');
    return payload.result;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Sandbox runner timed out.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function executeInSandbox(code, options = {}) {
  validateGeneratedCode(code);
  if (options.forceLocal) return executeWithDocker(code);
  const runnerUrl = options.runnerUrl ?? process.env.SANDBOX_RUNNER_URL;
  const runnerToken = options.runnerToken ?? process.env.SANDBOX_RUNNER_TOKEN;
  if (runnerUrl) return executeWithRemoteRunner(code, { ...options, runnerUrl, runnerToken });
  if (process.env.NODE_ENV === 'production') throw new Error('Production analysis requires SANDBOX_RUNNER_URL; Railway cannot run Docker-in-Docker safely.');
  return executeWithDocker(code);
}
