const day = 86_400_000;
export const demoReferenceDate = new Date();
const now = new Date(demoReferenceDate);

export const demoMerchants = Object.freeze([
  Object.freeze({ id: 'aisha-textiles', name: 'Aisha', business: 'Aisha Textiles', location: 'Yaba, Lagos', sector: 'Fabric retail' }),
  Object.freeze({ id: 'kola-mobile', name: 'Kola', business: 'Kola Mobile Accessories', location: 'Computer Village, Lagos', sector: 'Phone accessories' })
]);

export const demoMerchant = demoMerchants[0];

function dateDaysAgo(days) {
  return new Date(now.getTime() - days * day).toISOString();
}

function purchase({ id, customer, daysAgo, amountNaira, quantity, merchantId }) {
  return {
    id,
    kind: 'purchase',
    merchantId,
    customerId: customer.id,
    customerName: customer.name,
    product: customer.product,
    quantity,
    amountNaira,
    occurredAt: dateDaysAgo(daysAgo),
    source: 'whatsapp',
    rawText: `Synthetic order: ${customer.name} reserved ${quantity} units of ${customer.product} for ₦${amountNaira.toLocaleString('en-NG')}.`
  };
}

function merchantAction({ id, merchantId, daysAgo, title, status }) {
  return {
    id,
    kind: 'merchant-action',
    merchantId,
    title,
    status,
    occurredAt: dateDaysAgo(daysAgo),
    source: 'merchant-record'
  };
}

function addPurchaseHistory(events, customer, merchantId, sequence, { startDaysAgo = 84, latestDaysAgo, regularQuantity = 10, latestQuantity = regularQuantity, latestAmountNaira = customer.usualAmount }) {
  let nextSequence = sequence;
  for (let daysAgo = startDaysAgo; daysAgo > latestDaysAgo; daysAgo -= customer.cadenceDays) {
    events.push(purchase({ id: `purchase-${nextSequence++}`, customer, daysAgo, amountNaira: customer.usualAmount, quantity: regularQuantity, merchantId }));
  }
  events.push(purchase({ id: `purchase-${nextSequence++}`, customer, daysAgo: latestDaysAgo, amountNaira: latestAmountNaira, quantity: latestQuantity, merchantId }));
  return nextSequence;
}

function sortEvents(events) {
  return events.sort((left, right) => new Date(left.occurredAt) - new Date(right.occurredAt));
}

function createAishaEvents() {
  const merchantId = 'aisha-textiles';
  const events = [];
  let sequence = 1;
  const customers = [
    { id: 'cust-amara', name: 'Amara Okafor', product: 'Ankara wax print', usualAmount: 186000, cadenceDays: 12 },
    { id: 'cust-bisi', name: 'Bisi Adeyemi', product: 'Lace fabric', usualAmount: 125000, cadenceDays: 16 },
    { id: 'cust-ijeoma', name: 'Ijeoma Nwosu', product: 'Lace fabric', usualAmount: 76000, cadenceDays: 14 },
    { id: 'cust-zainab', name: 'Zainab Musa', product: 'Adire fabric', usualAmount: 94000, cadenceDays: 14 }
  ];

  sequence = addPurchaseHistory(events, customers[0], merchantId, sequence, { latestDaysAgo: 27, latestQuantity: 4, latestAmountNaira: 72000 });
  sequence = addPurchaseHistory(events, customers[1], merchantId, sequence, { latestDaysAgo: 5, regularQuantity: 10, latestQuantity: 10 });
  sequence = addPurchaseHistory(events, customers[2], merchantId, sequence, { latestDaysAgo: 6, regularQuantity: 10, latestQuantity: 10 });
  sequence = addPurchaseHistory(events, customers[3], merchantId, sequence, { latestDaysAgo: 4, regularQuantity: 8, latestQuantity: 8 });

  events.push(
    {
      id: `transaction-${sequence++}`,
      kind: 'transaction',
      merchantId,
      customerId: null,
      customerName: null,
      product: 'Ankara wax print',
      amountNaira: 355000,
      direction: 'debit',
      category: 'inventory',
      occurredAt: dateDaysAgo(1),
      source: 'sms',
      rawText: 'Synthetic bank alert: ₦355,000 inventory payment for Ankara stock.'
    },
    {
      id: `transaction-${sequence++}`,
      kind: 'transaction',
      merchantId,
      customerId: 'cust-bisi',
      customerName: 'Bisi Adeyemi',
      amountNaira: 125000,
      direction: 'credit',
      category: 'payment',
      occurredAt: dateDaysAgo(2),
      source: 'email',
      rawText: 'Synthetic receipt: Bisi Adeyemi paid ₦125,000 for lace fabric.'
    },
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 10, title: 'Adire restock shared', status: 'Merchant approved the drafted message' }),
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 24, title: 'No action surfaced', status: 'ARIA stayed quiet after checking the signals' }),
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 39, title: 'Lace customer check-in surfaced', status: 'Awaiting Aisha’s approval' }),
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 56, title: 'Weekend bundle drafted', status: 'Merchant chose not to send it' }),
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 73, title: 'Repeat buyer follow-up surfaced', status: 'Merchant approved the drafted message' })
  );
  return sortEvents(events);
}

