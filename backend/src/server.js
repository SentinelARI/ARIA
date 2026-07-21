import cors from 'cors';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { createSyntheticMerchantData, demoMerchants } from './data.js';
import { createTrustLedger, rederiveDefenseEvidence, summarizePrioritization, deriveCandidates, prioritize } from './agents.js';
import { generateAnalysisProgram, generateDefenseNarrative, streamDefenseNarrative } from './ai.js';
import reasoningModule from './reasoningAgent.js';
const { enrichCandidates } = reasoningModule;
import { executeInSandbox } from './sandbox.js';
import { AiFailure, configuredOpenAIModel } from './aiRuntime.js';

const businessTerms = /\b(sale|sales|customer|customers|client|clients|order|orders|inventory|stock|supplier|suppliers|price|prices|pricing|purchase|purchases|revenue|payment|payments|product|products|buyer|buyers|buy|buying|market|money|quiet)\b/i;
const unsafeQuestionPattern = /(?:ignore|disregard).{0,80}(?:instruction|rule)|(?:api|secret|access)\s*key|system\s+prompt/i;
const pidginErrors = Object.freeze({
  invalidQuestion: 'Ask business question wey get between 3 and 300 character.',
  unsafeQuestion: 'ARIA no fit access secret or follow instruction-like request. Ask about sales, customer, stock, price, or supplier.',
  offTopicQuestion: 'ARIA only dey analyze this merchant sales, customer, stock, price, and supplier - no be general knowledge.',
  merchantNotFound: 'This demo merchant no dey.',
  insightNotFound: 'Choose insight wey show make ARIA check am again.',
  rateLimitAnalysis: 'Abeg wait one minute before you run more analysis.',
  rateLimitDefense: 'Abeg wait one minute before you ask ARIA make e check another action.',
  invalidJson: 'Send correct JSON.',
  serviceUnavailable: 'ARIA no dey available now. Abeg try again soon.',
  analysisFailed: 'ARIA no fit run this analysis safely. Try ask am another business question.',
  aiNotConfigured: 'Person wey manage ARIA never set the AI service well.',
  aiAuthenticationFailed: 'The AI service reject ARIA configuration. Person wey manage am need check the API key.',
  aiAccessDenied: 'This API key no get permission to use the AI service wey ARIA need.',
  aiModelUnavailable: 'The AI model wey ARIA configure no dey available for this project. Person wey manage am need choose another model.',
  aiQuotaExceeded: 'This AI project don finish API quota. Person wey manage am need add billing or credit before e fit work again.',
  aiRateLimited: 'The AI service get too many request now. Abeg try again shortly.',
  aiTimedOut: 'The AI service take too long to answer. Abeg try again.',
  aiInvalidResponse: 'The AI service return answer wey ARIA no fit use safely. Abeg try again.',
  aiServiceUnavailable: 'ARIA no dey available now. Abeg try again soon.'
});

const englishErrors = Object.freeze({
  invalidJson: 'Send valid JSON.',
  serviceUnavailable: 'ARIA is temporarily unavailable. Please try again shortly.',
  analysisFailed: 'ARIA could not safely complete that analysis. Try a more specific business question.',
  aiNotConfigured: 'The AI service has not been configured on the server.',
  aiAuthenticationFailed: 'The AI service rejected the server configuration. The operator should verify the API key.',
  aiAccessDenied: 'This API key does not have permission to use the configured AI service.',
  aiModelUnavailable: 'The configured AI model is unavailable for this project. The operator should choose an accessible model.',
  aiQuotaExceeded: 'This AI project has no available API quota. The operator must add billing or credits before live AI can run.',
  aiRateLimited: 'The AI service is receiving too many requests. Please try again shortly.',
  aiTimedOut: 'The AI service took too long to respond. Please try again.',
  aiInvalidResponse: 'The AI service returned a response ARIA could not safely use. Please try again.',
  aiServiceUnavailable: 'ARIA is temporarily unavailable. Please try again shortly.'
});

