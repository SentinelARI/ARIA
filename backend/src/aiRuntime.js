import OpenAI from 'openai';

export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-terra';

const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 0;

function normalizedEnvironmentValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function configuredOpenAIModel(environment = process.env) {
  return normalizedEnvironmentValue(environment.OPENAI_MODEL) || DEFAULT_OPENAI_MODEL;
}

export function configuredOpenAIKey(environment = process.env) {
  return normalizedEnvironmentValue(environment.OPENAI_API_KEY) || null;
}

export class AiFailure extends Error {
  constructor({ failureCode, httpStatus, providerStatus = null, providerCode = null, providerType = null, providerRequestId = null }) {
    super('ARIA AI request failed.');
    this.name = 'AiFailure';
    this.failureCode = failureCode;
    this.httpStatus = httpStatus;
    this.providerStatus = providerStatus;
    this.providerCode = providerCode;
    this.providerType = providerType;
    this.providerRequestId = providerRequestId;
  }
}

export function createOpenAIClient(client, environment = process.env) {
  if (client) return client;
  const apiKey = configuredOpenAIKey(environment);
  if (!apiKey) {
    throw new AiFailure({ failureCode: 'aiNotConfigured', httpStatus: 503 });
  }
  return new OpenAI({ apiKey, timeout: DEFAULT_TIMEOUT_MS, maxRetries: DEFAULT_MAX_RETRIES });
}

function providerMetadata(error) {
  const providerStatus = Number.isInteger(error?.status) ? error.status : null;
  const providerCode = normalizedEnvironmentValue(error?.error?.code ?? error?.code).toLowerCase() || null;
  const providerType = normalizedEnvironmentValue(error?.error?.type ?? error?.type).toLowerCase() || null;
  const providerRequestId = normalizedEnvironmentValue(error?.request_id ?? error?.requestId) || null;
  return { providerStatus, providerCode, providerType, providerRequestId };
}

export function asAiFailure(error) {
  if (error instanceof AiFailure) return error;

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
  } else if (metadata.providerStatus === 429) {
    failureCode = 'aiRateLimited';
    httpStatus = 429;
  } else if (errorName === 'apiconnectiontimeouterror' || errorName === 'timeouterror' || causeCode === 'etimedout') {
    failureCode = 'aiTimedOut';
    httpStatus = 504;
  } else if (metadata.providerStatus && metadata.providerStatus >= 500) {
    failureCode = 'aiServiceUnavailable';
  } else if (errorName === 'apiconnectionerror' || causeCode === 'econnreset' || causeCode === 'enotfound') {
    failureCode = 'aiServiceUnavailable';
  }

  return new AiFailure({ failureCode, httpStatus, ...metadata });
}

export function invalidAiResponseFailure() {
  return new AiFailure({ failureCode: 'aiInvalidResponse', httpStatus: 502 });
}
