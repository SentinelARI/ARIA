const day = 86_400_000;
const priorityThresholds = Object.freeze({ urgency: 70, valueNaira: 50_000 });

function purchasesFor(events, customerId) {
  return events.filter((event) => event.kind === 'purchase' && event.customerId === customerId).sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function intervals(events) {
  return events.slice(1).map((event, index) => (new Date(event.occurredAt) - new Date(events[index].occurredAt)) / day);
}

export function deriveCandidates(events, referenceDate = new Date('2026-07-16T07:00:00.000Z')) {
  const customerIds = [...new Set(events.filter((event) => event.customerId).map((event) => event.customerId))];
  const candidates = [];
  for (const customerId of customerIds) {
    const purchases = purchasesFor(events, customerId);
    if (purchases.length < 4) continue;
    const customerName = purchases[0].customerName;
    const historical = purchases.slice(0, -1);
    const latest = purchases.at(-1);
    const expectedCadence = average(intervals(historical));
    const latestGap = (referenceDate - new Date(latest.occurredAt)) / day;
    const historicalAmount = average(historical.map((event) => event.amountNaira));
    const amountChange = 1 - latest.amountNaira / historicalAmount;
    if (latestGap > expectedCadence * 1.4 && amountChange > 0.3) {
      candidates.push({
        id: `churn-${customerId}`,
        kind: 'churn-risk',
        customerId,
        customerName,
        title: `${customerName} may be drifting away`,
        action: `Send ${customerName.split(' ')[0]} a personal check-in and show the new Ankara arrivals.`,
        draftMessage: `Hi ${customerName.split(' ')[0]}, we just received fresh Ankara patterns I think you would like. Should I send you a quick video before they go?`,
        actionability: 1,
        urgency: 92,
        valueNaira: Math.round(historicalAmount),
        resolved: false,
        confidence: 86,
        evidence: { expectedCadence, latestGap, historicalAmount, latestAmount: latest.amountNaira, amountChange }
      });
    }
  }
  candidates.push({
    id: 'inventory-follow-up',
    kind: 'inventory',
    customerId: null,
    customerName: null,
    title: 'Turn yesterday’s Ankara restock into sales',
    action: 'Share a short arrivals video with your repeat Ankara buyers before the weekend.',
    draftMessage: 'New Ankara just landed today. I saved the patterns that match what you normally pick — would you like a quick video?',
    actionability: 1,
    urgency: 76,
    valueNaira: 355000,
    resolved: false,
    confidence: 79,
    evidence: { restockAmount: 355000, restockAgeDays: 1 }
  });
  candidates.push({
    id: 'weekend-bundles',
    kind: 'sales-opportunity',
    customerId: null,
    customerName: null,
    title: 'Create a weekend Ankara bundle offer',
    action: 'Bundle three slow-moving Ankara patterns and send the offer to customers who bought prints this month.',
    draftMessage: 'I put together a weekend Ankara bundle with three fresh patterns at a better price. Would you like me to reserve one for you?',
    actionability: 1,
    urgency: 72,
    valueNaira: 195000,
    resolved: false,
    confidence: 74,
    evidence: { targetValue: 195000, window: 'before the weekend' }
  });
  candidates.push({
    id: 'resolved-payment',
    kind: 'payment',
    customerId: 'cust-bisi',
    customerName: 'Bisi Adeyemi',
    title: 'Follow up on Bisi’s lace payment',
    action: 'No action needed.',
    draftMessage: '',
    actionability: 0,
    urgency: 68,
    valueNaira: 125000,
    resolved: true,
    confidence: 100,
    evidence: { paidAt: '2026-07-14T07:00:00.000Z' }
  });
  return candidates;
}

export function prioritize(candidates) {
  return candidates
    .filter((candidate) => candidate.actionability === 1 && !candidate.resolved && candidate.urgency >= priorityThresholds.urgency && candidate.valueNaira >= priorityThresholds.valueNaira)
    .map((candidate) => ({ ...candidate, priorityScore: Math.round(candidate.urgency * 0.45 + Math.min(candidate.valueNaira / 4000, 45) + candidate.confidence * 0.1) }))
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 3);
}

export function createMorningBrief(events) {
  return prioritize(deriveCandidates(events));
}

export function summarizePrioritization(events) {
  const candidates = deriveCandidates(events);
  const actions = prioritize(candidates);
  return {
    signalsRead: events.length,
    opportunitiesEvaluated: candidates.length,
    actionsSurfaced: actions.length,
    opportunitiesDiscarded: candidates.length - actions.length
  };
}

export function rederiveDefenseEvidence(events, insightId) {
  const candidate = deriveCandidates(events).find((item) => item.id === insightId);
  if (!candidate) throw new Error('Insight not found in the current signal set.');
  return {
    insightId,
    insight: {
      kind: candidate.kind,
      title: candidate.title,
      action: candidate.action,
      customerName: candidate.customerName,
      valueNaira: candidate.valueNaira
    },
    evidence: candidate.evidence,
    confidence: candidate.confidence,
    recalculatedAt: new Date().toISOString()
  };
}
