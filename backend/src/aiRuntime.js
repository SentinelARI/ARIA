import OpenAI from 'openai';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-terra';
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-20b';
export const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

// Keep two sequential provider attempts inside the browser's 55 second request budget.
export const DEFAULT_PROVIDER_TIMEOUT_MS = 22_000;
const DEFAULT_MAX_RETRIES = 0;

const FALLBACK_FAILURE_CODES = new Set([
  'aiNotConfigured',
  'aiAuthenticationFailed',
  'aiAccessDenied',
  'aiModelUnavailable',
  'aiQuotaExceeded',
  'aiRateLimited',
  'aiTimedOut',
  'aiServiceUnavailable',
  'aiInvalidResponse'
]);

// These entries contain only operational error metadata; they never retain events or AI output.
const COOLDOWN_BY_FAILURE_CODE = Object.freeze({
  aiNotConfigured: 60_000,
  aiAuthenticationFailed: 5 * 60_000,
  aiAccessDenied: 5 * 60_000,
  aiModelUnavailable: 5 * 60_000,
  aiQuotaExceeded: 5 * 60_000,
  aiRateLimited: 30_000,
  aiTimedOut: 15_000,
  aiServiceUnavailable: 10_000
});

function normalizedEnvironmentValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function configuredOpenAIModel(environment = process.env) {
  return normalizedEnvironmentValue(environment.OPENAI_MODEL) || DEFAULT_OPENAI_MODEL;
}

export function configuredGroqModel(environment = process.env) {
  return normalizedEnvironmentValue(environment.GROQ_MODEL) || DEFAULT_GROQ_MODEL;
}

export function configuredOpenAIKey(environment = process.env) {
  return normalizedEnvironmentValue(environment.OPENAI_API_KEY) || null;
}

export function configuredGroqKey(environment = process.env) {
  return normalizedEnvironmentValue(environment.GROQ_API_KEY) || null;
}

export class AiFailure extends Error {
  constructor({ failureCode, httpStatus, provider = null, model = null, providerStatus = null, providerCode = null, providerType = null, providerRequestId = null, providerFailures = [] }) {
    super('ARIA AI request failed.');
    this.name = 'AiFailure';
    this.failureCode = failureCode;
    this.httpStatus = httpStatus;
    this.provider = provider;
    this.model = model;
    this.providerStatus = providerStatus;
    this.providerCode = providerCode;
    this.providerType = providerType;
    this.providerRequestId = providerRequestId;
    this.providerFailures = providerFailures;
  }
}

function unavailableConfiguration(provider, model) {
  return new AiFailure({ failureCode: 'aiNotConfigured', httpStatus: 503, provider, model });
}

export function createOpenAIClient(client, environment = process.env, model = configuredOpenAIModel(environment)) {
  if (client) return client;
  const apiKey = configuredOpenAIKey(environment);
  if (!apiKey) throw unavailableConfiguration('openai', model);
  return new OpenAI({ apiKey, timeout: DEFAULT_PROVIDER_TIMEOUT_MS, maxRetries: DEFAULT_MAX_RETRIES });
}

export function createGroqClient(client, environment = process.env, model = configuredGroqModel(environment)) {
  if (client) return client;
  const apiKey = configuredGroqKey(environment);
  if (!apiKey) throw unavailableConfiguration('groq', model);
  return new OpenAI({ apiKey, baseURL: GROQ_BASE_URL, timeout: DEFAULT_PROVIDER_TIMEOUT_MS, maxRetries: DEFAULT_MAX_RETRIES });
}

export function aiProviderDefinitions({ client, groqClient, environment, model, groqModel, runOpenAI, runGroq }) {
  return {
    openai: { model, run: runOpenAI },
    groq: groqClient || configuredGroqKey(environment)
      ? { model: groqModel, run: runGroq }
      : null,
    // Dependency-injected clients are test/local adapters. They must not inherit a production cooldown.
    bypassCooldown: Boolean(client || groqClient)
  };
}

export function aiRequestOptions(signal) {
  return signal ? { signal } : undefined;
}

