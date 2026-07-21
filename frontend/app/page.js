'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage, formatLedgerDate, greetingFor, lagosDayKey, lagosHour, lagosWeekday, localeMeta, localeOptions, localizedAction, localizedLedgerEntry, normalizeLocale, speechLocale, translate, typeLabel } from './i18n.mjs';
import { analysisResultFromPayload, apiEndpoint, fetchWithTimeout, normalizedRequestError, readJsonResponse, resolveApiOrigin, shouldRetryReasoningError } from './api.mjs';

const apiUrl = resolveApiOrigin({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL, NODE_ENV: process.env.NODE_ENV });

const fallbackMerchants = [
  { id: 'aisha-textiles', name: 'Aisha', business: 'Aisha Textiles', location: 'Yaba, Lagos', sector: 'Fabric retail' },
  { id: 'kola-mobile', name: 'Kola', business: 'Kola Mobile Accessories', location: 'Computer Village, Lagos', sector: 'Phone accessories' }
];

const fallbackActions = [
  {
    id: 'churn-cust-amara',
    kind: 'churn-risk',
    title: 'Amara Okafor may be drifting away',
    action: 'Send Amara a personal check-in and show the latest Ankara arrivals.',
    draftMessage: 'Hi Amara, we just received fresh Ankara options I think you would like. Should I send you a quick video before they go?',
    customerName: 'Amara Okafor',
    copy: { key: 'churnRisk', params: { customerName: 'Amara Okafor', firstName: 'Amara', product: 'Ankara' } },
    evidence: { product: 'Ankara' },
    confidence: 86,
    priorityScore: 95
  },
  {
    id: 'pricing-cust-ijeoma-lace-fabric',
    kind: 'pricing-anomaly',
    title: 'Review Ijeoma’s lace fabric price',
    action: 'Check whether Ijeoma’s repeat lace fabric price is still intentional before the next order.',
    draftMessage: 'Hi Ijeoma, I am reviewing our current lace fabric prices before your next order. Should I reserve your usual quantity while I confirm the best option?',
    customerName: 'Ijeoma Nwosu',
    copy: { key: 'pricingAnomaly', params: { firstName: 'Ijeoma', product: 'lace fabric' } },
    evidence: { product: 'lace fabric' },
    confidence: 82,
    priorityScore: 85
  },
  {
    id: 'inventory-follow-up-transaction-1',
    kind: 'inventory',
    title: 'Turn yesterday’s Ankara restock into sales',
    action: 'Share a short arrivals update with repeat Ankara buyers before the weekend.',
    draftMessage: 'New Ankara stock just landed. I saved options that match what you normally pick — would you like a quick video?',
    copy: { key: 'inventory', params: { product: 'Ankara' } },
    evidence: { product: 'Ankara' },
    confidence: 79,
    priorityScore: 87
  }
];

const fallbackSummary = { signalsRead: 0, opportunitiesEvaluated: 0, actionsSurfaced: 3, opportunitiesDiscarded: 0 };

function responseError(payload) {
  return { code: payload?.errorCode ?? 'requestFailed', message: payload?.error };
}

function Icon({ name, size = 20 }) {
  const paths = {
    spark: <path d="m12 2 1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8L12 2Z" />,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    message: <><path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.6 8.6 0 0 1-3.8-.9L4 20l1.4-4A7.2 7.2 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
    shield: <><path d="M12 3 5 6v5c0 4.4 3 8.4 7 10 4-1.6 7-5.6 7-10V6l-7-3Z" /><path d="m9 12 2 2 4-4" /></>,
    moon: <path d="M20.2 14.2A8.5 8.5 0 0 1 9.8 3.8 8.5 8.5 0 1 0 20.2 14.2Z" />,
    sun: <><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    volume: <><path d="M4 10v4h3l4 3V7l-4 3H4Z" /><path d="M15 9.5a4 4 0 0 1 0 5M17.5 7a7.2 7.2 0 0 1 0 10" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    terminal: <><path d="m5 7 4 4-4 4M12 17h7" /></>,
    chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 5-7" /></>,
    inbox: <><path d="M4 12h4l2 3h4l2-3h4" /><path d="M4 12 6 5h12l2 7v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6Z" /></>,
    building: <><path d="M4 21V4h11v17M15 9h5v12" /><path d="M7 8h4M7 12h4M7 16h4M17 13h1M17 17h1" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function parseSseMessage(message) {
  const lines = message.split('\n');
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
  const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
  return { event, payload: JSON.parse(data) };
}

async function consumeSse(response, onEvent, signal) {
  if (!response.body) throw Object.assign(new Error('ARIA could not open the live reasoning stream.'), { code: 'requestFailed' });
  const reader = response.body.getReader();
  const cancelReader = () => { void reader.cancel(); };
  signal?.addEventListener('abort', cancelReader, { once: true });
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done }).replaceAll('\r\n', '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary >= 0) {
        const message = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        if (message.trim()) onEvent(parseSseMessage(message));
        boundary = buffer.indexOf('\n\n');
      }
      if (done) return;
    }
  } finally {
    signal?.removeEventListener('abort', cancelReader);
    reader.releaseLock();
  }
}