function normalizeOrigin(value) {
  const origin = value.trim();
  const parsed = new URL(origin);
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password || (parsed.pathname !== '/' && parsed.pathname !== '') || parsed.search || parsed.hash) {
    throw new Error('FRONTEND_ORIGIN entries must be complete HTTP(S) origins without a path.');
  }
  return parsed.origin;
}

export function configuredAllowedOrigins(value = process.env.FRONTEND_ORIGIN) {
  if (!value?.trim()) return [];
  return [...new Set(value.split(',').map((origin) => origin.trim()).filter(Boolean).map(normalizeOrigin))];
}

function resolveMerchant(merchantData, merchantId, referenceDate) {
  const datasets = typeof merchantData === 'function' ? merchantData(referenceDate) : merchantData;
  const dataset = datasets.get(merchantId ?? demoMerchants[0].id);
  if (!dataset) throw new Error('Merchant not found.');
  return dataset;
}

function referenceDateFrom(clock) {
  const referenceDate = new Date(clock());
  if (Number.isNaN(referenceDate.getTime())) throw new Error('ARIA could not determine the current time.');
  return referenceDate;
}

function localeFor(value) {
  return value === 'pg' ? 'pg' : 'en';
}

function requestLocale(request) {
  return localeFor(request.body?.locale ?? request.query?.locale);
}

function validateQuestion(question) {
  if (typeof question !== 'string' || question.trim().length < 3 || question.length > 300) throw new Error('Ask a business question between 3 and 300 characters.');
  const normalizedQuestion = question.trim();
  if (unsafeQuestionPattern.test(normalizedQuestion)) throw new Error('ARIA cannot access secrets or follow instruction-like requests. Ask about the merchant’s sales, customers, stock, prices, or suppliers.');
  if (!businessTerms.test(normalizedQuestion)) throw new Error('ARIA only analyzes this merchant’s sales, customers, stock, prices, and suppliers—not general knowledge.');
  return normalizedQuestion;
}

