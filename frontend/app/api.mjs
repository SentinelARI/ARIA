const LOCAL_API_ORIGIN = 'http://localhost:4000';
const DEFAULT_TIMEOUT_MS = 55_000;
const RETRYABLE_REASONING_ERRORS = new Set(['aiServiceUnavailable', 'aiTimedOut', 'aiRateLimited', 'aiProvidersUnavailable']);

function requestError(message, code, requestId = null) {
  const error = new Error(message);
  error.code = code;
  error.requestId = requestId;
  return error;
}

export function resolveApiOrigin(environment = process.env) {
  const configured = typeof environment.NEXT_PUBLIC_API_URL === 'string'
    ? environment.NEXT_PUBLIC_API_URL.trim().replace(/\/+$/, '')
    : '';
  if (configured) return configured;
  return environment.NODE_ENV === 'development' ? LOCAL_API_ORIGIN : null;
}

export function apiEndpoint(origin, path) {
  if (!origin) {
    throw requestError('The live ARIA API URL is not configured for this deployment.', 'apiNotConfigured');
  }
  return `${origin}${path}`;
}

export function normalizedRequestError(error) {
  if (error?.code) return error;
  return requestError('ARIA could not complete that request.', 'requestFailed', error?.requestId ?? null);
}

export function shouldRetryReasoningError(errorCode) {
  return RETRYABLE_REASONING_ERRORS.has(errorCode);
}

export function analysisResultFromPayload(payload) {
  if (!payload || typeof payload !== 'object' || !Object.hasOwn(payload, 'result')) {
    throw requestError('ARIA returned an invalid analysis response.', 'invalidApiResponse');
  }
  return payload.result;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw requestError('ARIA took too long to respond.', 'requestTimedOut');
    }
    if (options.signal?.aborted) throw error;
    throw normalizedRequestError(error);
  } finally {
    globalThis.clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}

export async function readJsonResponse(response) {
  const requestId = response.headers.get('x-request-id');
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    throw requestError(
      response.ok ? 'ARIA returned an invalid response.' : `ARIA returned an unusable ${response.status} response.`,
      response.ok ? 'invalidApiResponse' : 'apiGatewayError',
      requestId
    );
  }
  if (!response.ok) {
    throw requestError(
      typeof payload?.error === 'string' ? payload.error : 'ARIA could not complete that request.',
      typeof payload?.errorCode === 'string' ? payload.errorCode : 'requestFailed',
      payload?.requestId ?? requestId
    );
  }
  return payload;
}
