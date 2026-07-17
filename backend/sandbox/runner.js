import crypto from 'node:crypto';
import express from 'express';
import { executeInSandbox, validateGeneratedCode } from '../src/sandbox.js';

const app = express();
const port = Number(process.env.PORT ?? 4100);
const token = process.env.SANDBOX_RUNNER_TOKEN;

function authorized(request) {
  if (!token) return false;
  const value = request.get('authorization');
  if (!value?.startsWith('Bearer ')) return false;
  const provided = Buffer.from(value.slice(7));
  const expected = Buffer.from(token);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

app.disable('x-powered-by');
app.use(express.json({ limit: '24kb', strict: true }));
app.get('/health', (_request, response) => response.json({ status: 'ok' }));
app.post('/execute', async (request, response) => {
  if (!authorized(request)) return response.status(401).json({ error: 'Unauthorized sandbox runner request.' });
  try {
    validateGeneratedCode(request.body?.code);
    const result = await executeInSandbox(request.body.code, { forceLocal: true });
    return response.json({ result });
  } catch (error) {
    return response.status(422).json({ error: error.message });
  }
});

app.listen(port, () => console.log(`ARIA sandbox runner listening on ${port}`));
