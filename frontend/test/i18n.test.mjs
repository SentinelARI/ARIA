import assert from 'node:assert/strict';
import test from 'node:test';
import { errorMessage, greetingFor, lagosDayKey, lagosWeekday, localeMeta, localizedAction, localizedLedgerEntry, normalizeLocale, translate } from '../app/i18n.mjs';

const churnAction = {
  kind: 'churn-risk',
  customerName: 'Amara Okafor',
  copy: { key: 'churnRisk', params: { customerName: 'Amara Okafor', firstName: 'Amara', product: 'Ankara' } }
};

test('Pidgin localizes action, ledger, error, and document-language content', () => {
  const action = localizedAction(churnAction, 'pg');
  const ledger = localizedLedgerEntry({ copy: { key: 'supplierDelaySurfaced', statusKey: 'merchantCalledSupplier' } }, 'pg');
  assert.equal(localeMeta('pg').htmlLang, 'pcm');
  assert.equal(greetingFor('pg', 9, 'Aisha'), 'Gud morning, Aisha.');
  assert.match(action.title, /fit don dey pull away/);
  assert.match(action.action, /don land/);
  assert.equal(ledger.title, 'Supplier delay don show');
  assert.equal(ledger.status, 'Merchant call the supplier');
  assert.equal(errorMessage('pg', { code: 'invalidQuestion' }), 'Ask business question wey get between 3 and 300 character.');
});

test('English and Pidgin use structured copy instead of an English sentence fallback', () => {
  const english = localizedAction(churnAction, 'en');
  const pidgin = localizedAction(churnAction, 'pg');
  assert.equal(english.title, 'Amara Okafor may be drifting away');
  assert.notEqual(pidgin.title, english.title);
  assert.equal(normalizeLocale('unknown'), 'en');
  assert.equal(translate('pg', 'action.useDraft'), 'Use draft');
  assert.match(errorMessage('en', { code: 'aiQuotaExceeded' }), /billing or credits/);
  assert.match(errorMessage('pg', { code: 'aiQuotaExceeded' }), /API quota/);
  assert.match(errorMessage('en', { code: 'aiProvidersUnavailable' }), /Both configured AI services/);
  assert.match(errorMessage('pg', { code: 'aiProvidersUnavailable' }), /Both configured AI services/);
});

test('Lagos date helpers derive the current local calendar day', () => {
  const monday = new Date('2026-07-20T12:00:00.000Z');
  const tuesday = new Date('2026-07-21T00:30:00.000Z');
  assert.equal(lagosWeekday(monday, 'en'), 'MONDAY');
  assert.notEqual(lagosDayKey(monday), lagosDayKey(tuesday));
});
