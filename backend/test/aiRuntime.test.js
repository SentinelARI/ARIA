import assert from 'node:assert/strict';
import test from 'node:test';
import { asAiFailure, configuredOpenAIKey, configuredOpenAIModel, DEFAULT_OPENAI_MODEL } from '../src/aiRuntime.js';

test('AI configuration uses the verified explicit model and trims environment values', () => {
  assert.equal(DEFAULT_OPENAI_MODEL, 'gpt-5.6-terra');
  assert.equal(configuredOpenAIModel({ OPENAI_MODEL: '  custom-model  ' }), 'custom-model');
  assert.equal(configuredOpenAIModel({ OPENAI_MODEL: '   ' }), DEFAULT_OPENAI_MODEL);
  assert.equal(configuredOpenAIKey({ OPENAI_API_KEY: '  test-key  ' }), 'test-key');
  assert.equal(configuredOpenAIKey({ OPENAI_API_KEY: '   ' }), null);
});

test('AI errors map to stable safe categories', () => {
  const cases = [
    [{ status: 401 }, 'aiAuthenticationFailed', 503],
    [{ status: 403 }, 'aiAccessDenied', 503],
    [{ status: 404, error: { code: 'model_not_found' } }, 'aiModelUnavailable', 503],
    [{ status: 429, error: { code: 'insufficient_quota', type: 'insufficient_quota' } }, 'aiQuotaExceeded', 503],
    [{ status: 429, error: { code: 'rate_limit_exceeded' } }, 'aiRateLimited', 429],
    [{ name: 'APIConnectionTimeoutError' }, 'aiTimedOut', 504]
  ];
  for (const [source, failureCode, httpStatus] of cases) {
    const failure = asAiFailure(source);
    assert.equal(failure.failureCode, failureCode);
    assert.equal(failure.httpStatus, httpStatus);
    assert.equal(failure.message, 'ARIA AI request failed.');
  }
});
