import { demoReferenceDate } from './data.js';

const day = 86_400_000;
// Priority thresholds and scoring formula confirmed by product (Daniel) on 2026-07-18.
// These are the final product thresholds to determine which candidates are surfaced:
// - minimum `urgency`: 70
// - minimum `valueNaira`: 50,000
// Do NOT treat these as placeholders; they are the agreed specification.
const priorityThresholds = Object.freeze({ urgency: 70, valueNaira: 50_000 });

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function scaledConfidence({ base, ceiling, signals }) {
  const strength = signals.reduce((sum, value) => sum + clamp(value, 0, 1), 0) / signals.length;
  return Math.round(base + strength * (ceiling - base));
}

function purchasesFor(events, customerId) {
  return events.filter((event) => event.kind === 'purchase' && event.customerId === customerId).sort((left, right) => new Date(left.occurredAt) - new Date(right.occurredAt));
}

function average(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function intervals(events) {
  return events.slice(1).map((event, index) => (new Date(event.occurredAt) - new Date(events[index].occurredAt)) / day);
}

function productLabel(product) {
  return product.replace(/ wax print$/i, '');
}

function productPurchases(events, product) {
  return events.filter((event) => event.kind === 'purchase' && event.product === product && event.quantity > 0);
}

function deriveChurnCandidates(events, referenceDate) {
  const customerIds = [...new Set(events.filter((event) => event.kind === 'purchase' && event.customerId).map((event) => event.customerId))];
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
      const firstName = customerName.split(' ')[0];
      const gapSignal = (latestGap / expectedCadence - 1.4) / 1.4;
      const amountSignal = (amountChange - 0.3) / 0.4;
      const confidence = scaledConfidence({ base: 62, ceiling: 95, signals: [gapSignal, amountSignal] });
      candidates.push({
        id: `churn-${customerId}`,
        kind: 'churn-risk',
        customerId,
        customerName,
        title: `${customerName} may be drifting away`,
        action: `Send ${firstName} a personal check-in and show the latest ${productLabel(latest.product)} arrivals.`,
        draftMessage: `Hi ${firstName}, we just received fresh ${productLabel(latest.product)} options I think you would like. Should I send you a quick video before they go?`,
        actionability: 1,
        urgency: 92,
        valueNaira: Math.round(historicalAmount),
        resolved: false,
        confidence,
        evidence: { expectedCadence, latestGap, historicalAmount, latestAmount: latest.amountNaira, amountChange, product: latest.product, series: historical.slice(-5).map((event) => event.amountNaira).concat(latest.amountNaira) }
      });
    }
  }
  return candidates;
}

