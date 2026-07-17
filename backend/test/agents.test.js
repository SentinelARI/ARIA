import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticEvents } from '../src/data.js';
import { createMorningBrief, deriveCandidates, prioritize, rederiveDefenseEvidence, summarizePrioritization } from '../src/agents.js';

test('priority agent surfaces actionable insights and discards resolved findings', () => {
  const candidates = deriveCandidates(createSyntheticEvents());
  const brief = prioritize(candidates);
  assert.equal(brief.length, 3);
  assert.ok(brief.every((insight) => insight.actionability === 1 && insight.resolved === false));
  assert.equal(brief.some((insight) => insight.id === 'resolved-payment'), false);
});

test('defense evidence is re-derived from current structured events', () => {
  const events = createSyntheticEvents();
  const insight = createMorningBrief(events).find((item) => item.kind === 'churn-risk');
  const defense = rederiveDefenseEvidence(events, insight.id);
  assert.equal(defense.insight.customerName, 'Amara Okafor');
  assert.ok(defense.evidence.expectedCadence > 0);
  assert.ok(defense.recalculatedAt);
});

test('defense evidence supports every surfaced insight kind', () => {
  const events = createSyntheticEvents();
  for (const insight of createMorningBrief(events)) {
    assert.doesNotThrow(() => rederiveDefenseEvidence(events, insight.id));
  }
});

test('priority summary exposes aggregate discard counts without retaining suppressed insights', () => {
  const summary = summarizePrioritization(createSyntheticEvents());
  assert.equal(summary.actionsSurfaced, 3);
  assert.equal(summary.opportunitiesDiscarded, 1);
  assert.equal('discardedInsights' in summary, false);
});

test('defense evidence reads current event values on every request', () => {
  const events = createSyntheticEvents();
  const insight = createMorningBrief(events).find((item) => item.kind === 'churn-risk');
  const original = rederiveDefenseEvidence(events, insight.id).evidence.latestAmount;
  events.filter((event) => event.customerId === 'cust-amara').at(-1).amountNaira = 51_000;
  const updated = rederiveDefenseEvidence(events, insight.id).evidence.latestAmount;
  assert.notEqual(updated, original);
});
