import test from 'node:test';
import assert from 'node:assert/strict';
import OpenAI from 'openai';
import { generateAnalysisProgram, generateDefenseNarrative, runAnalysisProgram, streamDefenseNarrative } from '../src/ai.js';
import { createSyntheticEvents } from '../src/data.js';
import { executeInSandbox } from '../src/sandbox.js';

function fakeClient(outputs) {
  const requests = [];
  return {
    requests,
    responses: {
      create: async (request, options) => {
        requests.push({ request, options });
        return { output_text: outputs.shift() };
      }
    }
  };
}

test('analysis agent asks OpenAI for a fresh constrained program using structured events only', async () => {
  const client = fakeClient(['```js\nconsole.log(JSON.stringify({ total: events.length }));\n```']);
  const program = await generateAnalysisProgram({ question: 'What did Ankara sales do this week?', events: createSyntheticEvents(), client, model: 'test-model' });
  assert.equal(program, 'console.log(JSON.stringify({ total: events.length }));');
  assert.equal(client.requests[0].request.model, 'test-model');
  assert.match(client.requests[0].request.instructions, /JavaScript program/);
  assert.match(client.requests[0].request.instructions, /read-only `events` input/);
  assert.match(client.requests[0].request.input, /What did Ankara sales do this week/);
  assert.doesNotMatch(client.requests[0].request.input, /rawText/);
});

test('defense agent requests a fresh narrative for each re-derived evidence payload', async () => {
  const client = fakeClient(['Amara’s recent order is smaller and later than her earlier pattern.', 'The order gap and lower basket make a check-in timely.']);
  const context = { insight: { title: 'Amara may be drifting away' }, evidence: { latestGap: 19, expectedCadence: 12 }, model: 'test-model', client };
  const first = await generateDefenseNarrative(context);
  const second = await generateDefenseNarrative(context);
  assert.notEqual(first, second);
  assert.match(client.requests[0].request.instructions, /plain-language/);
  assert.match(client.requests[0].request.input, /expectedCadence/);
});

test('defense agent requests Nigerian Pidgin only when the locale asks for it', async () => {
  const client = fakeClient(['Fresh Pidgin defense copy.']);
  await generateDefenseNarrative({ insight: { title: 'Amara may be drifting away' }, evidence: { latestGap: 19 }, locale: 'pg', model: 'test-model', client });
  assert.match(client.requests[0].request.instructions, /Nigerian Pidgin/);
});

test('defense agent streams narrative deltas through the Responses API', async () => {
  const requests = [];
  const client = {
    requests,
    responses: {
      create: async (request, options) => {
        requests.push({ request, options });
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'response.output_text.delta', delta: 'Amara’s order is later. ' };
            yield { type: 'response.output_text.delta', delta: 'A check-in is timely.' };
          }
        };
      }
    }
  };
  const controller = new AbortController();
  const context = { insight: { title: 'Amara may be drifting away' }, evidence: { latestGap: 19, expectedCadence: 12 }, model: 'test-model', client, signal: controller.signal };
  const deltas = [];
  for await (const delta of streamDefenseNarrative(context)) deltas.push(delta);
  assert.deepEqual(deltas, ['Amara’s order is later. ', 'A check-in is timely.']);
  assert.equal(client.requests[0].request.stream, true);
  assert.equal('signal' in client.requests[0].request, false);
  assert.ok(client.requests[0].options.signal instanceof AbortSignal);
  assert.equal(client.requests[0].options.signal.aborted, false);
  controller.abort();
  assert.equal(client.requests[0].options.signal.aborted, true);
});

test('AI generation exposes a safe quota failure instead of provider text', async () => {
  const client = {
    responses: {
      create: async () => {
        const error = new Error('provider text that must not reach the browser');
        error.status = 429;
        error.error = { code: 'insufficient_quota', type: 'insufficient_quota' };
        throw error;
      }
    }
  };
  await assert.rejects(
    () => generateDefenseNarrative({ insight: { title: 'A' }, evidence: {}, client }),
    (error) => error.failureCode === 'aiQuotaExceeded' && error.httpStatus === 503 && error.message === 'ARIA AI request failed.'
  );
});

