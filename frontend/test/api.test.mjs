import assert from 'node:assert/strict';
import test from 'node:test';
import { analysisResultFromPayload, apiEndpoint, readJsonResponse, resolveApiOrigin, shouldRetryReasoningError } from '../app/api.mjs';

test('API origin uses an explicit public API URL and never silently uses localhost in production', () => {
  assert.equal(resolveApiOrigin({ NEXT_PUBLIC_API_URL: ' https://aria-api.example.com/ ', NODE_ENV: 'production' }), 'https://aria-api.example.com');
  assert.equal(resolveApiOrigin({ NODE_ENV: 'development' }), 'http://localhost:4000');
  assert.equal(resolveApiOrigin({ NODE_ENV: 'production' }), null);
  assert.throws(() => apiEndpoint(null, '/api/brief'), { code: 'apiNotConfigured' });
});

test('brief retries only transient reasoning-provider failures', () => {
  assert.equal(shouldRetryReasoningError('aiServiceUnavailable'), true);
  assert.equal(shouldRetryReasoningError('aiTimedOut'), true);
  assert.equal(shouldRetryReasoningError('aiProvidersUnavailable'), true);
  assert.equal(shouldRetryReasoningError('aiQuotaExceeded'), false);
  assert.equal(shouldRetryReasoningError('aiAuthenticationFailed'), false);
});

test('analysis responses must carry an explicit result field', () => {
  assert.deepEqual(analysisResultFromPayload({ result: { quietCustomers: [] } }), { quietCustomers: [] });
  assert.equal(analysisResultFromPayload({ result: null }), null);
  assert.throws(() => analysisResultFromPayload({}), { code: 'invalidApiResponse' });
});

test('API response parsing preserves safe API errors and handles HTML gateway failures', async () => {
  const quotaResponse = new Response(JSON.stringify({ error: 'safe quota message', errorCode: 'aiQuotaExceeded', requestId: 'server-request' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'header-request' }
  });
  await assert.rejects(
    () => readJsonResponse(quotaResponse),
    (error) => error.code === 'aiQuotaExceeded' && error.message === 'safe quota message' && error.requestId === 'server-request'
  );

  const gatewayResponse = new Response('<html>gateway failure</html>', { status: 502, headers: { 'Content-Type': 'text/html', 'X-Request-Id': 'gateway-request' } });
  await assert.rejects(
    () => readJsonResponse(gatewayResponse),
    (error) => error.code === 'apiGatewayError' && error.requestId === 'gateway-request'
  );
});
