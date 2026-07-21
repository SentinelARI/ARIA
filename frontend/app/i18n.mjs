export const defaultLocale = 'en';

export const localeOptions = Object.freeze([
  Object.freeze({ code: 'en', label: 'EN', name: 'English', htmlLang: 'en', formatLocale: 'en-GB', speechLang: 'en-NG' }),
  Object.freeze({ code: 'pg', label: 'PG', name: 'Nigerian Pidgin', htmlLang: 'pcm', formatLocale: 'en-NG', speechLang: 'pcm-NG' })
]);

const localeByCode = new Map(localeOptions.map((locale) => [locale.code, locale]));

const copy = {
  en: {
    today: 'TODAY',
    'greeting.default': 'Hello, {{name}}.',
    'greeting.morning': 'Good morning, {{name}}.',
    'greeting.afternoon': 'Good afternoon, {{name}}.',
    'greeting.evening': 'Good evening, {{name}}.',
    'nav.controls': 'Application controls',
    'nav.live': 'Watching fresh synthetic signals',
    'nav.loading': 'Loading synthetic signals',
    'nav.fallback': 'Showing a built-in sample brief',
    'nav.language': 'Choose language',
    'nav.languageOption': 'Use {{language}}',
    'nav.theme': 'Switch to {{theme}} mode',
    'theme.light': 'light',
    'theme.dark': 'dark',
    'skip': 'Skip to your Morning Brief',
    'hero.description': 'ARIA reads the signals from {{business}}, then keeps only the actions worth a merchant\'s time.',
    'hero.subhead': 'Here\'s what matters today.',
    'merchant.choose': 'Choose a synthetic demo merchant',
    'merchant.demo': 'Demo merchant',
    'signals.actions': ({ count }) => `${count} ${count === 1 ? 'action' : 'actions'} surfaced`,
    'signals.read': ({ count }) => `${count} synthetic ${count === 1 ? 'signal' : 'signals'} read`,
    'signals.discarded': ({ count }) => `${count} ${count === 1 ? 'opportunity' : 'opportunities'} quietly discarded`,
    'signals.discardedSuffix': ({ count }) => `${count === 1 ? 'opportunity' : 'opportunities'} quietly discarded`,
    'signals.listen': 'Listen to brief',
    'brief.eyebrow': 'MORNING BRIEF',
    'brief.title': 'What needs {{name}}\'s attention today',
    'brief.note': 'This week, {{signals}} signals came in. {{discarded}} did not need {{name}}\'s time.',
    'kind.churn-risk': 'Customer signal',
    'kind.pricing-anomaly': 'Pricing signal',
    'kind.supplier-delay': 'Supplier signal',
    'kind.inventory': 'Inventory window',
    'kind.sales-opportunity': 'Sales opportunity',
    'kind.payment': 'Payment signal',
    'kind.default': 'Business signal',
    'confidence': '{{value}}% confidence',
    'confidence.label': 'confidence',
    'priorityScore': 'Priority score {{value}}',
    'priority': 'priority',
    'sparkline.aria': 'This customer\'s recent order amounts show the drop that triggered this insight.',
    'sparkline.label': 'Order rhythm changed',
    'action.useDraft': 'Use draft',
    'action.draftReady': 'Draft ready',
    'action.why': 'Why did ARIA pick this?',
    'action.hideReasoning': 'Hide reasoning',
    'defense.eyebrow': 'Watching this get worked out, live',
    'defense.loading': 'ARIA is re-checking current signals',
    'defense.currentEvidence': 'Calculated from current structured events',
    'reasoning.degraded': 'AI enrichment is unavailable. Ranked actions still come from current structured signals.',
    'analysis.eyebrow': 'CODEX ANALYSIS AGENT',
    'analysis.description': 'ARIA creates a small program from structured event data and executes it inside a capability-free V8 isolate.',
    'analysis.title': 'Ask ARIA a new business question',
    'analysis.label': 'Business question',
    'analysis.placeholder': 'e.g. Which customers have gone quiet?',
    'analysis.run': 'Run analysis',
    'analysis.running': 'Running safely...',
    'analysis.helper': 'Ask about sales, customers, stock, prices, or suppliers.',
    'analysis.invalid': 'Analysis needs a different question.',
    'analysis.resultHeading': 'Fresh sandbox run',
    'analysis.boundary': 'No host capabilities · 128 MB · 5 seconds',
    'analysis.result': 'Result',
    'agent.eyebrow': 'CONTROL ROOM',
    'agent.title': 'How ARIA reaches today\'s brief',
    'agent.description': 'Each answer begins with structured synthetic events. Priority removes noise; Defense checks the current evidence again when asked.',
    'agent.ingestion.label': 'Ingestion Agent',
    'agent.ingestion.blurb': 'Parses synthetic SMS, WhatsApp, and email into structured events',
    'agent.analysis.label': 'Codex Analysis',
    'agent.analysis.blurb': 'Writes and runs a fresh script for open-ended questions',
    'agent.reasoning.label': 'Reasoning Agent',
    'agent.reasoning.blurb': 'Reads weeks of history for multi-signal patterns',
    'agent.priority.label': 'Priority Agent',
    'agent.priority.blurb': 'Discards anything that fails actionability, urgency, or value',
    'agent.defense.label': 'Defense Agent',
    'agent.defense.blurb': 'Re-derives its reasoning live whenever asked why',
    'trust.eyebrow': 'TRUST LEDGER',
    'trust.title': 'What ARIA helped {{name}} notice',
    'trust.description': 'Entries come from this merchant\'s 12-week synthetic history. ARIA suggests a draft; it never messages customers or makes financial decisions without the merchant.',
    'trust.summaryAria': '{{count}} actions surfaced for {{name}} today',
    'trust.summary': '{{count}} {{actionLabel}} worth {{name}}\'s time today.',
    'trust.actionLabel': ({ count }) => count === 1 ? 'action' : 'actions',
    'trust.empty': 'Connect the API to load this merchant\'s synthetic history.',
    'toast.title': 'Draft ready for {{name}}\'s review',
    'toast.dismiss': 'Dismiss',
    'error.liveData': 'Could not reach ARIA\'s live data. Showing the built-in sample brief.',
    'error.requestFailed': 'ARIA could not complete that request.',
    'error.analysisQuestionRequired': 'Ask a business question before running analysis.',
    'error.invalidQuestion': 'Ask a business question between 3 and 300 characters.',
    'error.unsafeQuestion': 'ARIA cannot access secrets or follow instruction-like requests. Ask about sales, customers, stock, prices, or suppliers.',
    'error.offTopicQuestion': 'ARIA only analyzes this merchant\'s sales, customers, stock, prices, and suppliers - not general knowledge.',
    'error.merchantNotFound': 'That demo merchant could not be found.',
    'error.insightNotFound': 'Choose a surfaced insight to re-check.',
    'error.rateLimitAnalysis': 'Please wait a minute before running more analyses.',
    'error.rateLimitDefense': 'Please wait a minute before asking ARIA to re-check another action.',
    'error.serviceUnavailable': 'ARIA is temporarily unavailable. Please try again shortly.',
    'error.analysisFailed': 'ARIA could not safely complete that analysis. Try a more specific business question.',
    'error.aiNotConfigured': 'The AI service has not been configured on the server.',
    'error.aiAuthenticationFailed': 'The AI service rejected the server configuration. The operator should verify the API key.',
    'error.aiAccessDenied': 'This API key does not have permission to use the configured AI service.',
    'error.aiModelUnavailable': 'The configured AI model is unavailable for this project. The operator should choose an accessible model.',
    'error.aiQuotaExceeded': 'This AI project has no available API quota. The operator must add billing or credits before live AI can run.',
    'error.aiRateLimited': 'The AI service is receiving too many requests. Please try again shortly.',
    'error.aiTimedOut': 'The AI service took too long to respond. Please try again.',
    'error.aiInvalidResponse': 'The AI service returned a response ARIA could not safely use. Please try again.',
    'error.aiServiceUnavailable': 'ARIA is temporarily unavailable. Please try again shortly.',
    'error.apiNotConfigured': 'This deployment is missing its live API URL. Set NEXT_PUBLIC_API_URL to the Railway API origin and redeploy.',
    'error.apiGatewayError': 'The live API returned an unusable gateway response. Please try again shortly.',
    'error.invalidApiResponse': 'The live API returned an invalid response. Please try again.',
    'error.requestTimedOut': 'ARIA took too long to respond. Please try again.',
    'action.churnRisk.title': '{{customerName}} may be drifting away',
    'action.churnRisk.action': 'Send {{firstName}} a personal check-in and show the latest {{product}} arrivals.',
    'action.churnRisk.draft': 'Hi {{firstName}}, we just received fresh {{product}} options I think you would like. Should I send you a quick video before they go?',
    'action.pricingAnomaly.title': 'Review {{firstName}}\'s {{product}} price',
    'action.pricingAnomaly.action': 'Check whether {{firstName}}\'s repeat {{product}} price is still intentional before the next order.',
    'action.pricingAnomaly.draft': 'Hi {{firstName}}, I am reviewing our current {{product}} prices before your next order. Should I reserve your usual quantity while I confirm the best option?',
    'action.supplierDelay.title': '{{product}} delivery is {{overdueDays}} {{dayLabel}} late',
    'action.supplierDelay.action': 'Contact {{supplierName}} today and confirm a delivery date before the {{product}} gap affects repeat buyers.',
    'action.supplierDelay.draft': 'Hello {{supplierName}}, our {{product}} delivery is now overdue. Please confirm the delivery date today so we can plan stock for customers.',
    'action.inventory.title': 'Turn the recent {{product}} restock into sales',
    'action.inventory.action': 'Share a short arrivals update with repeat {{product}} buyers while the stock is fresh.',
    'action.inventory.draft': 'New {{product}} stock just landed. I saved options that match what you normally pick - would you like a quick video?',
    'action.salesOpportunity.title': 'Create a weekend {{product}} bundle offer',
    'action.salesOpportunity.action': 'Bundle three slower-moving {{product}} options and share the offer with recent buyers.',
    'action.salesOpportunity.draft': 'I put together a weekend {{product}} bundle with three options at a better price. Would you like me to reserve one?',
    'action.payment.title': 'Follow up on {{customerName}}\'s payment',
    'action.payment.action': 'No action needed.',
    'action.payment.draft': '',
    'ledger.adireRestockShared': 'Adire restock shared',
    'ledger.laceCustomerCheckInSurfaced': 'Lace customer check-in surfaced',
    'ledger.weekendBundleDrafted': 'Weekend bundle drafted',
    'ledger.repeatBuyerFollowUpSurfaced': 'Repeat buyer follow-up surfaced',
    'ledger.screenProtectorRestockShared': 'Screen protector restock shared',
    'ledger.supplierDelaySurfaced': 'Supplier delay surfaced',
    'ledger.phoneCaseBundleDrafted': 'Phone case bundle drafted',
    'ledger.noActionSurfaced': 'No action surfaced',
    'ledger.status.merchantApprovedDraft': 'Merchant approved the drafted message',
    'ledger.status.ariaStayedQuiet': 'ARIA stayed quiet after checking the signals',
    'ledger.status.awaitingMerchantApproval': 'Awaiting {{name}}\'s approval',
    'ledger.status.merchantDeclinedDraft': 'Merchant chose not to send it',
    'ledger.status.merchantCalledSupplier': 'Merchant called the supplier'
  },
  pg: {
    today: 'TODAY',
    'greeting.default': 'How far, {{name}}.',
    'greeting.morning': 'Gud morning, {{name}}.',
    'greeting.afternoon': 'Gud afternoon, {{name}}.',
    'greeting.evening': 'Gud evening, {{name}}.',
    'nav.controls': 'App control',
    'nav.live': 'ARIA dey watch fresh synthetic signal dem',
    'nav.loading': 'ARIA dey load synthetic signal dem',
    'nav.fallback': 'ARIA dey show built-in sample brief',
    'nav.language': 'Pick language',
    'nav.languageOption': 'Use {{language}}',
    'nav.theme': 'Change go {{theme}} mode',
    'theme.light': 'light',
    'theme.dark': 'dark',
    'skip': 'Jump go your Morning Brief',
    'hero.description': 'ARIA dey read signal from {{business}}, then e go keep only action wey worth merchant time.',
    'hero.subhead': 'Na only the things wey need your attention today.',
    'merchant.choose': 'Choose synthetic demo merchant',
    'merchant.demo': 'Demo merchant',
    'signals.actions': ({ count }) => `${count} action${count === 1 ? '' : ' dem'} show`,
    'signals.read': ({ count }) => `${count} synthetic signal${count === 1 ? '' : ' dem'} don read`,
    'signals.discarded': ({ count }) => `${count} opportunity${count === 1 ? '' : ' dem'} ARIA comot quietly`,
    'signals.discardedSuffix': ({ count }) => `opportunity${count === 1 ? '' : ' dem'} ARIA comot quietly`,
    'signals.listen': 'Hear brief',
    'brief.eyebrow': 'MORNING BRIEF',
    'brief.title': 'Wetin need {{name}} attention today',
    'brief.note': 'This week, {{signals}} signal dem land. {{discarded}} no need {{name}} time.',
    'kind.churn-risk': 'Customer matter',
    'kind.pricing-anomaly': 'Price matter',
    'kind.supplier-delay': 'Supplier matter',
    'kind.inventory': 'Stock window',
    'kind.sales-opportunity': 'Sales chance',
    'kind.payment': 'Payment matter',
    'kind.default': 'Business matter',
    'confidence': '{{value}}% confidence',
    'confidence.label': 'confidence',
    'priorityScore': 'Priority score {{value}}',
    'priority': 'priority',
    'sparkline.aria': 'This customer order amount don change and na e trigger this insight.',
    'sparkline.label': 'Order rhythm don change',
    'action.useDraft': 'Use draft',
    'action.draftReady': 'Draft don ready',
    'action.why': 'Why ARIA pick this one?',
    'action.hideReasoning': 'Hide reason',
    'defense.eyebrow': 'See as ARIA dey work am out, live',
    'defense.loading': 'ARIA dey check current signal dem again',
    'defense.currentEvidence': 'ARIA calculate am from current structured event dem',
    'reasoning.degraded': 'AI enrichment no dey available. Ranked actions still come from current structured signals.',
    'analysis.eyebrow': 'CODEX ANALYSIS AGENT',
    'analysis.description': 'ARIA dey create small program from structured event data and run am inside V8 isolate wey no get host permission.',
    'analysis.title': 'Ask ARIA new business question',
    'analysis.label': 'Business question',
    'analysis.placeholder': 'e.g. Which customer don quiet?',
    'analysis.run': 'Run analysis',
    'analysis.running': 'E dey run safely...',
    'analysis.helper': 'Ask about sales, customer, stock, price, or supplier.',
    'analysis.invalid': 'This analysis need another question.',
    'analysis.resultHeading': 'Fresh sandbox run',
    'analysis.boundary': 'No host capability · 128 MB · 5 seconds',
    'analysis.result': 'Result',
    'agent.eyebrow': 'CONTROL ROOM',
    'agent.title': 'How ARIA take reach today brief',
    'agent.description': 'Every answer start from structured synthetic event dem. Priority dey remove noise; Defense dey check current evidence again when you ask.',
    'agent.ingestion.label': 'Ingestion Agent',
    'agent.ingestion.blurb': 'E dey turn synthetic SMS, WhatsApp, and email to structured event',
    'agent.analysis.label': 'Codex Analysis',
    'agent.analysis.blurb': 'E dey write and run fresh script for open question',
    'agent.reasoning.label': 'Reasoning Agent',
    'agent.reasoning.blurb': 'E dey read weeks of history find pattern wey connect',
    'agent.priority.label': 'Priority Agent',
    'agent.priority.blurb': 'E dey comot anything wey no get action, urgency, or value',
    'agent.defense.label': 'Defense Agent',
    'agent.defense.blurb': 'E dey work out the reason live any time you ask why',
    'trust.eyebrow': 'TRUST LEDGER',
    'trust.title': 'Wetin ARIA help {{name}} notice',
    'trust.description': 'These entry come from this merchant 12-week synthetic history. ARIA fit suggest draft, but e no dey message customer or make money decision without merchant.',
    'trust.summaryAria': '{{count}} action dem show for {{name}} today',
    'trust.summary': '{{count}} {{actionLabel}} wey worth {{name}} time today.',
    'trust.actionLabel': ({ count }) => count === 1 ? 'action' : 'action dem',
    'trust.empty': 'Connect API make e load this merchant synthetic history.',
    'toast.title': 'Draft don ready make {{name}} review am',
    'toast.dismiss': 'Close',
    'error.liveData': 'ARIA live data no connect. E dey show built-in sample brief.',
    'error.requestFailed': 'ARIA no fit complete that request.',
    'error.analysisQuestionRequired': 'Ask business question before you run analysis.',
    'error.invalidQuestion': 'Ask business question wey get between 3 and 300 character.',
    'error.unsafeQuestion': 'ARIA no fit access secret or follow instruction-like request. Ask about sales, customer, stock, price, or supplier.',
    'error.offTopicQuestion': 'ARIA only dey analyze this merchant sales, customer, stock, price, and supplier - no be general knowledge.',
    'error.merchantNotFound': 'This demo merchant no dey.',
    'error.insightNotFound': 'Choose insight wey show make ARIA check am again.',
    'error.rateLimitAnalysis': 'Abeg wait one minute before you run more analysis.',
    'error.rateLimitDefense': 'Abeg wait one minute before you ask ARIA make e check another action.',
    'error.serviceUnavailable': 'ARIA no dey available now. Abeg try again soon.',
    'error.analysisFailed': 'ARIA no fit run this analysis safely. Try ask am another business question.',
    'error.aiNotConfigured': 'Person wey manage ARIA never set the AI service well.',
    'error.aiAuthenticationFailed': 'The AI service reject ARIA configuration. Person wey manage am need check the API key.',
    'error.aiAccessDenied': 'This API key no get permission to use the configured AI service.',
    'error.aiModelUnavailable': 'The AI model wey ARIA configure no dey available for this project. Person wey manage am need choose another model.',
    'error.aiQuotaExceeded': 'This AI project don finish API quota. Person wey manage am need add billing or credit before e fit work again.',
    'error.aiRateLimited': 'The AI service get too many request now. Abeg try again shortly.',
    'error.aiTimedOut': 'The AI service take too long to answer. Abeg try again.',
    'error.aiInvalidResponse': 'The AI service return answer wey ARIA no fit use safely. Abeg try again.',
    'error.aiServiceUnavailable': 'ARIA no dey available now. Abeg try again soon.',
    'error.apiNotConfigured': 'This deployment never get live API URL. Set NEXT_PUBLIC_API_URL to the Railway API origin and redeploy.',
    'error.apiGatewayError': 'The live API return gateway response wey ARIA no fit use. Abeg try again shortly.',
    'error.invalidApiResponse': 'The live API return invalid response. Abeg try again.',
    'error.requestTimedOut': 'ARIA take too long to answer. Abeg try again.',
    'action.churnRisk.title': '{{customerName}} fit don dey pull away',
    'action.churnRisk.action': 'Send {{firstName}} personal message and show am the latest {{product}} wey don land.',
    'action.churnRisk.draft': 'Hi {{firstName}}, fresh {{product}} don land and I feel say you go like am. You want make I send quick video before e finish?',
    'action.pricingAnomaly.title': 'Check {{firstName}} {{product}} price again',
    'action.pricingAnomaly.action': 'Check if the repeat {{product}} price wey {{firstName}} dey get still make sense before next order.',
    'action.pricingAnomaly.draft': 'Hi {{firstName}}, I dey check our current {{product}} price before your next order. You want make I keep your normal quantity while I confirm the best option?',
    'action.supplierDelay.title': '{{product}} delivery don late {{overdueDays}} {{dayLabel}}',
    'action.supplierDelay.action': 'Call {{supplierName}} today make dem confirm delivery date before {{product}} shortage affect repeat buyer dem.',
    'action.supplierDelay.draft': 'Hello {{supplierName}}, our {{product}} delivery don overdue. Abeg confirm delivery date today make we fit plan stock for customer dem.',
    'action.inventory.title': 'Turn recent {{product}} restock to sales',
    'action.inventory.action': 'Share short arrival update with repeat {{product}} buyer dem while the stock still fresh.',
    'action.inventory.draft': 'New {{product}} stock don land. I save option wey match wetin you normally dey pick - you want quick video?',
    'action.salesOpportunity.title': 'Make weekend {{product}} bundle offer',
    'action.salesOpportunity.action': 'Join three {{product}} option wey slow move and share the offer with recent buyer dem.',
    'action.salesOpportunity.draft': 'I put together weekend {{product}} bundle with three option for better price. You want make I reserve one?',
    'action.payment.title': 'Follow up {{customerName}} payment',
    'action.payment.action': 'No action need.',
    'action.payment.draft': '',
    'ledger.adireRestockShared': 'Adire restock don share',
    'ledger.laceCustomerCheckInSurfaced': 'Lace customer check-in don show',
    'ledger.weekendBundleDrafted': 'Weekend bundle draft don ready',
    'ledger.repeatBuyerFollowUpSurfaced': 'Repeat buyer follow-up don show',
    'ledger.screenProtectorRestockShared': 'Screen protector restock don share',
    'ledger.supplierDelaySurfaced': 'Supplier delay don show',
    'ledger.phoneCaseBundleDrafted': 'Phone case bundle draft don ready',
    'ledger.noActionSurfaced': 'No action show',
    'ledger.status.merchantApprovedDraft': 'Merchant approve the drafted message',
    'ledger.status.ariaStayedQuiet': 'ARIA stay quiet after e check the signal dem',
    'ledger.status.awaitingMerchantApproval': 'E dey wait for {{name}} approval',
    'ledger.status.merchantDeclinedDraft': 'Merchant choose no send am',
    'ledger.status.merchantCalledSupplier': 'Merchant call the supplier'
  }
};

