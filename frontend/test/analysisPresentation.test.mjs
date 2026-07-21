import assert from 'node:assert/strict';
import test from 'node:test';
import { presentAnalysisResult, structuredResultText } from '../app/analysisPresentation.mjs';

test('customer analysis becomes merchant-facing cards while raw details remain opt-in', () => {
  const result = {
    customers: [{
      customerId: 'cust-amara',
      customerName: 'Amara Okafor',
      lastPurchaseAt: '2026-06-24T20:30:36.271Z',
      daysQuiet: 26,
      typicalPurchaseIntervalDays: 12
    }]
  };
  const presentation = presentAnalysisResult(result, 'en');

  assert.equal(presentation.summary, 'ARIA found 1 matching customer.');
  assert.equal(presentation.groups[0].title, 'Customer results');
  assert.equal(presentation.groups[0].items[0].title, 'Amara Okafor');
  assert.deepEqual(presentation.groups[0].items[0].fields, [
    { label: 'Last purchase', value: '24 Jun' },
    { label: 'Days quiet', value: '26 days' },
    { label: 'Typical purchase interval', value: '12 days' }
  ]);
  assert.doesNotMatch(JSON.stringify(presentation.groups), /cust-amara/);
  assert.match(presentation.rawResult, /cust-amara/);
});

test('customer aliases, zeroes, invalid dates, and empty lists are handled safely', () => {
  const quiet = presentAnalysisResult({ quietCustomers: [{ customerName: 'Amara', daysQuiet: 0, lastPurchaseAt: 'not-a-date' }] }, 'en');
  assert.equal(quiet.groups[0].items[0].fields[0].value, '0 days');
  assert.equal(quiet.groups[0].items[0].fields[1].value, 'Not available');

  const empty = presentAnalysisResult({ customers: [] }, 'en');
  assert.equal(empty.summary, 'ARIA did not find a matching result.');
  assert.deepEqual(empty.groups, []);

  const withOverview = presentAnalysisResult({ customers: [], checkedCustomers: 24 }, 'en');
  assert.equal(withOverview.summary, 'ARIA completed the structured analysis.');
  assert.deepEqual(withOverview.groups[0].items[0].fields, [{ label: 'Checked Customers', value: '24' }]);
});

test('simple totals remain readable and unknown result shapes fall back to structured details', () => {
  const total = presentAnalysisResult({ totalSalesNaira: 128500, totalOrders: 4 }, 'en');
  assert.equal(total.summary, 'ARIA completed the structured analysis.');
  assert.equal(total.groups[0].items[0].fields[0].label, 'Total Sales Naira');
  assert.match(total.groups[0].items[0].fields[0].value, /128,500/);
  assert.deepEqual(total.groups[0].items[0].fields[1], { label: 'Total Orders', value: '4' });

  const unknown = presentAnalysisResult({ nested: { values: ['unexpected'] } }, 'en');
  assert.equal(unknown.summary, 'ARIA completed the calculation. View the structured result below for the full detail.');
  assert.deepEqual(unknown.groups, []);
  assert.match(unknown.rawResult, /unexpected/);
  assert.equal(structuredResultText(null), 'null');
});

test('result cards are capped and localize their merchant-facing labels', () => {
  const customers = Array.from({ length: 13 }, (_, index) => ({ customerName: `Customer ${index + 1}`, daysQuiet: index }));
  const presentation = presentAnalysisResult({ customers }, 'pg');

  assert.equal(presentation.groups[0].items.length, 12);
  assert.equal(presentation.groups[0].remainingCount, 1);
  assert.match(presentation.groups[0].remainingLabel, /1 more result/);
  assert.equal(presentation.groups[0].items[0].fields[0].label, 'Days wey customer quiet');
  assert.equal(presentation.groups[0].items[0].fields[0].value, '0 days');
});