function createKolaEvents() {
  const merchantId = 'kola-mobile';
  const events = [];
  let sequence = 1;
  const customers = [
    { id: 'cust-funmi', name: 'Funmi Bello', product: 'USB-C fast chargers', usualAmount: 96000, cadenceDays: 12 },
    { id: 'cust-tunde', name: 'Tunde Eze', product: 'Phone cases', usualAmount: 78000, cadenceDays: 15 },
    { id: 'cust-sola', name: 'Sola Tech Hub', product: 'Screen protectors', usualAmount: 114000, cadenceDays: 14 }
  ];

  sequence = addPurchaseHistory(events, customers[0], merchantId, sequence, { latestDaysAgo: 25, latestQuantity: 4, latestAmountNaira: 36000 });
  sequence = addPurchaseHistory(events, customers[1], merchantId, sequence, { latestDaysAgo: 4, regularQuantity: 12, latestQuantity: 12 });
  sequence = addPurchaseHistory(events, customers[2], merchantId, sequence, { latestDaysAgo: 5, regularQuantity: 15, latestQuantity: 15 });

  events.push(
    {
      id: `supplier-delivery-${sequence++}`,
      kind: 'supplier-delivery',
      merchantId,
      supplierName: 'Ojo Devices',
      product: 'USB-C fast chargers',
      quantity: 120,
      amountNaira: 420000,
      status: 'overdue',
      expectedAt: dateDaysAgo(4),
      occurredAt: dateDaysAgo(18),
      source: 'supplier-record'
    },
    {
      id: `transaction-${sequence++}`,
      kind: 'transaction',
      merchantId,
      customerId: null,
      customerName: null,
      product: 'Phone cases',
      amountNaira: 268000,
      direction: 'debit',
      category: 'inventory',
      occurredAt: dateDaysAgo(1),
      source: 'sms',
      rawText: 'Synthetic bank alert: ₦268,000 inventory payment for phone cases.'
    },
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 8, title: 'Screen protector restock shared', status: 'Merchant approved the drafted message' }),
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 23, title: 'Supplier delay surfaced', status: 'Merchant called the supplier' }),
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 41, title: 'No action surfaced', status: 'ARIA stayed quiet after checking the signals' }),
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 60, title: 'Repeat buyer follow-up surfaced', status: 'Awaiting Kola’s approval' }),
    merchantAction({ id: `merchant-action-${sequence++}`, merchantId, daysAgo: 79, title: 'Phone case bundle drafted', status: 'Merchant chose not to send it' })
  );
  return sortEvents(events);
}

const eventFactories = Object.freeze({
  'aisha-textiles': createAishaEvents,
  'kola-mobile': createKolaEvents
});

export function createSyntheticEvents(merchantId = demoMerchant.id) {
  const createEvents = eventFactories[merchantId];
  if (!createEvents) throw new Error('Merchant not found.');
  return createEvents();
}

export function getDemoMerchant(merchantId = demoMerchant.id) {
  const merchant = demoMerchants.find((item) => item.id === merchantId);
  if (!merchant) throw new Error('Merchant not found.');
  return merchant;
}

export function createSyntheticMerchantData() {
  return new Map(demoMerchants.map((merchant) => [merchant.id, { merchant, events: createSyntheticEvents(merchant.id) }]));
}
