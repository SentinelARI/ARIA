import assert from 'node:assert';
import { test } from 'node:test';
import { enrichCandidates } from '../src/reasoningAgent.js';

test('enrichCandidates - successful single-call enrichment', async () => {
  const candidates = [{ id: 'c1' }, { id: 'c2' }];
  const events = [{ id: 'e1' }];
  const mockClient = {
    responses: {
      create: async () => ({ output_text: JSON.stringify([
        { id: 'c1', reasoning: 'c1 reasoning', crossSignals: ['c2', 'e1'] },
        { id: 'c2', reasoning: 'c2 reasoning', crossSignals: [] }
      ]) })
    }
  };
  const result = await enrichCandidates({ candidates, events, client: mockClient });
  assert.equal(result.reasoningStatus, 'ok');
  assert.equal(result.candidates.length, 2);
  const r1 = result.candidates.find((r) => r.id === 'c1');
  assert.ok(r1.reasoning.includes('c1 reasoning'));
  assert.deepEqual(r1.crossSignals, ['c2', 'e1']);
});

test('enrichCandidates - retry on invalid JSON then succeed', async () => {
  const candidates = [{ id: 'c1' }];
  const events = [{ id: 'e1' }];
  let calls = 0;
  const mockClient = {
    responses: {
      create: async () => {
        calls += 1;
        if (calls === 1) return { output_text: 'not json' };
        return { output_text: JSON.stringify([{ id: 'c1', reasoning: 'ok', crossSignals: ['e1'] }]) };
      }
    }
  };
  const result = await enrichCandidates({ candidates, events, client: mockClient });
  assert.equal(result.reasoningStatus, 'ok');
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].id, 'c1');
  assert.equal(calls, 2);
});

test('enrichCandidates - reject unknown related ids after retry', async () => {
  const candidates = [{ id: 'c1' }];
  const events = [{ id: 'e1' }];
  const mockClient = {
    responses: {
      create: async () => ({ output_text: JSON.stringify([{ id: 'c1', reasoning: 'r', crossSignals: ['unknown'] }]) })
    }
  };
  await assert.rejects(async () => enrichCandidates({ candidates, events, client: mockClient }), {
    message: /Related id not found/
  });
});

test('enrichCandidates - graceful degradation on API failure', async () => {
  const candidates = [{ id: 'c1' }];
  const events = [{ id: 'e1' }];
  const mockClient = {
    responses: {
      create: async () => { throw new Error('network'); }
    }
  };
  const result = await enrichCandidates({ candidates, events, client: mockClient });
  assert.equal(result.reasoningStatus, 'unavailable');
  assert.deepEqual(result.candidates, candidates);
});

test('enrichCandidates - single call contains all candidate and event ids', async () => {
  const candidates = [{ id: 'c1' }, { id: 'c2' }];
  const events = [{ id: 'e1' }, { id: 'e2' }];
  let captured = null;
  const mockClient = {
    responses: {
      create: async ({ input }) => {
        captured = JSON.parse(input);
        return { output_text: JSON.stringify([
          { id: 'c1', reasoning: 'r1', crossSignals: [] },
          { id: 'c2', reasoning: 'r2', crossSignals: [] }
        ]) };
      }
    }
  };
  const result = await enrichCandidates({ candidates, events, client: mockClient });
  assert.equal(result.reasoningStatus, 'ok');
  assert.ok(captured);
  // ensure payload includes all candidate ids and event ids
  const inputCandidateIds = (captured.candidates || []).map((c) => c.id);
  const inputEventIds = (captured.events || []).map((e) => e.id);
  assert.deepEqual(inputCandidateIds.sort(), ['c1', 'c2']);
  assert.deepEqual(inputEventIds.sort(), ['e1', 'e2']);
});
