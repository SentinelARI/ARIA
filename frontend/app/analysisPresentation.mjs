import { formatLedgerDate, localeMeta, translate } from './i18n.mjs';

const MAX_VISIBLE_ITEMS = 12;
const knownFieldLabels = Object.freeze({
  customerName: 'analysis.field.customer',
  lastPurchaseAt: 'analysis.field.lastPurchase',
  daysQuiet: 'analysis.field.daysQuiet',
  typicalPurchaseIntervalDays: 'analysis.field.typicalPurchaseInterval'
});
const recordListKeys = new Set(['customers', 'quietCustomers', 'suppliers', 'products', 'items', 'results']);

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitive(value) {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

function humanizeKey(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function fieldLabel(key, locale) {
  return knownFieldLabels[key] ? translate(locale, knownFieldLabels[key]) : humanizeKey(key);
}

function numericValue(value, locale) {
  return new Intl.NumberFormat(localeMeta(locale).formatLocale, { maximumFractionDigits: 2 }).format(value);
}

function displayValue(key, value, locale) {
  if (value === null) return translate(locale, 'analysis.notAvailable');
  if (typeof value === 'boolean') return translate(locale, value ? 'analysis.yes' : 'analysis.no');
  if (typeof value === 'number') {
    if (/naira$/i.test(key)) return new Intl.NumberFormat(localeMeta(locale).formatLocale, { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(value);
    if (/(^days|days$)/i.test(key)) return translate(locale, 'analysis.dayCount', { count: numericValue(value, locale) });
    return numericValue(value, locale);
  }
  if (typeof value === 'string') {
    if (/(At|Date)$/i.test(key)) return formatLedgerDate(value, locale) || translate(locale, 'analysis.notAvailable');
    return value;
  }
  if (Array.isArray(value) && value.every(isPrimitive)) return value.map((item) => displayValue('', item, locale)).join(', ');
  return null;
}

function fieldsFor(record, locale, omit = []) {
  const skipped = new Set(omit);
  return Object.entries(record)
    .filter(([key, value]) => !skipped.has(key) && (isPrimitive(value) || (Array.isArray(value) && value.every(isPrimitive))))
    .map(([key, value]) => ({ label: fieldLabel(key, locale), value: displayValue(key, value, locale) }))
    .filter((field) => field.value !== null && field.value !== '');
}

function titleFor(record, index, locale) {
  for (const key of ['customerName', 'supplierName', 'product', 'name', 'title', 'id']) {
    if (typeof record[key] === 'string' && record[key].trim()) return record[key];
  }
  return translate(locale, 'analysis.resultItem', { index: index + 1 });
}

function genericCard(record, index, locale) {
  const titleKey = ['customerName', 'supplierName', 'product', 'name', 'title', 'id']
    .find((key) => typeof record[key] === 'string' && record[key].trim());
  const fields = fieldsFor(record, locale, titleKey ? [titleKey] : []);
  return {
    title: titleFor(record, index, locale),
    fields: fields.length ? fields : [{ label: translate(locale, 'analysis.value'), value: translate(locale, 'analysis.notAvailable') }]
  };
}

function limitedGroup(title, items, locale) {
  const visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);
  return { title, items: visibleItems, remainingCount: Math.max(0, items.length - visibleItems.length), remainingLabel: translate(locale, 'analysis.moreResults', { count: Math.max(0, items.length - visibleItems.length) }) };
}

function customerCard(customer, index, locale) {
  const fields = fieldsFor(customer, locale, ['customerId', 'customerName']);
  return {
    title: typeof customer.customerName === 'string' && customer.customerName.trim()
      ? customer.customerName
      : translate(locale, 'analysis.customer', { index: index + 1 }),
    fields: fields.length ? fields : [{ label: translate(locale, 'analysis.value'), value: translate(locale, 'analysis.notAvailable') }]
  };
}

function recordListPresentation(result, key, records, locale) {
  const isCustomerList = key === 'customers' || key === 'quietCustomers';
  const title = isCustomerList ? translate(locale, 'analysis.customerResults') : fieldLabel(key, locale);
  const overviewFields = fieldsFor(result, locale, [key]);
  const cards = records.map((record, index) => {
    if (isRecord(record)) return isCustomerList ? customerCard(record, index, locale) : genericCard(record, index, locale);
    const value = displayValue(key, record, locale);
    if (value === null || value === '') return null;
    return {
      title: isCustomerList ? translate(locale, 'analysis.customer', { index: index + 1 }) : translate(locale, 'analysis.resultItem', { index: index + 1 }),
      fields: [{ label: translate(locale, 'analysis.value'), value }]
    };
  }).filter(Boolean);
  const groups = overviewFields.length
    ? [{ title: translate(locale, 'analysis.overview'), items: [{ title: translate(locale, 'analysis.result'), fields: overviewFields }], remainingCount: 0 }]
    : [];
  if (!cards.length) {
    return {
      summary: groups.length ? translate(locale, 'analysis.complete') : translate(locale, 'analysis.noMatchingResults'),
      groups,
      rawResult: structuredResultText(result)
    };
  }
  const summary = isCustomerList
    ? translate(locale, 'analysis.customersFound', { count: cards.length })
    : translate(locale, 'analysis.resultsFound', { count: cards.length });
  return { summary, groups: [...groups, limitedGroup(title, cards, locale)], rawResult: structuredResultText(result) };
}

function primitiveRecordPresentation(result, locale) {
  const fields = fieldsFor(result, locale);
  if (!fields.length) return null;
  return {
    summary: translate(locale, 'analysis.complete'),
    groups: [{ title: translate(locale, 'analysis.overview'), items: [{ title: translate(locale, 'analysis.result'), fields }], remainingCount: 0 }],
    rawResult: structuredResultText(result)
  };
}

export function structuredResultText(result) {
  const text = JSON.stringify(result, null, 2);
  return typeof text === 'string' ? text : 'null';
}

export function presentAnalysisResult(result, locale = 'en') {
  if (isRecord(result)) {
    const recognizedKey = Object.keys(result).find((key) => recordListKeys.has(key) && Array.isArray(result[key]));
    if (recognizedKey) return recordListPresentation(result, recognizedKey, result[recognizedKey], locale);
    const primitivePresentation = primitiveRecordPresentation(result, locale);
    if (primitivePresentation) return primitivePresentation;
  }
  return {
    summary: translate(locale, 'analysis.unknownResult'),
    groups: [],
    rawResult: structuredResultText(result)
  };
}