function sendEvent(response, event, payload) {
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function messageFor(error) {
  return error instanceof Error ? error.message : 'ARIA could not complete that request.';
}

function errorCode(error, fallback = 'serviceUnavailable') {
  if (error instanceof AiFailure) return error.failureCode;
  const message = messageFor(error);
  if (message.startsWith('Ask a business question between')) return 'invalidQuestion';
  if (message.startsWith('ARIA cannot access')) return 'unsafeQuestion';
  if (message.startsWith('ARIA only analyzes')) return 'offTopicQuestion';
  if (message === 'Merchant not found.') return 'merchantNotFound';
  if (message === 'Insight not found in the current signal set.' || message.startsWith('Choose a surfaced insight')) return 'insightNotFound';
  return fallback;
}

function publicErrorMessage(code, locale, fallback) {
  const messages = locale === 'pg' ? pidginErrors : englishErrors;
  return messages[code] ?? fallback;
}

function errorPayload(error, locale, fallbackCode, requestId) {
  const message = messageFor(error);
  const code = errorCode(error, fallbackCode);
  return { error: publicErrorMessage(code, locale, message), errorCode: code, requestId };
}

function logAiFailure(response, operation, error) {
  if (!(error instanceof AiFailure)) return;
  response.locals.logger?.error?.(JSON.stringify({
    event: 'aria.ai_failure',
    operation,
    requestId: response.locals.requestId,
    failureCode: error.failureCode,
    providerStatus: error.providerStatus,
    providerCode: error.providerCode,
    providerType: error.providerType,
    providerRequestId: error.providerRequestId,
    model: configuredOpenAIModel()
  }));
}

function sendError(response, status, error, locale, fallbackCode, operation = 'request') {
  logAiFailure(response, operation, error);
  return response.status(status).json(errorPayload(error, locale, fallbackCode, response.locals.requestId));
}

export function createApp({ merchantData = createSyntheticMerchantData, clock = () => new Date(), analysisProgram = generateAnalysisProgram, defenseNarrative = generateDefenseNarrative, defenseStream = streamDefenseNarrative, sandbox = executeInSandbox, reasoningEnrichment = enrichCandidates, rateLimitMaximum = 10, defenseRateLimitMaximum = 20, corsOrigins = configuredAllowedOrigins(), isProduction = process.env.NODE_ENV === 'production', logger = console } = {}) {
  const app = express();
  const analysisRequests = new Map();
  const defenseRequests = new Map();

  function rateLimit(requests, maximumRequests, errorMessage, errorCodeValue) {
    return function applyRateLimit(request, response, next) {
    const now = Date.now();
    const key = request.ip ?? 'unknown';
    const windowMs = 60_000;
      const entry = requests.get(key);
    const current = !entry || now - entry.startedAt >= windowMs ? { startedAt: now, count: 0 } : entry;
    current.count += 1;
      requests.set(key, current);
      response.set('RateLimit-Limit', String(maximumRequests));
      response.set('RateLimit-Remaining', String(Math.max(0, maximumRequests - current.count)));
      if (current.count > maximumRequests) return sendError(response, 429, new Error(errorMessage), requestLocale(request), errorCodeValue);
    return next();
    };
  }

  const analysisRateLimit = rateLimit(analysisRequests, rateLimitMaximum, 'Please wait a minute before running more analyses.', 'rateLimitAnalysis');
  const defenseRateLimit = rateLimit(defenseRequests, defenseRateLimitMaximum, 'Please wait a minute before asking ARIA to re-check another action.', 'rateLimitDefense');

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((request, response, next) => {
    response.locals.requestId = randomUUID();
    response.locals.logger = logger;
    response.set('X-Request-Id', response.locals.requestId);
    next();
  });
  app.use(cors({ origin: corsOrigins.length ? corsOrigins : isProduction ? false : true, methods: ['GET', 'POST'], maxAge: 86_400 }));
  app.use(express.json({ limit: '8kb', strict: true }));

  app.get('/health', (_request, response) => response.json({ status: 'ok', sandbox: 'isolated-vm' }));
  app.get('/api/merchants', (_request, response) => response.json({ merchants: demoMerchants }));
  app.get('/api/brief', async (request, response) => {
    const locale = requestLocale(request);
    try {
      const referenceDate = referenceDateFrom(clock);
      const { merchant, events } = resolveMerchant(merchantData, request.query.merchant, referenceDate);
      // derive deterministic candidates first
      const baseCandidates = deriveCandidates(events, referenceDate);
      let enrichedCandidates = baseCandidates;
      let reasoningStatus = 'unavailable';
      let reasoningError = null;
      try {
        const enrichment = await reasoningEnrichment({ candidates: baseCandidates, events });
        if (enrichment && enrichment.reasoningStatus === 'ok' && Array.isArray(enrichment.candidates)) {
          enrichedCandidates = enrichment.candidates;
          reasoningStatus = 'ok';
        } else {
          reasoningError = enrichment?.reasoningError ?? 'aiServiceUnavailable';
        }
      } catch (err) {
        // Deterministic prioritization remains available when optional enrichment fails.
        reasoningStatus = 'unavailable';
        reasoningError = err instanceof AiFailure ? err.failureCode : 'aiInvalidResponse';
      }
      if (reasoningStatus !== 'ok') {
        response.locals.logger?.error?.(JSON.stringify({
          event: 'aria.reasoning_unavailable',
          requestId: response.locals.requestId,
          failureCode: reasoningError,
          model: configuredOpenAIModel()
        }));
      }
      const actions = prioritize(enrichedCandidates);
      return response.json({ merchant, merchants: demoMerchants, simulatedAt: referenceDate.toISOString(), generatedAt: new Date().toISOString(), actions, prioritySummary: summarizePrioritization(events, referenceDate), ledger: createTrustLedger(events), reasoningStatus, ...(reasoningError ? { reasoningError } : {}) });
    } catch (error) {
      const status = messageFor(error) === 'Merchant not found.' ? 404 : error instanceof AiFailure ? error.httpStatus : 500;
      return sendError(response, status, error, locale, messageFor(error) === 'Merchant not found.' ? 'merchantNotFound' : 'serviceUnavailable', 'brief');
    }
  });
  app.post('/api/defense', defenseRateLimit, async (request, response) => {
    const locale = requestLocale(request);
    try {
      if (typeof request.body?.insightId !== 'string') return sendError(response, 400, new Error('Choose a surfaced insight to re-check.'), locale, 'insightNotFound');
      const referenceDate = referenceDateFrom(clock);
      const { events } = resolveMerchant(merchantData, request.body.merchantId, referenceDate);
      const defense = rederiveDefenseEvidence(events, request.body.insightId, referenceDate);
      const narrative = await defenseNarrative({ ...defense, locale });
      return response.json({ insightId: defense.insightId, narrative, confidence: defense.confidence, recalculatedAt: defense.recalculatedAt });
    } catch (error) {
      const message = messageFor(error);
      const status = message === 'Insight not found in the current signal set.' || message === 'Merchant not found.' ? 404 : error instanceof AiFailure ? error.httpStatus : 503;
      return sendError(response, status, error, locale, undefined, 'defense');
    }
  });
  app.post('/api/defense/stream', defenseRateLimit, async (request, response) => {
    const locale = requestLocale(request);
    try {
      if (typeof request.body?.insightId !== 'string') return sendError(response, 400, new Error('Choose a surfaced insight to re-check.'), locale, 'insightNotFound');
      const referenceDate = referenceDateFrom(clock);
      const { events } = resolveMerchant(merchantData, request.body.merchantId, referenceDate);
      const defense = rederiveDefenseEvidence(events, request.body.insightId, referenceDate);
      const controller = new AbortController();
      request.on('aborted', () => controller.abort());
      const narrativeStream = defenseStream({ ...defense, locale, signal: controller.signal });
      const firstChunk = await narrativeStream.next();
      response.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      response.flushHeaders();
      sendEvent(response, 'meta', { insightId: defense.insightId, confidence: defense.confidence, recalculatedAt: defense.recalculatedAt });
      if (!firstChunk.done) sendEvent(response, 'delta', { delta: firstChunk.value });
      for await (const delta of narrativeStream) sendEvent(response, 'delta', { delta });
      sendEvent(response, 'done', { confidence: defense.confidence, recalculatedAt: defense.recalculatedAt });
      return response.end();
    } catch (error) {
      if (!response.headersSent) {
        const message = messageFor(error);
        const status = message === 'Insight not found in the current signal set.' || message === 'Merchant not found.' ? 404 : error instanceof AiFailure ? error.httpStatus : 503;
        return sendError(response, status, error, locale, undefined, 'defense_stream');
      }
      logAiFailure(response, 'defense_stream', error);
      sendEvent(response, 'error', errorPayload(error, locale, undefined, response.locals.requestId));
      return response.end();
    }
  });
  app.post('/api/analysis', analysisRateLimit, async (request, response) => {
    const locale = requestLocale(request);
    try {
      const question = validateQuestion(request.body?.question);
      const referenceDate = referenceDateFrom(clock);
      const { events } = resolveMerchant(merchantData, request.body?.merchantId, referenceDate);
      const code = await analysisProgram({ question, events });
      const result = await sandbox(code);
      return response.json({ result, generatedCode: code });
    } catch (error) {
      const message = messageFor(error);
      const isQuestionError = message.startsWith('Ask a business') || message.startsWith('ARIA cannot') || message.startsWith('ARIA only');
      const status = isQuestionError ? 400 : message === 'Merchant not found.' ? 404 : error instanceof AiFailure ? error.httpStatus : 422;
      const fallbackCode = isQuestionError || message === 'Merchant not found.' ? undefined : error instanceof AiFailure ? undefined : 'analysisFailed';
      return sendError(response, status, error, locale, fallbackCode, 'analysis');
    }
  });
  app.use((error, request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return sendError(response, 400, new Error('Send valid JSON.'), requestLocale(request), 'invalidJson');
    return sendError(response, 500, new Error('ARIA could not complete that request.'), requestLocale(request), 'serviceUnavailable');
  });
  return app;
}

export const app = createApp();

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`ARIA API listening on ${port}`));
}