function interpolate(template, values) {
  return template.replace(/{{(\w+)}}/g, (_match, key) => String(values[key] ?? ''));
}

export function normalizeLocale(locale) {
  return localeByCode.has(locale) ? locale : defaultLocale;
}

export function localeMeta(locale) {
  return localeByCode.get(normalizeLocale(locale));
}

export function translate(locale, key, values = {}) {
  const entry = copy[normalizeLocale(locale)]?.[key] ?? copy[defaultLocale][key] ?? key;
  return typeof entry === 'function' ? entry(values) : interpolate(entry, values);
}

export function errorMessage(locale, error) {
  const code = typeof error === 'string' ? error : error?.code;
  const message = typeof error === 'object' ? error?.message : null;
  return code && copy[normalizeLocale(locale)]?.[`error.${code}`]
    ? translate(locale, `error.${code}`)
    : message || translate(locale, 'error.requestFailed');
}

export function greetingFor(locale, hour, name) {
  const period = hour === null || Number.isNaN(hour) ? 'default' : hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
  return translate(locale, `greeting.${period}`, { name });
}

export function lagosHour(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const value = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(date);
  const hour = Number(value);
  return Number.isNaN(hour) ? null : hour;
}

export function lagosWeekday(date, locale) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return translate(locale, 'today');
  const meta = localeMeta(locale);
  return new Intl.DateTimeFormat(meta.formatLocale, { weekday: 'long', timeZone: 'Africa/Lagos' }).format(date).toLocaleUpperCase(meta.formatLocale);
}

