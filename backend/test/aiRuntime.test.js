import assert from 'node:assert/strict';
import test from 'node:test';
import OpenAI from 'openai';
import { asAiFailure, configuredGroqKey, configuredGroqModel, configuredOpenAIKey, configuredOpenAIModel, createAiFailover, DEFAULT_GROQ_MODEL, DEFAULT_OPENAI_MODEL, isRequestAbort } from '../src/aiRuntime.js';

test('AI configuration uses the verified explicit model and trims environment values', () => {
  assert.equal(DEFAULT_OPENAI_MODEL, 'gpt-5.6-terra');
  assert.equal(configuredOpenAIModel({ OPENAI_MODEL: '  custom-model  ' }), 'custom-model');
  assert.equal(configuredOpenAIModel({ OPENAI_MODEL: '   ' }), DEFAULT_OPENAI_MODEL);
  assert.equal(configuredOpenAIKey({ OPENAI_API_KEY: '  test-key  ' }), 'test-key');
  assert.equal(configuredOpenAIKey({ OPENAI_API_KEY: '   ' }), null);
  assert.equal(DEFAULT_GROQ_MODEL, 'openai/gpt-oss-20b');
  assert.equal(configuredGroqModel({ GROQ_MODEL: '  groq-test-model  ' }), 'groq-test-model');
  assert.equal(configuredGroqModel({ GROQ_MODEL: '   ' }), DEFAULT_GROQ_MODEL);
  assert.equal(configuredGroqKey({ GROQ_API_KEY: '  groq-test-key  ' }), 'groq-test-key');
  assert.equal(configuredGroqKey({ GROQ_API_KEY: '   ' }), null);
});

test('AI errors map to stable safe categories', () => {
  const cases = [
    [{ status: 401 }, 'aiAuthenticationFailed', 503],
    [{ status: 403 }, 'aiAccessDenied', 503],
    [{ status: 404, error: { code: 'model_not_found' } }, 'aiModelUnavailable', 503],
    [{ status: 429, error: { code: 'insufficient_quota', type: 'insufficient_quota' } }, 'aiQuotaExceeded', 503],
    [{ status: 429, error: { code: 'rate_limit_exceeded' } }, 'aiRateLimited', 429],
    [{ name: 'APIConnectionTimeoutError' }, 'aiTimedOut', 504],
    [{ status: 400 }, 'aiRequestRejected', 502],
    [{ status: 498 }, 'aiServiceUnavailable', 503]
  ];
  for (const [source, failureCode, httpStatus] of cases) {
    const failure = asAiFailure(source);
    assert.equal(failure.failureCode, failureCode);
    assert.equal(failure.httpStatus, httpStatus);
    assert.equal(failure.message, 'ARIA AI request failed.');
  }
});

test('AI failures preserve provider-safe request IDs without retaining provider text', () => {
  const failure = asAiFailure({ status: 503, requestID: 'provider-request-id', message: 'do not expose this' }, { provider: 'groq', model: 'groq-test-model' });
  assert.equal(failure.provider, 'groq');
  assert.equal(failure.model, 'groq-test-model');
  assert.equal(failure.providerRequestId, 'provider-request-id');
  assert.equal(failure.message, 'ARIA AI request failed.');
});

test('OpenAI SDK abort and timeout classes are classified without a provider message', () => {
  const abort = new OpenAI.APIUserAbortError();
  const timeout = new OpenAI.APIConnectionTimeoutError();
  assert.equal(isRequestAbort(abort), true);
  assert.equal(asAiFailure(timeout).failureCode, 'aiTimedOut');
  assert.equal(asAiFailure(timeout).httpStatus, 504);
});

test('provider failover skips a cooldown primary after a known quota failure', async () => {
  let now = 1_000;
  let openaiCalls = 0;
  let groqCalls = 0;
  const failover = createAiFailover({ now: () => now });
  const openai = {
    model: 'openai-test',
    run: async () => {
      openaiCalls += 1;
      const error = new Error('provider detail');
      error.status = 429;
      error.error = { code: 'insufficient_quota', type: 'insufficient_quota' };
      throw error;
    }
  };
  const groq = { model: 'groq-test', run: async () => `groq-${++groqCalls}` };

  const first = await failover.run({ openai, groq });
  const second = await failover.run({ openai, groq });
  assert.deepEqual(first, { provider: 'groq', value: 'groq-1' });
  assert.deepEqual(second, { provider: 'groq', value: 'groq-2' });
  assert.equal(openaiCalls, 1);
  now += 5 * 60_000;
  await failover.run({ openai, groq });
  assert.equal(openaiCalls, 2);
});

test('provider failover does not mask a rejected request with a second provider', async () => {
  let groqCalls = 0;
  const failover = createAiFailover();
  await assert.rejects(
    () => failover.run({
      openai: { model: 'openai-test', run: async () => { const error = new Error('bad request'); error.status = 400; throw error; } },
      groq: { model: 'groq-test', run: async () => { groqCalls += 1; return 'unexpected'; } }
    }),
    (error) => error.failureCode === 'aiRequestRejected' && error.provider === 'openai'
  );
  assert.equal(groqCalls, 0);
});

test('provider failover does not call Groq or record a cooldown for an SDK abort', async () => {
  let openaiCalls = 0;
  let groqCalls = 0;
  const failover = createAiFailover();
  const definition = {
    openai: {
      model: 'openai-test',
      run: async () => {
        openaiCalls += 1;
        throw new OpenAI.APIUserAbortError();
      }
    },
    groq: { model: 'groq-test', run: async () => { groqCalls += 1; return 'unexpected'; } }
  };
  await assert.rejects(() => failover.run(definition), (error) => error instanceof OpenAI.APIUserAbortError);
  await assert.rejects(() => failover.run(definition), (error) => error instanceof OpenAI.APIUserAbortError);
  assert.equal(openaiCalls, 2);
  assert.equal(groqCalls, 0);
});