function providerMetadata(error) {
  const providerStatus = Number.isInteger(error?.status) ? error.status : null;
  const providerCode = normalizedEnvironmentValue(error?.error?.code ?? error?.code).toLowerCase() || null;
  const providerType = normalizedEnvironmentValue(error?.error?.type ?? error?.type).toLowerCase() || null;
  const providerRequestId = normalizedEnvironmentValue(error?.request_id ?? error?.requestId ?? error?.requestID) || null;
  return { providerStatus, providerCode, providerType, providerRequestId };
}

function copyFailure(error, overrides = {}) {
  return new AiFailure({
    failureCode: error.failureCode,
    httpStatus: error.httpStatus,
    provider: error.provider,
    model: error.model,
    providerStatus: error.providerStatus,
    providerCode: error.providerCode,
    providerType: error.providerType,
    providerRequestId: error.providerRequestId,
    providerFailures: error.providerFailures,
    ...overrides
  });
}

function isOpenAIError(error, name) {
  const ErrorClass = OpenAI[name];
  const constructorName = normalizedEnvironmentValue(error?.constructor?.name).toLowerCase();
  return (typeof ErrorClass === 'function' && error instanceof ErrorClass) || constructorName === name.toLowerCase();
}

export function isRequestAbort(error) {
  const name = normalizedEnvironmentValue(error?.name).toLowerCase();
  const code = normalizedEnvironmentValue(error?.code ?? error?.cause?.code).toLowerCase();
  return isOpenAIError(error, 'APIUserAbortError')
    || name === 'apiuseraborterror'
    || name === 'aborterror'
    || code === 'abort_err'
    || code === 'aborted';
}

export function asAiFailure(error, { provider = null, model = null } = {}) {
  if (error instanceof AiFailure) {
    if ((!provider || error.provider) && (!model || error.model)) return error;
    return copyFailure(error, { provider: error.provider ?? provider, model: error.model ?? model });
  }

  const metadata = providerMetadata(error);
  const errorName = normalizedEnvironmentValue(error?.name).toLowerCase();
  const causeCode = normalizedEnvironmentValue(error?.cause?.code).toLowerCase();
  let failureCode = 'aiServiceUnavailable';
  let httpStatus = 503;

  if (metadata.providerCode === 'insufficient_quota' || metadata.providerType === 'insufficient_quota') {
    failureCode = 'aiQuotaExceeded';
  } else if (metadata.providerCode === 'model_not_found' || metadata.providerStatus === 404) {
    failureCode = 'aiModelUnavailable';
  } else if (metadata.providerStatus === 401) {
    failureCode = 'aiAuthenticationFailed';
  } else if (metadata.providerStatus === 403) {
    failureCode = 'aiAccessDenied';
  } else if (metadata.providerStatus === 400 || metadata.providerStatus === 413 || metadata.providerStatus === 422 || errorName === 'badrequesterror') {
    failureCode = 'aiRequestRejected';
    httpStatus = 502;
  } else if (metadata.providerStatus === 408 || isOpenAIError(error, 'APIConnectionTimeoutError') || errorName === 'apiconnectiontimeouterror' || errorName === 'timeouterror' || causeCode === 'etimedout') {
    failureCode = 'aiTimedOut';
    httpStatus = 504;
  } else if (metadata.providerStatus === 429) {
    failureCode = 'aiRateLimited';
    httpStatus = 429;
  } else if (metadata.providerStatus === 498 || (metadata.providerStatus && metadata.providerStatus >= 500)) {
    failureCode = 'aiServiceUnavailable';
  } else if (isOpenAIError(error, 'APIConnectionError') || errorName === 'apiconnectionerror' || causeCode === 'econnreset' || causeCode === 'enotfound') {
    failureCode = 'aiServiceUnavailable';
  }

  return new AiFailure({ failureCode, httpStatus, provider, model, ...metadata });
}

export function invalidAiResponseFailure({ provider = null, model = null } = {}) {
  return new AiFailure({ failureCode: 'aiInvalidResponse', httpStatus: 502, provider, model });
}