export function lagosDayKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Lagos' }).format(date);
}

export function formatLedgerDate(date, locale) {
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return '';
  return new Intl.DateTimeFormat(localeMeta(locale).formatLocale, { day: '2-digit', month: 'short', timeZone: 'Africa/Lagos' }).format(value);
}

export function typeLabel(kind, locale) {
  const key = `kind.${kind}`;
  return copy[normalizeLocale(locale)]?.[key] || copy[defaultLocale][key]
    ? translate(locale, key)
    : translate(locale, 'kind.default');
}

function firstName(name) {
  return typeof name === 'string' ? name.split(' ')[0] : '';
}

function actionValues(action) {
  const params = action.copy?.params ?? {};
  const overdueDays = params.overdueDays ?? action.evidence?.overdueDays ?? 0;
  return {
    customerName: params.customerName ?? action.customerName ?? '',
    firstName: params.firstName ?? firstName(action.customerName),
    product: params.product ?? action.evidence?.product ?? '',
    supplierName: params.supplierName ?? action.evidence?.supplierName ?? '',
    overdueDays,
    dayLabel: overdueDays === 1 ? 'day' : 'days'
  };
}

export function localizedAction(action, locale) {
  const key = action.copy?.key;
  if (!key || !copy[defaultLocale][`action.${key}.title`]) {
    return { title: action.title, action: action.action, draftMessage: action.draftMessage };
  }
  const values = actionValues(action);
  const pidginValues = { ...values, dayLabel: values.overdueDays === 1 ? 'day' : 'days' };
  return {
    title: translate(locale, `action.${key}.title`, pidginValues),
    action: translate(locale, `action.${key}.action`, pidginValues),
    draftMessage: translate(locale, `action.${key}.draft`, pidginValues)
  };
}

export function localizedLedgerEntry(entry, locale) {
  const key = entry.copy?.key;
  const statusKey = entry.copy?.statusKey;
  const values = entry.copy?.params ?? {};
  return {
    title: key ? translate(locale, `ledger.${key}`, values) : entry.title,
    status: statusKey ? translate(locale, `ledger.status.${statusKey}`, values) : entry.status
  };
}

export function speechLocale(locale) {
  return localeMeta(locale).speechLang;
}
