import cors from 'cors';
import express from 'express';
import { createSyntheticEvents, demoMerchant } from './data.js';
import { createMorningBrief, rederiveDefense, summarizePrioritization } from './agents.js';
import { executeInSandbox, generateAnalysisCode } from './sandbox.js';

const app = express();
const events = createSyntheticEvents();
const analysisRequests = new Map();
const metrics = { briefRequests: 0, defenseRequests: 0, analysisRequests: 0, analysisFailures: 0 };
const allowedOrigins = process.env.FRONTEND_ORIGIN?.split(',').map((origin) => origin.trim()).filter(Boolean);

function analysisRateLimit(request, response, next) {
  const now = Date.now();
  const key = request.ip ?? 'unknown';
  const windowMs = 60_000;
  const maximumRequests = 10;
  const entry = analysisRequests.get(key);
  const current = !entry || now - entry.startedAt >= windowMs ? { startedAt: now, count: 0 } : entry;
  current.count += 1;
  analysisRequests.set(key, current);
  response.set('RateLimit-Limit', String(maximumRequests));
  response.set('RateLimit-Remaining', String(Math.max(0, maximumRequests - current.count)));
  if (current.count > maximumRequests) return response.status(429).json({ error: 'Please wait a minute before running more analyses.' });
  return next();
}

app.disable('x-powered-by');
app.use(cors({ origin: allowedOrigins?.length ? allowedOrigins : process.env.NODE_ENV === 'production' ? false : true, methods: ['GET', 'POST'], maxAge: 86_400 }));
app.use(express.json({ limit: '8kb', strict: true }));

app.get('/health', (_request, response) => response.json({ status: 'ok', sandboxImage: 'aria-analysis-sandbox:latest' }));
app.get('/api/brief', (_request, response) => {
  metrics.briefRequests += 1;
  return response.json({ merchant: demoMerchant, generatedAt: new Date().toISOString(), actions: createMorningBrief(events), prioritySummary: summarizePrioritization(events) });
});
app.post('/api/defense', (request, response) => {
  try {
    if (typeof request.body?.insightId !== 'string') return response.status(400).json({ error: 'Choose a surfaced insight to re-check.' });
    metrics.defenseRequests += 1;
    return response.json(rederiveDefense(events, request.body.insightId));
  } catch (error) {
    return response.status(404).json({ error: error.message });
  }
});
app.post('/api/analysis', analysisRateLimit, async (request, response) => {
  try {
    const question = request.body?.question;
    if (typeof question !== 'string' || question.trim().length < 3 || question.length > 300) return response.status(400).json({ error: 'Ask a short question about sales or customers.' });
    metrics.analysisRequests += 1;
    const code = generateAnalysisCode(question, events);
    const result = await executeInSandbox(code);
    return response.json({ result, generatedCode: code });
  } catch (error) {
    metrics.analysisFailures += 1;
    return response.status(422).json({ error: error.message });
  }
});
app.get('/api/metrics', (_request, response) => response.json({ ...metrics, prioritySummary: summarizePrioritization(events) }));

app.use((error, _request, response, _next) => {
  if (error instanceof SyntaxError && 'body' in error) return response.status(400).json({ error: 'Send valid JSON.' });
  return response.status(500).json({ error: 'ARIA could not complete that request.' });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => console.log(`ARIA API listening on ${port}`));
