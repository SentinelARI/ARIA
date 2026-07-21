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

test('enrichCandidates preserves every deterministic candidate field when enrichment succeeds', async () => {
  const candidates = [
    {
      id: 'c1',
      kind: 'churn-risk',
      urgency: 92,
      valueNaira: 186000,
      actionability: 1,
      resolved: false,
      confidence: 86,
      title: 'Amara may be drifting away',
      action: 'Send a personal check-in.',
      customerName: 'Amara Okafor',
      evidence: { latestGap: 27, expectedCadence: 12 }
    },
    {
      id: 'c2',
      kind: 'supplier-delay',
      urgency: 90,
      valueNaira: 420000,
      actionability: 1,
      resolved: false,
      confidence: 90,
      title: 'Delivery is late',
      action: 'Contact the supplier.',
      customerName: null,
      evidence: { overdueDays: 4 }
    }
  ];
  const events = [{ id: 'e1' }];
  const client = {
    responses: {
      create: async () => ({ output_text: JSON.stringify([
        { id: 'c1', reasoning: 'The late, smaller order needs attention.', crossSignals: ['e1'] },
        { id: 'c2', reasoning: 'The overdue delivery risks stock availability.', crossSignals: [] }
      ]) })
    }
  };

  const result = await enrichCandidates({ candidates, events, client });

  assert.deepEqual(result.candidates, [
    { ...candidates[0], reasoning: 'The late, smaller order needs attention.', crossSignals: ['e1'] },
    { ...candidates[1], reasoning: 'The overdue delivery risks stock availability.', crossSignals: [] }
  ]);
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

test('enrichCandidates - invalid model output falls back without losing deterministic candidates', async () => {
  const candidates = [{ id: 'c1' }];
  const events = [{ id: 'e1' }];
  const mockClient = {
    responses: {
      create: async () => ({ output_text: JSON.stringify([{ id: 'c1', reasoning: 'r', crossSignals: ['unknown'] }]) })
    }
  };
  const result = await enrichCandidates({ candidates, events, client: mockClient });
  assert.equal(result.reasoningStatus, 'unavailable');
  assert.equal(result.reasoningError, 'aiInvalidResponse');
  assert.deepEqual(result.candidates, candidates);
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

test('enrichCandidates exposes a safe quota category without leaking provider text', async () => {
  const candidates = [{ id: 'c1' }];
  const events = [{ id: 'e1' }];
  const mockClient = {
    responses: {
      create: async () => {
        const error = new Error('sensitive provider detail');
        error.status = 429;
        error.error = { code: 'insufficient_quota', type: 'insufficient_quota' };
        throw error;
      }
    }
  };
  const result = await enrichCandidates({ candidates, events, client: mockClient });
  assert.equal(result.reasoningStatus, 'unavailable');
  assert.equal(result.reasoningError, 'aiQuotaExceeded');
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
