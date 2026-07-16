import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticEvents } from '../src/data.js';
import { createMorningBrief, deriveCandidates, prioritize, rederiveDefense, summarizePrioritization } from '../src/agents.js';

test('priority agent surfaces actionable insights and discards resolved findings', () => {
  const candidates = deriveCandidates(createSyntheticEvents());
  const brief = prioritize(candidates);
  assert.equal(brief.length, 3);
  assert.ok(brief.every((insight) => insight.actionability === 1 && insight.resolved === false));
  assert.equal(brief.some((insight) => insight.id === 'resolved-payment'), false);
});

test('defense agent re-derives churn evidence from structured events', () => {
  const events = createSyntheticEvents();
  const insight = createMorningBrief(events).find((item) => item.kind === 'churn-risk');
  const defense = rederiveDefense(events, insight.id);
  assert.match(defense.narrative, /order rhythm again/);
  assert.match(defense.narrative, /Amara Okafor/);
  assert.ok(defense.recalculatedAt);
});

test('defense agent supports every surfaced insight kind', () => {
  const events = createSyntheticEvents();
  for (const insight of createMorningBrief(events)) {
    assert.doesNotThrow(() => rederiveDefense(events, insight.id));
  }
});

test('priority summary exposes aggregate discard counts without retaining suppressed insights', () => {
  const summary = summarizePrioritization(createSyntheticEvents());
  assert.equal(summary.actionsSurfaced, 3);
  assert.equal(summary.opportunitiesDiscarded, 1);
  assert.equal('discardedInsights' in summary, false);
});

test('defense agent reads current event values on every request', () => {
  const events = createSyntheticEvents();
  const insight = createMorningBrief(events).find((item) => item.kind === 'churn-risk');
  const original = rederiveDefense(events, insight.id).narrative;
  events.filter((event) => event.customerId === 'cust-amara').at(-1).amountNaira = 51_000;
  const updated = rederiveDefense(events, insight.id).narrative;
  assert.notEqual(updated, original);
});