test('analysis falls back from an unavailable OpenAI response to Groq with the provider model', async () => {
  const openai = {
    responses: {
      create: async () => {
        const error = new Error('openai provider detail');
        error.status = 429;
        error.error = { code: 'insufficient_quota', type: 'insufficient_quota' };
        throw error;
      }
    }
  };
  const groq = fakeClient(['console.log(JSON.stringify({ source: "groq", eventCount: events.length }));']);
  const program = await generateAnalysisProgram({
    question: 'Which customers have gone quiet?',
    events: createSyntheticEvents(),
    client: openai,
    groqClient: groq,
    model: 'openai-test-model',
    groqModel: 'groq-test-model'
  });
  assert.match(program, /source: "groq"/);
  assert.equal(groq.requests.length, 1);
  assert.equal(groq.requests[0].request.model, 'groq-test-model');
  assert.doesNotMatch(groq.requests[0].request.input, /rawText/);
});

test('analysis falls back when OpenAI returns code the sandbox would reject', async () => {
  const openai = fakeClient(['process.exit(1); console.log(JSON.stringify({ eventCount: events.length }));']);
  const groq = fakeClient(['console.log(JSON.stringify({ source: "groq", eventCount: events.length }));']);
  const program = await generateAnalysisProgram({
    question: 'Which suppliers need attention?',
    events: createSyntheticEvents(),
    client: openai,
    groqClient: groq
  });
  assert.match(program, /source: "groq"/);
  assert.equal(openai.requests.length, 1);
  assert.equal(groq.requests.length, 1);
});

test('analysis falls back to Groq when an otherwise valid OpenAI program fails in the sandbox', async () => {
  const openai = fakeClient(['events.sort(() => 0); console.log(JSON.stringify({ source: "openai" }));']);
  const groq = fakeClient(['console.log(JSON.stringify({ source: "groq", eventCount: events.length }));']);
  const result = await runAnalysisProgram({
    question: 'Which customers have gone quiet?',
    events: createSyntheticEvents(),
    client: openai,
    groqClient: groq,
    sandbox: executeInSandbox
  });
  assert.equal(result.source, 'groq');
  assert.ok(result.eventCount > 0);
  assert.equal(openai.requests.length, 1);
  assert.equal(groq.requests.length, 1);
});

test('analysis bounds provider selection before the browser request deadline', async () => {
  const client = {
    responses: {
      create: async (_request, { signal }) => new Promise((_, reject) => {
        const abort = () => {
          const error = new Error('provider request aborted');
          error.name = 'APIUserAbortError';
          reject(error);
        };
        if (signal.aborted) abort();
        else signal.addEventListener('abort', abort, { once: true });
      })
    }
  };
  await assert.rejects(
    () => runAnalysisProgram({ question: 'Which customers have gone quiet?', events: createSyntheticEvents(), client, sandbox: executeInSandbox, providerSelectionTimeoutMs: 5 }),
    (error) => error.failureCode === 'aiTimedOut' && error.httpStatus === 504
  );
});

test('defense reports a single safe failure when both providers fail', async () => {
  const unavailable = (providerCode) => ({
    responses: {
      create: async () => {
        const error = new Error(`${providerCode} private failure`);
        error.status = 503;
        error.code = providerCode;
        throw error;
      }
    }
  });
  await assert.rejects(
    () => generateDefenseNarrative({ insight: { title: 'A' }, evidence: {}, client: unavailable('openai-down'), groqClient: unavailable('groq-down') }),
    (error) => error.failureCode === 'aiProvidersUnavailable'
      && error.providerFailures.length === 2
      && error.message === 'ARIA AI request failed.'
      && !JSON.stringify(error.providerFailures).includes('private failure')
  );
});

