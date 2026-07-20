import test from 'node:test';
import assert from 'node:assert/strict';
import { createSyntheticEvents } from '../src/data.js';
import { createMorningBrief, createTrustLedger, deriveCandidates, prioritize, rederiveDefenseEvidence, summarizePrioritization } from '../src/agents.js';

const referenceDate = new Date('2026-07-20T12:00:00.000Z');

test('priority agent surfaces three actionable insights and discards suppressed findings', () => {
  const candidates = deriveCandidates(createSyntheticEvents(undefined, referenceDate), referenceDate);
  const brief = prioritize(candidates);
  assert.equal(brief.length, 3);
  assert.ok(brief.every((insight) => insight.actionability === 1 && insight.resolved === false));
  assert.equal(brief.some((insight) => insight.kind === 'payment'), false);
  assert.ok(brief.some((insight) => insight.kind === 'churn-risk'));
  assert.ok(brief.some((insight) => insight.kind === 'pricing-anomaly'));
  assert.ok(brief.every((insight) => insight.copy?.key), 'Every surfaced action must have structured locale copy.');
});

test('second synthetic merchant surfaces a supplier-delay scenario', () => {
  const brief = createMorningBrief(createSyntheticEvents('kola-mobile', referenceDate), referenceDate);
  assert.equal(brief.length, 3);
  assert.ok(brief.some((insight) => insight.kind === 'supplier-delay'));
  assert.ok(brief.some((insight) => insight.kind === 'churn-risk'));
});

test('defense evidence is re-derived from current structured events', () => {
  const events = createSyntheticEvents(undefined, referenceDate);
  const insight = createMorningBrief(events, referenceDate).find((item) => item.kind === 'churn-risk');
  const defense = rederiveDefenseEvidence(events, insight.id, referenceDate);
  assert.equal(defense.insight.customerName, 'Amara Okafor');
  assert.ok(defense.evidence.expectedCadence > 0);
  assert.equal(defense.evidence.series.length, 6);
  assert.equal(defense.evidence.series.at(-1), defense.evidence.latestAmount);
  assert.ok(defense.recalculatedAt);
});

test('confidence scales with the strength and sample size of real evidence', () => {
  const events = createSyntheticEvents(undefined, referenceDate);
  const baseChurn = deriveCandidates(events, referenceDate).find((candidate) => candidate.kind === 'churn-risk');
  const strongerChurn = deriveCandidates(events, new Date(referenceDate.getTime() + 12 * 86_400_000)).find((candidate) => candidate.kind === 'churn-risk');
  const pricing = deriveCandidates(events, referenceDate).find((candidate) => candidate.kind === 'pricing-anomaly');
  const inventory = deriveCandidates(events, referenceDate).find((candidate) => candidate.kind === 'inventory');
  assert.ok(strongerChurn.confidence > baseChurn.confidence);
  assert.ok(pricing.confidence >= 60 && pricing.confidence <= 93);
  assert.equal(inventory.confidence, 87);
});

test('defense evidence supports every surfaced insight kind for both merchants', () => {
  for (const merchantId of ['aisha-textiles', 'kola-mobile']) {
    const events = createSyntheticEvents(merchantId, referenceDate);
    for (const insight of createMorningBrief(events, referenceDate)) assert.doesNotThrow(() => rederiveDefenseEvidence(events, insight.id, referenceDate));
  }
});

test('priority summary exposes aggregate discard counts without retaining suppressed insights', () => {
  const summary = summarizePrioritization(createSyntheticEvents(undefined, referenceDate), referenceDate);
  assert.equal(summary.actionsSurfaced, 3);
  assert.ok(summary.opportunitiesDiscarded > 0);
  assert.equal('discardedInsights' in summary, false);
});

test('trust ledger is derived from multi-week structured merchant history', () => {
  const ledger = createTrustLedger(createSyntheticEvents(undefined, referenceDate));
  assert.equal(ledger.length, 5);
  assert.ok(ledger.every((entry) => entry.occurredAt && entry.title && entry.status && entry.copy?.key && entry.copy?.statusKey));
  assert.ok(new Date(ledger[0].occurredAt) > new Date(ledger.at(-1).occurredAt));
});

test('defense evidence reads current event values on every request', () => {
  const events = createSyntheticEvents(undefined, referenceDate);
  const insight = createMorningBrief(events, referenceDate).find((item) => item.kind === 'churn-risk');
  const original = rederiveDefenseEvidence(events, insight.id, referenceDate).evidence.latestAmount;
  events.filter((event) => event.customerId === 'cust-amara').at(-1).amountNaira = 51_000;
  const updated = rederiveDefenseEvidence(events, insight.id, referenceDate).evidence.latestAmount;
  assert.notEqual(updated, original);
});
