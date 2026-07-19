import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticEvents, demoReferenceDate } from '../src/data.js';
import { createMorningBrief, createTrustLedger, deriveCandidates, prioritize, rederiveDefenseEvidence, summarizePrioritization } from '../src/agents.js';

test('priority agent surfaces three actionable insights and discards suppressed findings', () => {
  const candidates = deriveCandidates(createSyntheticEvents());
  const brief = prioritize(candidates);
  assert.equal(brief.length, 3);
  assert.ok(brief.every((insight) => insight.actionability === 1 && insight.resolved === false));
  assert.equal(brief.some((insight) => insight.kind === 'payment'), false);
  assert.ok(brief.some((insight) => insight.kind === 'churn-risk'));
  assert.ok(brief.some((insight) => insight.kind === 'pricing-anomaly'));
});

test('second synthetic merchant surfaces a supplier-delay scenario', () => {
  const brief = createMorningBrief(createSyntheticEvents('kola-mobile'));
  assert.equal(brief.length, 3);
  assert.ok(brief.some((insight) => insight.kind === 'supplier-delay'));
  assert.ok(brief.some((insight) => insight.kind === 'churn-risk'));
});

test('defense evidence is re-derived from current structured events', () => {
  const events = createSyntheticEvents();
  const insight = createMorningBrief(events).find((item) => item.kind === 'churn-risk');
  const defense = rederiveDefenseEvidence(events, insight.id);
  assert.equal(defense.insight.customerName, 'Amara Okafor');
  assert.ok(defense.evidence.expectedCadence > 0);
  assert.equal(defense.evidence.series.length, 6);
  assert.equal(defense.evidence.series.at(-1), defense.evidence.latestAmount);
  assert.ok(defense.recalculatedAt);
});

test('confidence scales with the strength and sample size of real evidence', () => {
  const events = createSyntheticEvents();
  const baseChurn = deriveCandidates(events).find((candidate) => candidate.kind === 'churn-risk');
  const strongerChurn = deriveCandidates(events, new Date(demoReferenceDate.getTime() + 12 * 86_400_000)).find((candidate) => candidate.kind === 'churn-risk');
  const pricing = deriveCandidates(events).find((candidate) => candidate.kind === 'pricing-anomaly');
  const inventory = deriveCandidates(events).find((candidate) => candidate.kind === 'inventory');
  assert.ok(strongerChurn.confidence > baseChurn.confidence);
  assert.ok(pricing.confidence >= 60 && pricing.confidence <= 93);
  assert.equal(inventory.confidence, 87);
});

test('defense evidence supports every surfaced insight kind for both merchants', () => {
  for (const merchantId of ['aisha-textiles', 'kola-mobile']) {
    const events = createSyntheticEvents(merchantId);
    for (const insight of createMorningBrief(events)) assert.doesNotThrow(() => rederiveDefenseEvidence(events, insight.id));
  }
});

test('priority summary exposes aggregate discard counts without retaining suppressed insights', () => {
  const summary = summarizePrioritization(createSyntheticEvents());
  assert.equal(summary.actionsSurfaced, 3);
  assert.ok(summary.opportunitiesDiscarded > 0);
  assert.equal('discardedInsights' in summary, false);
});

test('trust ledger is derived from multi-week structured merchant history', () => {
  const ledger = createTrustLedger(createSyntheticEvents());
  assert.equal(ledger.length, 5);
  assert.ok(ledger.every((entry) => entry.occurredAt && entry.title && entry.status));
  assert.ok(new Date(ledger[0].occurredAt) > new Date(ledger.at(-1).occurredAt));
});

test('defense evidence reads current event values on every request', () => {
  const events = createSyntheticEvents();
  const insight = createMorningBrief(events).find((item) => item.kind === 'churn-risk');
  const original = rederiveDefenseEvidence(events, insight.id).evidence.latestAmount;
  events.filter((event) => event.customerId === 'cust-amara').at(-1).amountNaira = 51_000;
  const updated = rederiveDefenseEvidence(events, insight.id).evidence.latestAmount;
  assert.notEqual(updated, original);
});
