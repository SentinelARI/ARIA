import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

const MAX_CODE_LENGTH = 20_000;
const MAX_OUTPUT_LENGTH = 64_000;
const SANDBOX_TIMEOUT_MS = 5_000;
const forbiddenTokens = [/\bimport\b/, /\brequire\b/, /\bprocess\b/, /\bchild_process\b/, /\bfetch\b/, /\bhttp\b/, /\bhttps\b/, /\bnet\b/, /\bfs\b/, /\beval\b/, /\bFunction\b/, /\bWebSocket\b/, /\bdynamicImport\b/];

function normalizeQuestion(question) {
  return question.trim().toLowerCase().replace(/\s+/g, ' ');
}

function analysisEvents(events) {
  return JSON.stringify(events.map(({ rawText, ...event }) => event));
}

export function generateAnalysisCode(question, events) {
  const normalized = normalizeQuestion(question);
  const safeEvents = analysisEvents(events);
  if (normalized.includes('sales') && normalized.includes('week')) {
    return `const events = ${safeEvents};\nconst now = new Date('2026-07-16T07:00:00.000Z');\nconst week = 86400000 * 7;\nconst sales = (from, to) => events.filter(e => e.kind === 'purchase' && new Date(e.occurredAt) >= from && new Date(e.occurredAt) < to).reduce((sum, e) => sum + e.amountNaira, 0);\nconst current = sales(new Date(now - week), now);\nconst previous = sales(new Date(now - 2 * week), new Date(now - week));\nconsole.log(JSON.stringify({ currentWeekNaira: current, previousWeekNaira: previous, changeNaira: current - previous }));`;
  }
  if (normalized.includes('quiet') || normalized.includes('churn')) {
    return `const events = ${safeEvents};\nconst now = new Date('2026-07-16T07:00:00.000Z');\nconst latest = new Map();\nevents.filter(e => e.kind === 'purchase').forEach(e => latest.set(e.customerName, e));\nconst quiet = [...latest.values()].map(e => ({ customer: e.customerName, daysSinceOrder: Math.floor((now - new Date(e.occurredAt)) / 86400000), lastOrderNaira: e.amountNaira })).sort((a, b) => b.daysSinceOrder - a.daysSinceOrder);\nconsole.log(JSON.stringify({ customers: quiet }));`;
  }
  throw new Error('Try “sales this week vs last” or “which customers have gone quiet?”.');
}

export function validateGeneratedCode(code) {
  if (typeof code !== 'string') throw new Error('Generated analysis code must be text.');
  if (forbiddenTokens.some((pattern) => pattern.test(code))) throw new Error('Generated analysis code failed the sandbox policy.');
  if (code.length > MAX_CODE_LENGTH) throw new Error('Generated analysis code exceeds the sandbox size limit.');
  if (!code.startsWith('const events = [')) throw new Error('Generated analysis code is missing its structured event input.');
  if (!code.includes('console.log(JSON.stringify(')) throw new Error('Generated analysis code must emit one JSON result.');
  return true;
}

export async function executeInSandbox(code) {
  validateGeneratedCode(code);
  const scratchDir = await mkdtemp(join(tmpdir(), 'aria-analysis-'));
  const scriptPath = join(scratchDir, 'analysis.mjs');
  await writeFile(scriptPath, code, 'utf8');
  try {
    const output = await new Promise((resolve, reject) => {
      const child = spawn('docker', ['run', '--rm', '--network', 'none', '--read-only', '--memory', '128m', '--pids-limit', '64', '--cpus', '1', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges', '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', '--mount', `type=bind,src=${scratchDir},dst=/scratch,rw`, '--workdir', '/scratch', 'aria-analysis-sandbox:latest', 'node', '--max-old-space-size=96', 'analysis.mjs'], { windowsHide: true });
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
    });
    try {
      return JSON.parse(output);
    } catch {
      throw new Error('Sandbox returned an invalid analysis result.');
    }
  } finally {
    await rm(scratchDir, { recursive: true, force: true });
  }
}
