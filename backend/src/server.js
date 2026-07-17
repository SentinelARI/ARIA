import cors from 'cors';
import express from 'express';
import { pathToFileURL } from 'node:url';
import { createSyntheticMerchantData, demoMerchants, demoReferenceDate } from './data.js';
import { createMorningBrief, createTrustLedger, rederiveDefenseEvidence, summarizePrioritization } from './agents.js';
import { generateAnalysisProgram, generateDefenseNarrative, streamDefenseNarrative } from './ai.js';
import { executeInSandbox } from './sandbox.js';

const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);
const businessTerms = /\b(sale|sales|customer|customers|client|clients|order|orders|inventory|stock|supplier|suppliers|price|prices|pricing|purchase|purchases|revenue|payment|payments|product|products|buyer|buyers)\b/i;
const unsafeQuestionPattern = /(?:ignore|disregard).{0,80}(?:instruction|rule)|(?:api|secret|access)\s*key|system\s+prompt/i;

function resolveMerchant(merchantData, merchantId) {
  const dataset = merchantData.get(merchantId ?? demoMerchants[0].id);
  if (!dataset) throw new Error('Merchant not found.');
  return dataset;
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

export function createApp({ merchantData = createSyntheticMerchantData(), analysisProgram = generateAnalysisProgram, defenseNarrative = generateDefenseNarrative, defenseStream = streamDefenseNarrative, sandbox = executeInSandbox, rateLimitMaximum = 10, defenseRateLimitMaximum = 20 } = {}) {
  const app = express();
  const analysisRequests = new Map();
  const defenseRequests = new Map();

  function rateLimit(requests, maximumRequests, errorMessage) {
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
      if (current.count > maximumRequests) return response.status(429).json({ error: errorMessage });
    return next();
    };
  }

  const analysisRateLimit = rateLimit(analysisRequests, rateLimitMaximum, 'Please wait a minute before running more analyses.');
  const defenseRateLimit = rateLimit(defenseRequests, defenseRateLimitMaximum, 'Please wait a minute before asking ARIA to re-check another action.');

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : process.env.NODE_ENV === 'production' ? false : true, methods: ['GET', 'POST'], maxAge: 86_400 }));
  app.use(express.json({ limit: '8kb', strict: true }));

  app.get('/health', (_request, response) => response.json({ status: 'ok', sandbox: 'isolated-vm' }));
  app.get('/api/merchants', (_request, response) => response.json({ merchants: demoMerchants }));
  app.get('/api/brief', (request, response) => {
    try {
      const { merchant, events } = resolveMerchant(merchantData, request.query.merchant);
      return response.json({ merchant, merchants: demoMerchants, simulatedAt: demoReferenceDate, generatedAt: new Date().toISOString(), actions: createMorningBrief(events), prioritySummary: summarizePrioritization(events), ledger: createTrustLedger(events) });
    } catch (error) {
      return response.status(404).json({ error: messageFor(error) });
    }
  });
  app.post('/api/defense', defenseRateLimit, async (request, response) => {
    try {
      if (typeof request.body?.insightId !== 'string') return response.status(400).json({ error: 'Choose a surfaced insight to re-check.' });
      const { events } = resolveMerchant(merchantData, request.body.merchantId);
      const defense = rederiveDefenseEvidence(events, request.body.insightId);
      const narrative = await defenseNarrative(defense);
      return response.json({ insightId: defense.insightId, narrative, confidence: defense.confidence, recalculatedAt: defense.recalculatedAt });
    } catch (error) {
      const message = messageFor(error);
      const status = message === 'Insight not found in the current signal set.' || message === 'Merchant not found.' ? 404 : 503;
      return response.status(status).json({ error: message });
    }
  });
  app.post('/api/defense/stream', defenseRateLimit, async (request, response) => {
    try {
      if (typeof request.body?.insightId !== 'string') return response.status(400).json({ error: 'Choose a surfaced insight to re-check.' });
      const { events } = resolveMerchant(merchantData, request.body.merchantId);
      const defense = rederiveDefenseEvidence(events, request.body.insightId);
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
      for await (const delta of defenseStream({ ...defense, signal: controller.signal })) sendEvent(response, 'delta', { delta });
      sendEvent(response, 'done', { confidence: defense.confidence, recalculatedAt: defense.recalculatedAt });
      return response.end();
    } catch (error) {
      if (!response.headersSent) {
        const message = messageFor(error);
        const status = message === 'Insight not found in the current signal set.' || message === 'Merchant not found.' ? 404 : 503;
        return response.status(status).json({ error: message });
      }
      sendEvent(response, 'error', { error: messageFor(error) });
      return response.end();
    }
  });
  app.post('/api/analysis', analysisRateLimit, async (request, response) => {
    try {
      const question = validateQuestion(request.body?.question);
      const { events } = resolveMerchant(merchantData, request.body?.merchantId);
      const code = await analysisProgram({ question, events });
      const result = await sandbox(code);
      return response.json({ result, generatedCode: code });
    } catch (error) {
      const message = messageFor(error);
      const status = message.startsWith('Ask a business') || message.startsWith('ARIA cannot') || message.startsWith('ARIA only') ? 400 : message === 'Merchant not found.' ? 404 : 422;
      return response.status(status).json({ error: message });
    }
  });
  app.use((error, _request, response, _next) => {
    if (error instanceof SyntaxError && 'body' in error) return response.status(400).json({ error: 'Send valid JSON.' });
    return response.status(500).json({ error: 'ARIA could not complete that request.' });
  });
  return app;
}

export const app = createApp();

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`ARIA API listening on ${port}`));
}