function derivePricingCandidates(events) {
  const candidates = [];
  const products = [...new Set(events.filter((event) => event.kind === 'purchase').map((event) => event.product))];
  for (const product of products) {
    const purchases = productPurchases(events, product);
    if (purchases.length < 6) continue;
    const customerIds = [...new Set(purchases.map((event) => event.customerId))];
    const unitPriceByCustomer = customerIds.map((customerId) => {
      const customerPurchases = purchases.filter((event) => event.customerId === customerId);
      return [customerId, average(customerPurchases.map((event) => event.amountNaira / event.quantity))];
    });
    const benchmarkUnitPrice = median(unitPriceByCustomer.map(([, unitPrice]) => unitPrice));
    for (const customerId of customerIds) {
      const customerPurchases = purchases.filter((event) => event.customerId === customerId);
      if (customerPurchases.length < 3) continue;
      const customerUnitPrice = unitPriceByCustomer.find(([id]) => id === customerId)[1];
      const discountPercent = 1 - customerUnitPrice / benchmarkUnitPrice;
      if (discountPercent < 0.18) continue;
      const latest = customerPurchases.at(-1);
      const firstName = latest.customerName.split(' ')[0];
      const observedOrders = customerPurchases.length;
      const discountSignal = (discountPercent - 0.18) / 0.32;
      const sampleSignal = (observedOrders - 3) / 5;
      const confidence = scaledConfidence({ base: 60, ceiling: 93, signals: [discountSignal, sampleSignal] });
      candidates.push({
        id: `pricing-${customerId}-${product.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        kind: 'pricing-anomaly',
        customerId,
        customerName: latest.customerName,
        title: `Review ${firstName}’s ${productLabel(product)} price`,
        action: `Check whether ${firstName}’s repeat ${productLabel(product)} price is still intentional before the next order.`,
        draftMessage: `Hi ${firstName}, I am reviewing our current ${productLabel(product)} prices before your next order. Should I reserve your usual quantity while I confirm the best option?`,
        actionability: 1,
        urgency: 84,
        // Project three expected repeat orders to estimate near-term recoverable pricing value.
        valueNaira: Math.round((benchmarkUnitPrice - customerUnitPrice) * latest.quantity * 3),
        resolved: false,
        confidence,
        evidence: { product, benchmarkUnitPrice, customerUnitPrice, discountPercent, observedOrders }
      });
    }
  }
  return candidates;
}

function deriveSupplierDelayCandidates(events, referenceDate) {
  return events
    .filter((event) => event.kind === 'supplier-delivery' && event.status === 'overdue' && new Date(event.expectedAt) < referenceDate)
    .map((event) => {
      const overdueDays = Math.max(1, Math.floor((referenceDate - new Date(event.expectedAt)) / day));
      const confidence = Math.round(clamp(82 + overdueDays * 2, 82, 97));
      return {
        id: `supplier-delay-${event.id}`,
        kind: 'supplier-delay',
        customerId: null,
        customerName: null,
        title: `${event.product} delivery is ${overdueDays} days late`,
        action: `Contact ${event.supplierName} today and confirm a delivery date before the ${event.product} gap affects repeat buyers.`,
        draftMessage: `Hello ${event.supplierName}, our ${event.product} delivery is now overdue. Please confirm the delivery date today so we can plan stock for customers.`,
        actionability: 1,
        urgency: 90,
        valueNaira: event.amountNaira,
        resolved: false,
        confidence,
        evidence: { supplierName: event.supplierName, product: event.product, quantity: event.quantity, expectedAt: event.expectedAt, overdueDays, orderValueNaira: event.amountNaira }
      };
    });
}

function deriveInventoryCandidate(events, referenceDate) {
  const restock = events
    .filter((event) => event.kind === 'transaction' && event.direction === 'debit' && event.category === 'inventory')
    .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))[0];
  if (!restock) return null;
  const restockAgeDays = Math.floor((referenceDate - new Date(restock.occurredAt)) / day);
  if (restockAgeDays > 3) return null;
  const product = productLabel(restock.product ?? 'new inventory');
  const confidence = Math.round(clamp(92 - restockAgeDays * 5, 70, 92));
  return {
    id: `inventory-follow-up-${restock.id}`,
    kind: 'inventory',
    customerId: null,
    customerName: null,
    title: `Turn yesterday’s ${product} restock into sales`,
    action: `Share a short arrivals update with repeat ${product} buyers before the weekend.`,
    draftMessage: `New ${product} stock just landed. I saved options that match what you normally pick — would you like a quick video?`,
    actionability: 1,
    urgency: 76,
    valueNaira: restock.amountNaira,
    resolved: false,
    confidence,
    evidence: { product: restock.product, restockAmount: restock.amountNaira, restockAgeDays }
  };
}

function deriveSalesOpportunity(events) {
  const purchases = events.filter((event) => event.kind === 'purchase');
  if (!purchases.length) return null;
  const latestProduct = purchases.at(-1).product;
  return {
    id: `weekend-bundles-${latestProduct.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
    kind: 'sales-opportunity',
    customerId: null,
    customerName: null,
    title: `Create a weekend ${productLabel(latestProduct)} bundle offer`,
    action: `Bundle three slower-moving ${productLabel(latestProduct)} options and share the offer with recent buyers.`,
    draftMessage: `I put together a weekend ${productLabel(latestProduct)} bundle with three options at a better price. Would you like me to reserve one?`,
    actionability: 1,
    urgency: 65,
    valueNaira: 195000,
    resolved: false,
    // This is a generic recommendation, so it intentionally uses a lower static baseline.
    confidence: 74,
    evidence: { product: latestProduct, targetValue: 195000, window: 'before the weekend' }
  };
}

function deriveResolvedPaymentCandidate(events) {
  const payment = events.find((event) => event.kind === 'transaction' && event.direction === 'credit' && event.category === 'payment');
  if (!payment) return null;
  return {
    id: `resolved-payment-${payment.id}`,
    kind: 'payment',
    customerId: payment.customerId,
    customerName: payment.customerName,
    title: `Follow up on ${payment.customerName}’s payment`,
    action: 'No action needed.',
    draftMessage: '',
    actionability: 0,
    urgency: 68,
    valueNaira: payment.amountNaira,
    resolved: true,
    confidence: 100,
    evidence: { paidAt: payment.occurredAt, amountNaira: payment.amountNaira }
  };
}

export function deriveCandidates(events, referenceDate = demoReferenceDate) {
  const candidates = [
    ...deriveChurnCandidates(events, referenceDate),
    ...derivePricingCandidates(events),
    ...deriveSupplierDelayCandidates(events, referenceDate),
    deriveInventoryCandidate(events, referenceDate),
    deriveSalesOpportunity(events),
    deriveResolvedPaymentCandidate(events)
  ].filter(Boolean);
  return candidates;
}

// Prioritization uses Daniel's confirmed scoring formula (2026-07-18):
// priorityScore = urgency * 0.45 + min(valueNaira / 4000, 45) + confidence * 0.1
// Surface the top 3 candidates that meet the product thresholds above.
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

export function createTrustLedger(events) {
  return events
    .filter((event) => event.kind === 'merchant-action')
    .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))
    .slice(0, 6)
    .map(({ id, occurredAt, title, status }) => ({ id, occurredAt, title, status }));
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
