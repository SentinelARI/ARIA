import test from 'node:test';
import assert from 'node:assert/strict';
import { generateAnalysisProgram, generateDefenseNarrative, streamDefenseNarrative } from '../src/ai.js';
import { createSyntheticEvents } from '../src/data.js';

function fakeClient(outputs) {
  const requests = [];
  return {
    requests,
    responses: {
      create: async (request) => {
        requests.push(request);
        return { output_text: outputs.shift() };
      }
    }
  };
}

test('analysis agent asks OpenAI for a fresh constrained program using structured events only', async () => {
  const client = fakeClient(['```js\nconst events = []; console.log(JSON.stringify({ total: 0 }));\n```']);
  const program = await generateAnalysisProgram({ question: 'What did Ankara sales do this week?', events: createSyntheticEvents(), client, model: 'test-model' });
  assert.equal(program, 'const events = []; console.log(JSON.stringify({ total: 0 }));');
  assert.equal(client.requests[0].model, 'test-model');
  assert.match(client.requests[0].instructions, /JavaScript program/);
  assert.match(client.requests[0].input, /What did Ankara sales do this week/);
  assert.doesNotMatch(client.requests[0].input, /rawText/);
});

test('defense agent requests a fresh narrative for each re-derived evidence payload', async () => {
  const client = fakeClient(['Amara’s recent order is smaller and later than her earlier pattern.', 'The order gap and lower basket make a check-in timely.']);
  const context = { insight: { title: 'Amara may be drifting away' }, evidence: { latestGap: 19, expectedCadence: 12 }, model: 'test-model', client };
  const first = await generateDefenseNarrative(context);
  const second = await generateDefenseNarrative(context);
  assert.notEqual(first, second);
  assert.match(client.requests[0].instructions, /plain-language/);
  assert.match(client.requests[0].input, /expectedCadence/);
});

test('defense agent requests Nigerian Pidgin only when the locale asks for it', async () => {
  const client = fakeClient(['Fresh Pidgin defense copy.']);
  await generateDefenseNarrative({ insight: { title: 'Amara may be drifting away' }, evidence: { latestGap: 19 }, locale: 'pg', model: 'test-model', client });
  assert.match(client.requests[0].instructions, /Nigerian Pidgin/);
});

test('defense agent streams narrative deltas through the Responses API', async () => {
  const requests = [];
  const client = {
    requests,
    responses: {
      create: async (request) => {
        requests.push(request);
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'response.output_text.delta', delta: 'Amara’s order is later. ' };
            yield { type: 'response.output_text.delta', delta: 'A check-in is timely.' };
          }
        };
      }
    }
  };
  const context = { insight: { title: 'Amara may be drifting away' }, evidence: { latestGap: 19, expectedCadence: 12 }, model: 'test-model', client };
  const deltas = [];
  for await (const delta of streamDefenseNarrative(context)) deltas.push(delta);
  assert.deepEqual(deltas, ['Amara’s order is later. ', 'A check-in is timely.']);
  assert.equal(client.requests[0].stream, true);
});
