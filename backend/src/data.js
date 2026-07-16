const day = 86_400_000;
const now = new Date('2026-07-16T07:00:00.000Z');

const customerProfiles = [
  { id: 'cust-amara', name: 'Amara Okafor', product: 'Ankara wax print', usualAmount: 186000, cadenceDays: 12, changedCadenceDays: 29, changedAmount: 72000 },
  { id: 'cust-bisi', name: 'Bisi Adeyemi', product: 'Lace fabric', usualAmount: 125000, cadenceDays: 16, changedCadenceDays: 16, changedAmount: 125000 },
  { id: 'cust-zainab', name: 'Zainab Musa', product: 'Adire fabric', usualAmount: 94000, cadenceDays: 14, changedCadenceDays: 14, changedAmount: 94000 }
];

function dateDaysAgo(days) {
  return new Date(now.getTime() - days * day).toISOString();
}

function purchase(id, customer, daysAgo, amount, quantity) {
  return {
    id,
    kind: 'purchase',
    customerId: customer.id,
    customerName: customer.name,
    product: customer.product,
    quantity,
    amountNaira: amount,
    occurredAt: dateDaysAgo(daysAgo),
    source: 'whatsapp',
    rawText: `Hello Aisha, please reserve ${quantity} rolls of ${customer.product}. I will transfer ₦${amount.toLocaleString('en-NG')} today.`
  };
}

export function createSyntheticEvents() {
  const events = [];
  let sequence = 1;
  for (const profile of customerProfiles) {
    const cadence = profile.cadenceDays;
    for (let daysAgo = 104; daysAgo >= 28; daysAgo -= cadence) {
      events.push(purchase(`purchase-${sequence++}`, profile, daysAgo, profile.usualAmount, 10));
    }
    if (profile.id === 'cust-amara') {
      events.push(purchase(`purchase-${sequence++}`, profile, 27, profile.changedAmount, 4));
    } else {
      events.push(purchase(`purchase-${sequence++}`, profile, cadence - 3, profile.changedAmount, 8));
    }
  }
  events.push({
    id: `transaction-${sequence++}`,
    kind: 'transaction',
    customerId: null,
    customerName: null,
    amountNaira: 355000,
    direction: 'debit',
    category: 'inventory',
    occurredAt: dateDaysAgo(1),
    source: 'sms',
    rawText: 'Acct 0021 debited ₦355,000.00 for new Ankara stock. Available balance ₦1,492,500.00.'
  });
  events.push({
    id: `transaction-${sequence++}`,
    kind: 'transaction',
    customerId: 'cust-bisi',
    customerName: 'Bisi Adeyemi',
    amountNaira: 125000,
    direction: 'credit',
    category: 'payment',
    occurredAt: dateDaysAgo(2),
    source: 'email',
    rawText: 'Payment receipt: Bisi Adeyemi paid ₦125,000 for lace fabric order.'
  });
  return events.sort((left, right) => new Date(left.occurredAt) - new Date(right.occurredAt));
}

export const demoMerchant = { name: 'Aisha', business: 'Aisha Textiles', location: 'Yaba, Lagos' };