test('a rejected OpenAI request does not invoke Groq', async () => {
  let groqCalls = 0;
  const openai = {
    responses: {
      create: async () => {
        const error = new Error('bad request');
        error.status = 400;
        throw error;
      }
    }
  };
  const groq = {
    responses: {
      create: async () => {
        groqCalls += 1;
        return { output_text: 'would be unsafe to use' };
      }
    }
  };
  await assert.rejects(
    () => generateDefenseNarrative({ insight: { title: 'A' }, evidence: {}, client: openai, groqClient: groq }),
    (error) => error.failureCode === 'aiRequestRejected'
  );
  assert.equal(groqCalls, 0);
});

test('Defense stream falls back to Groq before the first text delta', async () => {
  const openai = {
    responses: {
      create: async () => ({
        async *[Symbol.asyncIterator]() {
          const error = new Error('connection lost before output');
          error.name = 'APIConnectionError';
          throw error;
        }
      })
    }
  };
  const groq = {
    responses: {
      create: async () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: 'response.output_text.delta', delta: 'Groq first. ' };
          yield { type: 'response.output_text.delta', delta: 'Groq second.' };
        }
      })
    }
  };
  const deltas = [];
  for await (const delta of streamDefenseNarrative({ insight: { title: 'A' }, evidence: {}, client: openai, groqClient: groq })) deltas.push(delta);
  assert.deepEqual(deltas, ['Groq first. ', 'Groq second.']);
});

test('Defense stream fails over when OpenAI stalls before the first text delta', async () => {
  let primaryWasAborted = false;
  const openai = {
    responses: {
      create: async (_request, options) => {
        options.signal.addEventListener('abort', () => { primaryWasAborted = true; }, { once: true });
        return {
          [Symbol.asyncIterator]() {
            return { next: () => new Promise(() => {}) };
          }
        };
      }
    }
  };
  const groq = {
    responses: {
      create: async () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: 'response.output_text.delta', delta: 'Groq recovered the explanation.' };
        }
      })
    }
  };
  const deltas = [];
  for await (const delta of streamDefenseNarrative({ insight: { title: 'A' }, evidence: {}, client: openai, groqClient: groq, firstDeltaTimeoutMs: 5 })) deltas.push(delta);
  assert.deepEqual(deltas, ['Groq recovered the explanation.']);
  assert.equal(primaryWasAborted, true);
});

test('Defense stream cancellation never invokes Groq', async () => {
  let groqCalls = 0;
  const controller = new AbortController();
  controller.abort();
  const openai = {
    responses: {
      create: async (_request, options) => {
        assert.equal(options.signal.aborted, true);
        throw new OpenAI.APIUserAbortError();
      }
    }
  };
  const groq = { responses: { create: async () => { groqCalls += 1; return null; } } };
  const stream = streamDefenseNarrative({ insight: { title: 'A' }, evidence: {}, client: openai, groqClient: groq, signal: controller.signal });
  await assert.rejects(() => stream.next(), (error) => error instanceof OpenAI.APIUserAbortError);
  assert.equal(groqCalls, 0);
});

test('Defense stream never switches providers after a text delta', async () => {
  let groqCalls = 0;
  const openai = {
    responses: {
      create: async () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: 'response.output_text.delta', delta: 'OpenAI first. ' };
          const error = new Error('connection lost after output');
          error.name = 'APIConnectionError';
          throw error;
        }
      })
    }
  };
  const groq = {
    responses: {
      create: async () => {
        groqCalls += 1;
        return { async *[Symbol.asyncIterator]() { yield { type: 'response.output_text.delta', delta: 'should not arrive' }; } };
      }
    }
  };
  const stream = streamDefenseNarrative({ insight: { title: 'A' }, evidence: {}, client: openai, groqClient: groq });
  const first = await stream.next();
  assert.equal(first.value, 'OpenAI first. ');
  await assert.rejects(() => stream.next(), (error) => error.failureCode === 'aiServiceUnavailable' && error.provider === 'openai');
  assert.equal(groqCalls, 0);
});
