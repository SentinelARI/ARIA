import cors from 'cors';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { createSyntheticMerchantData, demoMerchants } from './data.js';
import { createMorningBrief, createTrustLedger, rederiveDefenseEvidence, summarizePrioritization, deriveCandidates, prioritize } from './agents.js';
import { generateAnalysisProgram, generateDefenseNarrative, streamDefenseNarrative } from './ai.js';
import reasoningModule from './reasoningAgent.js';
const { enrichCandidates } = reasoningModule;
import { executeInSandbox } from './sandbox.js';

const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
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
  serviceUnavailable: 'ARIA no dey available now. Abeg try again soon.'
});

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

function lagosDayKey(referenceDate) {
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Lagos' }).format(referenceDate);
}

function cachedCandidateFor(cache, merchantId, insightId, referenceDate) {
  const cachedBrief = cache.get(merchantId);
  if (!cachedBrief || cachedBrief.referenceDay !== lagosDayKey(referenceDate)) return null;
  return cachedBrief.candidates.find((candidate) => candidate.id === insightId) ?? null;
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

function errorCode(message, fallback = 'serviceUnavailable') {
  if (message.startsWith('Ask a business question between')) return 'invalidQuestion';
  if (message.startsWith('ARIA cannot access')) return 'unsafeQuestion';
  if (message.startsWith('ARIA only analyzes')) return 'offTopicQuestion';
  if (message === 'Merchant not found.') return 'merchantNotFound';
  if (message === 'Insight not found in the current signal set.' || message.startsWith('Choose a surfaced insight')) return 'insightNotFound';
  return fallback;
}

function errorPayload(error, locale, fallbackCode) {
  const message = messageFor(error);
  const code = errorCode(message, fallbackCode);
  return { error: locale === 'pg' ? pidginErrors[code] ?? pidginErrors.serviceUnavailable : message, errorCode: code };
}

function sendError(response, status, error, locale, fallbackCode) {
  return response.status(status).json(errorPayload(error, locale, fallbackCode));
}

export function createApp({ merchantData = createSyntheticMerchantData, clock = () => new Date(), analysisProgram = generateAnalysisProgram, defenseNarrative = generateDefenseNarrative, defenseStream = streamDefenseNarrative, sandbox = executeInSandbox, reasoningEnrichment = enrichCandidates, rateLimitMaximum = 10, defenseRateLimitMaximum = 20 } = {}) {
  const app = express();
  const analysisRequests = new Map();
  const defenseRequests = new Map();
  const briefEnrichmentCache = new Map();

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
  app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : process.env.NODE_ENV === 'production' ? false : true, methods: ['GET', 'POST'], maxAge: 86_400 }));
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
      try {
        const enrichment = await reasoningEnrichment({ candidates: baseCandidates, events });
        if (enrichment && enrichment.reasoningStatus === 'ok' && Array.isArray(enrichment.candidates)) {
          enrichedCandidates = enrichment.candidates;
          reasoningStatus = 'ok';
          briefEnrichmentCache.set(merchant.id, { referenceDay: lagosDayKey(referenceDate), candidates: enrichedCandidates });
        } else {
          briefEnrichmentCache.delete(merchant.id);
        }
      } catch (err) {
        // defense-in-depth: ensure failures from enrichment don't break the brief
        reasoningStatus = 'unavailable';
        briefEnrichmentCache.delete(merchant.id);
      }
      const actions = prioritize(enrichedCandidates);
      return response.json({ merchant, merchants: demoMerchants, simulatedAt: referenceDate.toISOString(), generatedAt: new Date().toISOString(), actions, prioritySummary: summarizePrioritization(events, referenceDate), ledger: createTrustLedger(events), reasoningStatus });
    } catch (error) {
      return sendError(response, 404, error, locale, 'merchantNotFound');
    }
  });
  app.post('/api/defense', defenseRateLimit, async (request, response) => {
    const locale = requestLocale(request);
    try {
      if (typeof request.body?.insightId !== 'string') return sendError(response, 400, new Error('Choose a surfaced insight to re-check.'), locale, 'insightNotFound');
      const referenceDate = referenceDateFrom(clock);
      const { merchant, events } = resolveMerchant(merchantData, request.body.merchantId, referenceDate);
      const defense = rederiveDefenseEvidence(events, request.body.insightId, referenceDate);
      const providedReasoning = typeof request.body?.reasoning === 'string' ? request.body.reasoning : null;
      const providedCrossSignals = Array.isArray(request.body?.crossSignals) ? request.body.crossSignals : null;
      let cachedReasoning = null;
      let cachedCrossSignals = null;
      if (!providedReasoning) {
        const cachedCandidate = cachedCandidateFor(briefEnrichmentCache, merchant.id, defense.insightId, referenceDate);
        if (cachedCandidate) {
          cachedReasoning = cachedCandidate.reasoning;
          cachedCrossSignals = cachedCandidate.crossSignals;
        }
      }
      if (providedReasoning || cachedReasoning) {
        defense.evidence = {
          ...defense.evidence,
          enrichedReasoning: providedReasoning ?? cachedReasoning,
          crossSignals: providedCrossSignals ?? cachedCrossSignals ?? []
        };
      }
      const narrative = await defenseNarrative({ ...defense, locale });
      return response.json({ insightId: defense.insightId, narrative, confidence: defense.confidence, recalculatedAt: defense.recalculatedAt });
    } catch (error) {
      const message = messageFor(error);
      const status = message === 'Insight not found in the current signal set.' || message === 'Merchant not found.' ? 404 : 503;
      return sendError(response, status, error, locale);
    }
  });
  app.post('/api/defense/stream', defenseRateLimit, async (request, response) => {
    const locale = requestLocale(request);
    try {
      if (typeof request.body?.insightId !== 'string') return sendError(response, 400, new Error('Choose a surfaced insight to re-check.'), locale, 'insightNotFound');
      const referenceDate = referenceDateFrom(clock);
      const { merchant, events } = resolveMerchant(merchantData, request.body.merchantId, referenceDate);
      const defense = rederiveDefenseEvidence(events, request.body.insightId, referenceDate);
      const providedReasoning = typeof request.body?.reasoning === 'string' ? request.body.reasoning : null;
      const providedCrossSignals = Array.isArray(request.body?.crossSignals) ? request.body.crossSignals : null;
      let cachedReasoning = null;
      let cachedCrossSignals = null;
      if (!providedReasoning) {
        const cachedCandidate = cachedCandidateFor(briefEnrichmentCache, merchant.id, defense.insightId, referenceDate);
        if (cachedCandidate) {
          cachedReasoning = cachedCandidate.reasoning;
          cachedCrossSignals = cachedCandidate.crossSignals;
        }
      }
      if (providedReasoning || cachedReasoning) {
        defense.evidence = {
          ...defense.evidence,
          enrichedReasoning: providedReasoning ?? cachedReasoning,
          crossSignals: providedCrossSignals ?? cachedCrossSignals ?? []
        };
      }
      const controller = new AbortController();
      request.on('aborted', () => controller.abort());
      response.status(200).set({
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no'
      });
      response.flushHeaders();
      sendEvent(response, 'meta', { insightId: defense.insightId, confidence: defense.confidence, recalculatedAt: defense.recalculatedAt });
      for await (const delta of defenseStream({ ...defense, locale, signal: controller.signal })) sendEvent(response, 'delta', { delta });
      sendEvent(response, 'done', { confidence: defense.confidence, recalculatedAt: defense.recalculatedAt });
      return response.end();
    } catch (error) {
      if (!response.headersSent) {
        const message = messageFor(error);
        const status = message === 'Insight not found in the current signal set.' || message === 'Merchant not found.' ? 404 : 503;
        return sendError(response, status, error, locale);
      }
      sendEvent(response, 'error', errorPayload(error, locale));
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
      const status = message.startsWith('Ask a business') || message.startsWith('ARIA cannot') || message.startsWith('ARIA only') ? 400 : message === 'Merchant not found.' ? 404 : 422;
      return sendError(response, status, error, locale);
    }
  });
  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return sendError(response, 400, new Error('Send valid JSON.'), 'en', 'invalidJson');
    return sendError(response, 500, new Error('ARIA could not complete that request.'), 'en');
  });
  return app;
}

export const app = createApp();

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`ARIA API listening on ${port}`));
}