function useCountUp(value) {
  const [displayValue, setDisplayValue] = useState(0);
  const previousValue = useRef(0);
  useEffect(() => {
    const startValue = previousValue.current;
    previousValue.current = value;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(value);
      return undefined;
    }
    const startedAt = performance.now();
    let frame;
    const update = (now) => {
      const progress = Math.min(1, (now - startedAt) / 420);
      setDisplayValue(Math.round(startValue + (value - startValue) * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return displayValue;
}

function AnimatedNumber({ value }) {
  const displayValue = useCountUp(value);
  return <span aria-hidden="true">{displayValue}</span>;
}

function useLiveTime(referenceAt) {
  const [clientTick, setClientTick] = useState(null);
  useEffect(() => {
    const update = () => setClientTick(Date.now());
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return useMemo(() => {
    if (clientTick === null) return null;
    const serverTime = new Date(referenceAt?.value);
    if (!referenceAt || Number.isNaN(serverTime.getTime())) return new Date(clientTick);
    return new Date(serverTime.getTime() + clientTick - referenceAt.receivedAt);
  }, [clientTick, referenceAt]);
}

function Sparkline({ series = [], locale }) {
  if (series.length < 2) return null;
  const maximum = Math.max(...series);
  const minimum = Math.min(...series);
  const range = maximum - minimum || 1;
  const points = series.map((value, index) => {
    const x = 4 + (index / (series.length - 1)) * 172;
    const y = 38 - ((value - minimum) / range) * 30;
    return `${x} ${y}`;
  });
  const path = `M${points.join(' L')}`;
  const [lastX, lastY] = points.at(-1).split(' ').map(Number);
  return <div className="sparkline" role="img" aria-label={translate(locale, 'sparkline.aria')}>
    <svg viewBox="0 0 180 44" aria-hidden="true"><path className="spark-base" d="M2 34H178" /><path className="spark-path" d={path} /><circle cx={lastX} cy={lastY} r="4" className="spark-point" /></svg>
    <span>{translate(locale, 'sparkline.label')}</span>
  </div>;
}

function AgentFlow({ active, locale }) {
  const agents = [
    ['Ingestion', 'inbox'],
    ['Analysis', 'terminal'],
    ['Reasoning', 'chart'],
    ['Priority', 'shield'],
    ['Defense', 'message']
  ];
  return <section className="control-room textile-motif" aria-labelledby="control-title"><div><p className="eyebrow">{translate(locale, 'agent.eyebrow')}</p><h2 id="control-title">{translate(locale, 'agent.title')}</h2><p>{translate(locale, 'agent.description')}</p></div><ol className="agent-flow">{agents.map(([id, icon], index) => <li key={id} className={active === id ? 'active' : ''}><div className="agent-flow-top"><span>{String(index + 1).padStart(2, '0')}</span><Icon name={icon} size={18} /></div><div><strong>{translate(locale, `agent.${id.toLowerCase()}.label`)}</strong><small>{translate(locale, `agent.${id.toLowerCase()}.blurb`)}</small></div></li>)}</ol></section>;
}

function formatAnalysisResult(result) {
  return JSON.stringify(result, null, 2) ?? 'null';
}

function AnalysisResult({ analysis, locale }) {
  if (!analysis || analysis.error) return null;
  return <div className="analysis-result" aria-live="polite">
    <div className="result-heading">
      <span><Icon name="terminal" size={17} /> {translate(locale, 'analysis.resultHeading')}</span>
      <span>{translate(locale, 'analysis.boundary')}</span>
    </div>
    <div className="result-output">
      <strong>{translate(locale, 'analysis.result')}</strong>
      <pre className="analysis-output">{formatAnalysisResult(analysis.result)}</pre>
    </div>
  </div>;
}

export default function Home() {
  const [actions, setActions] = useState(fallbackActions);
  const [merchant, setMerchant] = useState(fallbackMerchants[0]);
  const [merchants, setMerchants] = useState(fallbackMerchants);
  const [merchantId, setMerchantId] = useState(fallbackMerchants[0].id);
  const [summary, setSummary] = useState(fallbackSummary);
  const [ledger, setLedger] = useState([]);
  const [referenceAt, setReferenceAt] = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState(null);
  const [reasoning, setReasoning] = useState({ status: 'unavailable', errorCode: null });
  const [briefReload, setBriefReload] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [defenses, setDefenses] = useState({});
  const [defenseLoading, setDefenseLoading] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [draftNotice, setDraftNotice] = useState(null);
  const [sentActionId, setSentActionId] = useState(null);
  const [theme, setTheme] = useState('light');
  const [locale, setLocale] = useState('en');
  const [activeAgent, setActiveAgent] = useState('Priority');
  const defenseController = useRef(null);
  const analysisController = useRef(null);
  const briefRetryAttempts = useRef(new Map());
  const now = useLiveTime(referenceAt);
  const animatedDiscardCount = useCountUp(summary.opportunitiesDiscarded);
  const currentLagosDay = lagosDayKey(now);
  const currentWeekday = lagosWeekday(now, locale);
  const currentHour = lagosHour(now);

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('aria-theme');
    if (savedTheme === 'dark') setTheme('dark');
    setLocale(normalizeLocale(window.localStorage.getItem('aria-locale')));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('aria-theme', theme);
  }, [theme]);

  useEffect(() => {
    const meta = localeMeta(locale);
    document.documentElement.lang = meta.htmlLang;
    window.localStorage.setItem('aria-locale', meta.code);
  }, [locale]);

  useEffect(() => {
    if (!currentLagosDay) return undefined;
    const controller = new AbortController();
    let retryTimer = null;
    setBriefLoading(true);
    setBriefError(null);
    setReasoning({ status: 'loading', errorCode: null });
    setActiveAgent('Ingestion');
    (async () => {
      const response = await fetchWithTimeout(apiEndpoint(apiUrl, `/api/brief?merchant=${encodeURIComponent(merchantId)}`), { signal: controller.signal });
      return readJsonResponse(response);
    })()
      .then((brief) => {
        setActions(brief.actions);
        setMerchant(brief.merchant);
        setMerchants(brief.merchants);
        setSummary(brief.prioritySummary);
        setLedger(brief.ledger);
        setReferenceAt({ value: brief.simulatedAt ?? new Date().toISOString(), receivedAt: Date.now() });
        const nextReasoning = { status: brief.reasoningStatus ?? 'unavailable', errorCode: brief.reasoningError ?? null };
        setReasoning(nextReasoning);
        setActiveAgent('Priority');
        const retryKey = `${merchantId}:${currentLagosDay}`;
        const retries = briefRetryAttempts.current.get(retryKey) ?? 0;
        if (nextReasoning.status !== 'ok' && shouldRetryReasoningError(nextReasoning.errorCode) && retries < 1) {
          briefRetryAttempts.current.set(retryKey, retries + 1);
          retryTimer = window.setTimeout(() => setBriefReload((value) => value + 1), 2_000);
        }
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          const normalized = normalizedRequestError(error);
          setBriefError({ code: normalized.code === 'apiNotConfigured' ? normalized.code : 'liveData', message: normalized.message });
          setReasoning({ status: 'unavailable', errorCode: normalized.code });
          setReferenceAt({ value: new Date().toISOString(), receivedAt: Date.now() });
          setActiveAgent('Priority');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBriefLoading(false);
      });
    return () => {
      controller.abort();
      if (retryTimer) window.clearTimeout(retryTimer);
    };
  }, [merchantId, currentLagosDay, briefReload]);

  useEffect(() => {
    if (!draftNotice) return undefined;
    const timeout = window.setTimeout(() => setDraftNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [draftNotice]);

  useEffect(() => () => {
    defenseController.current?.abort();
    analysisController.current?.abort();
  }, []);

  function clearDefense(insightId) {
    defenseController.current?.abort();
    defenseController.current = null;
    setExpandedId(null);
    setDefenseLoading(null);
    setDefenses((current) => {
      const { [insightId]: _discarded, ...remaining } = current;
      return remaining;
    });
  }

  async function askWhy(action) {
    if (expandedId === action.id) {
      clearDefense(action.id);
      return;
    }
    defenseController.current?.abort();
    const controller = new AbortController();
    defenseController.current = controller;
    setExpandedId(action.id);
    setDefenseLoading(action.id);
    setDefenses({ [action.id]: { narrative: '', confidence: action.confidence } });
    setActiveAgent('Defense');
    let streamTimedOut = false;
    const streamTimeout = window.setTimeout(() => {
      streamTimedOut = true;
      controller.abort();
    }, 55_000);
    try {
      const response = await fetchWithTimeout(apiEndpoint(apiUrl, '/api/defense/stream'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId, insightId: action.id, locale }),
        signal: controller.signal
      });
      if (!response.ok) {
        await readJsonResponse(response);
      }
      await consumeSse(response, ({ event, payload }) => {
        if (event === 'meta' || event === 'done') {
          setDefenses((current) => ({ ...current, [action.id]: { ...current[action.id], confidence: payload.confidence, recalculatedAt: payload.recalculatedAt } }));
        }
        if (event === 'delta') {
          setDefenseLoading(null);
          setDefenses((current) => ({ ...current, [action.id]: { ...current[action.id], narrative: `${current[action.id]?.narrative ?? ''}${payload.delta}` } }));
        }
        if (event === 'error') {
          const apiError = responseError(payload);
          throw Object.assign(new Error(apiError.message), { code: apiError.code });
        }
      }, controller.signal);
    } catch (error) {
      if (error.name === 'AbortError' && !streamTimedOut) return;
      const normalized = streamTimedOut
        ? Object.assign(new Error('ARIA took too long to respond.'), { code: 'requestTimedOut' })
        : normalizedRequestError(error);
      setDefenses({ [action.id]: { narrative: errorMessage(locale, { code: normalized.code, message: normalized.message }), confidence: action.confidence, error: true } });
    } finally {
      window.clearTimeout(streamTimeout);
      if (defenseController.current === controller) {
        defenseController.current = null;
        setDefenseLoading(null);
      }
    }
  }

  async function runAnalysis(event) {
    event.preventDefault();
    const submittedQuestion = question.trim();
    if (!submittedQuestion) {
      setAnalysis({ error: { code: 'analysisQuestionRequired' } });
      return;
    }
    analysisController.current?.abort();
    const controller = new AbortController();
    analysisController.current = controller;
    setAnalysisLoading(true);
    setAnalysis(null);
    setActiveAgent('Analysis');
    try {
      const response = await fetchWithTimeout(apiEndpoint(apiUrl, '/api/analysis'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId, question: submittedQuestion, locale }),
        signal: controller.signal
      });
      const payload = await readJsonResponse(response);
      const result = analysisResultFromPayload(payload);
      if (analysisController.current === controller) setAnalysis({ result });
    } catch (error) {
      if (controller.signal.aborted || error.name === 'AbortError') return;
      const normalized = normalizedRequestError(error);
      if (analysisController.current === controller) setAnalysis({ error: { code: normalized.code, message: normalized.message } });
    } finally {
      if (analysisController.current === controller) {
        analysisController.current = null;
        setAnalysisLoading(false);
      }
    }
  }

  function selectMerchant(nextMerchantId) {
    if (nextMerchantId === merchantId) return;
    defenseController.current?.abort();
    defenseController.current = null;
    analysisController.current?.abort();
    analysisController.current = null;
    setMerchantId(nextMerchantId);
    setExpandedId(null);
    setDefenses({});
    setDefenseLoading(null);
    setAnalysis(null);
    setAnalysisLoading(false);
    setSentActionId(null);
    setDraftNotice(null);
  }

  function useDraft(action) {
    setDraftNotice(localizedAction(action, locale).draftMessage);
    setSentActionId(action.id);
  }

  function speakBrief() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const message = new SpeechSynthesisUtterance(`${translate(locale, 'brief.title', { name: merchant.name })}. ${actions.map((action) => {
      const presented = localizedAction(action, locale);
      return `${presented.title}. ${presented.action}`;
    }).join(' ')}`);
    message.lang = speechLocale(locale);
    message.rate = 0.95;
    window.speechSynthesis.speak(message);
  }

  const copy = {
    greeting: greetingFor(locale, currentHour, merchant.name),
    subhead: translate(locale, 'hero.subhead'),
    brief: translate(locale, 'brief.title', { name: merchant.name }),
    briefNote: translate(locale, 'brief.note', { signals: summary.signalsRead, discarded: summary.opportunitiesDiscarded, name: merchant.name }),
    liveReasoning: translate(locale, 'defense.eyebrow'),
    question: translate(locale, 'analysis.title'),
    helper: translate(locale, 'analysis.helper')
  };
  const dataStatus = briefLoading ? 'nav.loading' : briefError ? 'nav.fallback' : 'nav.live';

  return <><a className="skip-link" href="#morning-brief">{translate(locale, 'skip')}</a><main>
    <section className="hero textile-motif">
      <nav className="nav" aria-label={translate(locale, 'nav.controls')}><div className="brand"><span className="brand-mark" aria-hidden="true" /><span>ARIA</span></div><div className="nav-controls"><span className="live"><i /> {translate(locale, dataStatus)}</span><div className="language-switcher" role="group" aria-label={translate(locale, 'nav.language')}>{localeOptions.map((option) => <button key={option.code} type="button" className={option.code === locale ? 'selected' : ''} onClick={() => setLocale(option.code)} aria-pressed={option.code === locale} aria-label={translate(locale, 'nav.languageOption', { language: option.name })}>{option.label}</button>)}</div><button className="icon-button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} aria-label={translate(locale, 'nav.theme', { theme: translate(locale, `theme.${theme === 'light' ? 'dark' : 'light'}`) })}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} /></button></div></nav>
      {briefError && <p className="live-data-warning" role="alert">{errorMessage(locale, briefError)}</p>}
      {!briefLoading && !briefError && reasoning.status !== 'ok' && <p className="live-data-warning" role="status">{translate(locale, 'reasoning.degraded')} {reasoning.errorCode && errorMessage(locale, { code: reasoning.errorCode })}</p>}
      <div className="hero-copy"><p className="eyebrow">{currentWeekday} · {merchant.location?.toUpperCase()}</p><h1>{copy.greeting}<br /><em>{copy.subhead}</em></h1><p>{translate(locale, 'hero.description', { business: merchant.business })}</p></div>
      <div className="merchant-switcher" role="group" aria-label={translate(locale, 'merchant.choose')}><span><Icon name="building" size={16} /> {translate(locale, 'merchant.demo')}</span>{merchants.map((option) => <button key={option.id} type="button" className={option.id === merchantId ? 'selected' : ''} onClick={() => selectMerchant(option.id)} aria-pressed={option.id === merchantId}>{option.business}</button>)}</div>
      <div className="signal-strip" aria-busy={briefLoading}><span><Icon name="shield" size={17} /> {translate(locale, 'signals.actions', { count: summary.actionsSurfaced })}</span><span>{translate(locale, 'signals.read', { count: summary.signalsRead })} · <strong aria-label={translate(locale, 'signals.discarded', { count: summary.opportunitiesDiscarded })}>{animatedDiscardCount}</strong> {translate(locale, 'signals.discardedSuffix', { count: summary.opportunitiesDiscarded })}</span><button onClick={speakBrief}><Icon name="volume" size={17} /> {translate(locale, 'signals.listen')}</button></div>
    </section>

    <section className="brief" id="morning-brief" aria-labelledby="brief-title">
      <div className="section-heading"><div><p className="eyebrow">{translate(locale, 'brief.eyebrow')}</p><h2 id="brief-title">{copy.brief}</h2></div><p className="quiet">{copy.briefNote}</p></div>
      <div className="action-list" key={merchantId}>{actions.map((action, index) => {
        const defense = defenses[action.id];
        const expanded = expandedId === action.id;
        const defenseConfidence = defense?.confidence ?? action.confidence;
        const presented = localizedAction(action, locale);
        const localizedType = typeLabel(action.kind, locale);
        return <article className={`action-card ${expanded ? 'expanded' : ''}`} style={{ '--enter-index': index }} key={action.id}>
          <div className="rank">0{index + 1}</div>
          <div className="action-content">
            <p className="type" aria-label={`${localizedType} · ${translate(locale, 'confidence', { value: action.confidence })}`}>{localizedType} <span>·</span> <AnimatedNumber value={action.confidence} />% {translate(locale, 'confidence.label')}</p>
            <h3>{presented.title}</h3>
            <p className="action-text">{presented.action}</p>
            {action.kind === 'churn-risk' && <Sparkline series={action.evidence?.series} locale={locale} />}
            <div className="action-buttons"><button className={`primary ${sentActionId === action.id ? 'confirmed' : ''}`} onClick={() => useDraft(action)}>{sentActionId === action.id ? <><Icon name="check" size={17} /> {translate(locale, 'action.draftReady')}</> : <><Icon name="message" size={17} /> {translate(locale, 'action.useDraft')} <Icon name="arrow" size={16} /></>}</button><button className="secondary" onClick={() => askWhy(action)} aria-expanded={expanded}>{expanded ? translate(locale, 'action.hideReasoning') : translate(locale, 'action.why')}</button></div>
            <div className={`defense-region ${expanded ? 'expanded' : ''}`} aria-live="polite">{expanded && <section className="defense" aria-busy={defenseLoading === action.id}><p className="eyebrow">{copy.liveReasoning}</p>{defenseLoading === action.id && !defense?.narrative ? <p className="thinking" role="status"><span /><span /><span /> {translate(locale, 'defense.loading')}</p> : <><p className={defense?.error ? 'defense-error' : ''}>{defense?.narrative}</p><div className="confidence"><span>{translate(locale, 'defense.currentEvidence')}</span><strong aria-label={translate(locale, 'confidence', { value: defenseConfidence })}><AnimatedNumber value={defenseConfidence} />% {translate(locale, 'confidence.label')}</strong></div></>}</section>}</div>
          </div>
          <div className="score" aria-label={translate(locale, 'priorityScore', { value: action.priorityScore })}><strong aria-hidden="true"><AnimatedNumber value={action.priorityScore} /></strong><span>{translate(locale, 'priority')}</span></div>
        </article>;
      })}</div>
    </section>

    <section className="analysis" aria-labelledby="analysis-title"><div><p className="eyebrow">{translate(locale, 'analysis.eyebrow')}</p><h2 id="analysis-title">{copy.question}</h2><p>{translate(locale, 'analysis.description')}</p></div><form onSubmit={runAnalysis} className="analysis-form"><label htmlFor="analysis-question">{translate(locale, 'analysis.label')}</label><div className="question-row"><input id="analysis-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={translate(locale, 'analysis.placeholder')} maxLength="300" aria-describedby={analysis?.error ? 'analysis-helper analysis-error' : 'analysis-helper'} disabled={analysisLoading} /><button className="primary" type="submit" disabled={analysisLoading}>{analysisLoading ? translate(locale, 'analysis.running') : translate(locale, 'analysis.run')} <Icon name="arrow" size={16} /></button></div><p className="helper" id="analysis-helper">{copy.helper}</p>{analysis?.error && <p className="form-error" id="analysis-error" role="alert">{errorMessage(locale, analysis.error)}</p>}</form><AnalysisResult analysis={analysis} locale={locale} /></section>

    <AgentFlow active={activeAgent} locale={locale} />

    <section className="trust" aria-labelledby="trust-title"><div className="trust-intro"><p className="eyebrow">{translate(locale, 'trust.eyebrow')}</p><h2 id="trust-title">{translate(locale, 'trust.title', { name: merchant.name })}</h2><p>{translate(locale, 'trust.description')}</p></div><div className="ledger-summary" aria-label={translate(locale, 'trust.summaryAria', { count: summary.actionsSurfaced, name: merchant.name })}><span className="ledger-highlight" aria-hidden="true"><AnimatedNumber value={summary.actionsSurfaced} /></span><p>{translate(locale, 'trust.summary', { count: summary.actionsSurfaced, actionLabel: translate(locale, 'trust.actionLabel', { count: summary.actionsSurfaced }), name: merchant.name })}</p></div><div className="ledger" role="list">{ledger.length ? ledger.map((entry) => { const presented = localizedLedgerEntry(entry, locale); return <div role="listitem" key={entry.id}><span>{formatLedgerDate(entry.occurredAt, locale)}</span><strong>{presented.title}</strong><small>{presented.status}</small></div>; }) : <p className="ledger-empty">{translate(locale, 'trust.empty')}</p>}</div></section>

    {draftNotice && <div className="toast" role="status" aria-live="polite"><strong>{translate(locale, 'toast.title', { name: merchant.name })}</strong><span>{draftNotice}</span><button onClick={() => setDraftNotice(null)}>{translate(locale, 'toast.dismiss')}</button></div>}
  </main></>;
}