export function isFallbackEligible(error) {
  return error instanceof AiFailure && FALLBACK_FAILURE_CODES.has(error.failureCode);
}

function safeFailureDetails(error) {
  return {
    provider: error.provider,
    model: error.model,
    failureCode: error.failureCode,
    providerStatus: error.providerStatus,
    providerCode: error.providerCode,
    providerType: error.providerType,
    providerRequestId: error.providerRequestId
  };
}

export function aiFailureDiagnostics(error) {
  const failure = asAiFailure(error);
  return { ...safeFailureDetails(failure), providerFailures: failure.providerFailures };
}

export function allProvidersFailure(primaryFailure, fallbackFailure) {
  return new AiFailure({
    failureCode: 'aiProvidersUnavailable',
    httpStatus: 503,
    provider: fallbackFailure?.provider ?? primaryFailure?.provider ?? null,
    model: fallbackFailure?.model ?? primaryFailure?.model ?? null,
    providerStatus: fallbackFailure?.providerStatus ?? primaryFailure?.providerStatus ?? null,
    providerCode: fallbackFailure?.providerCode ?? primaryFailure?.providerCode ?? null,
    providerType: fallbackFailure?.providerType ?? primaryFailure?.providerType ?? null,
    providerRequestId: fallbackFailure?.providerRequestId ?? primaryFailure?.providerRequestId ?? null,
    providerFailures: [primaryFailure, fallbackFailure].filter(Boolean).map(safeFailureDetails)
  });
}

function cachedFailureWithoutRequestId(error) {
  return copyFailure(error, { providerRequestId: null });
}

export function createAiFailover({ now = () => Date.now() } = {}) {
  const cooldowns = new Map();

  function cachedFailure(provider) {
    const entry = cooldowns.get(provider);
    if (!entry) return null;
    if (entry.until <= now()) {
      cooldowns.delete(provider);
      return null;
    }
    return cachedFailureWithoutRequestId(entry.failure);
  }

  function recordFailure(provider, error) {
    const cooldownMs = COOLDOWN_BY_FAILURE_CODE[error.failureCode] ?? 0;
    if (!cooldownMs) return;
    cooldowns.set(provider, { until: now() + cooldownMs, failure: cachedFailureWithoutRequestId(error) });
  }

  function clearFailure(provider) {
    cooldowns.delete(provider);
  }

  async function attempt(provider, definition, shouldRecordCooldown) {
    if (!definition?.run) throw unavailableConfiguration(provider, definition?.model ?? null);
    try {
      const value = await definition.run();
      clearFailure(provider);
      return value;
    } catch (error) {
      if (isRequestAbort(error)) throw error;
      const failure = asAiFailure(error, { provider, model: definition.model ?? null });
      if (shouldRecordCooldown) recordFailure(provider, failure);
      throw failure;
    }
  }

  return {
    async run({ openai, groq = null, bypassCooldown = false }) {
      let primaryFailure = bypassCooldown ? null : cachedFailure('openai');
      if (!primaryFailure) {
        try {
          return { provider: 'openai', value: await attempt('openai', openai, !bypassCooldown) };
        } catch (error) {
          if (isRequestAbort(error)) throw error;
          primaryFailure = error;
        }
      }

      if (!groq || !isFallbackEligible(primaryFailure)) throw primaryFailure;

      let fallbackFailure = bypassCooldown ? null : cachedFailure('groq');
      if (!fallbackFailure) {
        try {
          return { provider: 'groq', value: await attempt('groq', groq, !bypassCooldown) };
        } catch (error) {
          if (isRequestAbort(error)) throw error;
          fallbackFailure = error;
        }
      }
      throw allProvidersFailure(primaryFailure, fallbackFailure);
    },
    reset() {
      cooldowns.clear();
    }
  };
}

const defaultAiFailover = createAiFailover();

export function runWithAiFallback(options) {
  return defaultAiFailover.run(options);
}

export function resetAiFailoverForTests() {
  defaultAiFailover.reset();
}
