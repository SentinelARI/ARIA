import OpenAI from 'openai';

const defaultModel = process.env.OPENAI_MODEL ?? 'gpt-5.6';
const analysisInstructions = `You are ARIA's Codex Analysis Agent. Generate one small, self-contained JavaScript program that answers the merchant's business question using only the supplied structured events.

Return JavaScript source only: no Markdown fences, prose, imports, require calls, network access, filesystem access, process access, dynamic evaluation, timers, or functions that access globals. The program must begin with \`const events = [\` and must emit exactly one JSON value through \`console.log(JSON.stringify(...))\`. Use only standard JavaScript data transforms and the supplied event fields.`;
const defenseInstructions = `You are ARIA's Defense Agent for a fictional Lagos fabric merchant. Explain the supplied current evidence in one concise, plain-language paragraph. Describe only facts supported by the evidence, distinguish risk from certainty, and explain why the suggested action is timely. Do not mention prompts, models, cached text, or hidden insights.`;

function outputText(response) {
  const text = response?.output_text?.trim();
  if (!text) throw new Error('OpenAI returned no usable text.');
  return text.replace(/^```(?:javascript|js)?\s*/i, '').replace(/\s*```$/, '').trim();
}

function clientFor(client) {
  if (client) return client;
  if (!process.env.OPENAI_API_KEY) throw new Error('ARIA AI is not configured. Set OPENAI_API_KEY before running live analysis or defense.');
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 15_000, maxRetries: 1 });
}

function structuredEvents(events) {
  return events.map(({ rawText, ...event }) => event);
}

export async function generateAnalysisProgram({ question, events, client, model = defaultModel }) {
  const response = await clientFor(client).responses.create({
    model,
    reasoning: { effort: 'medium' },
    instructions: analysisInstructions,
    input: JSON.stringify({
      question,
      eventSchema: { kind: 'purchase | transaction', customerId: 'string | null', customerName: 'string | null', product: 'string?', quantity: 'number?', amountNaira: 'number', occurredAt: 'ISO-8601 string', direction: 'credit | debit?', category: 'string?', source: 'sms | whatsapp | email' },
      events: structuredEvents(events)
    })
  });
  return outputText(response);
}

export async function generateDefenseNarrative({ insight, evidence, client, model = defaultModel }) {
  const response = await clientFor(client).responses.create({
    model,
    reasoning: { effort: 'low' },
    instructions: defenseInstructions,
    input: JSON.stringify({ insight, evidence })
  });
  return outputText(response);
}
