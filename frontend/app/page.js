'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

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
    confidence: 86,
    priorityScore: 95
  },
  {
    id: 'pricing-cust-ijeoma-lace-fabric',
    kind: 'pricing-anomaly',
    title: 'Review Ijeoma’s lace fabric price',
    action: 'Check whether Ijeoma’s repeat lace fabric price is still intentional before the next order.',
    draftMessage: 'Hi Ijeoma, I am reviewing our current lace fabric prices before your next order. Should I reserve your usual quantity while I confirm the best option?',
    confidence: 82,
    priorityScore: 85
  },
  {
    id: 'inventory-follow-up-transaction-1',
    kind: 'inventory',
    title: 'Turn yesterday’s Ankara restock into sales',
    action: 'Share a short arrivals update with repeat Ankara buyers before the weekend.',
    draftMessage: 'New Ankara stock just landed. I saved options that match what you normally pick — would you like a quick video?',
    confidence: 79,
    priorityScore: 87
  }
];

const fallbackSummary = { signalsRead: 0, opportunitiesEvaluated: 0, actionsSurfaced: 3, opportunitiesDiscarded: 0 };

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

function typeLabel(kind) {
  const labels = {
    'churn-risk': 'Customer signal',
    'pricing-anomaly': 'Pricing signal',
    'supplier-delay': 'Supplier signal',
    inventory: 'Inventory window',
    'sales-opportunity': 'Sales opportunity'
  };
  return labels[kind] ?? 'Business signal';
}

function formatLedgerDate(date) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Africa/Lagos' }).format(new Date(date));
}

function responseError(payload) {
  return payload?.error ?? 'ARIA could not complete that request.';
}

function parseSseMessage(message) {
  const lines = message.split('\n');
  const event = lines.find((line) => line.startsWith('event:'))?.slice(6).trim() ?? 'message';
  const data = lines.filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n');
  return { event, payload: JSON.parse(data) };
}

async function consumeSse(response, onEvent) {
  if (!response.body) throw new Error('ARIA could not open the live reasoning stream.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
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

function Sparkline({ series = [] }) {
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
  return <div className="sparkline" role="img" aria-label="This customer’s recent order amounts show the drop that triggered this insight.">
    <svg viewBox="0 0 180 44" aria-hidden="true"><path className="spark-base" d="M2 34H178" /><path className="spark-path" d={path} /><circle cx={lastX} cy={lastY} r="4" className="spark-point" /></svg>
    <span>Order rhythm changed</span>
  </div>;
}

function AgentFlow({ active }) {
  const agents = [
    ['Ingestion', 'Ingestion Agent', 'inbox', 'Parses synthetic SMS, WhatsApp, and email into structured events'],
    ['Analysis', 'Codex Analysis', 'terminal', 'Writes and runs a fresh script for open-ended questions'],
    ['Reasoning', 'Reasoning Agent', 'chart', 'Reads weeks of history for multi-signal patterns'],
    ['Priority', 'Priority Agent', 'shield', 'Discards anything that fails actionability, urgency, or value'],
    ['Defense', 'Defense Agent', 'message', 'Re-derives its reasoning live whenever asked why']
  ];
  return <section className="control-room textile-motif" aria-labelledby="control-title"><div><p className="eyebrow">CONTROL ROOM</p><h2 id="control-title">How ARIA reaches today’s brief</h2><p>Each answer begins with structured synthetic events. Priority removes noise; Defense checks the current evidence again when asked.</p></div><ol className="agent-flow">{agents.map(([id, label, icon, blurb], index) => <li key={id} className={active === id ? 'active' : ''}><div className="agent-flow-top"><span>{String(index + 1).padStart(2, '0')}</span><Icon name={icon} size={18} /></div><div><strong>{label}</strong><small>{blurb}</small></div></li>)}</ol></section>;
}

export default function Home() {
  const [actions, setActions] = useState(fallbackActions);
  const [merchant, setMerchant] = useState(fallbackMerchants[0]);
  const [merchants, setMerchants] = useState(fallbackMerchants);
  const [merchantId, setMerchantId] = useState(fallbackMerchants[0].id);
  const [summary, setSummary] = useState(fallbackSummary);
  const [ledger, setLedger] = useState([]);
  const [simulatedAt, setSimulatedAt] = useState(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [briefError, setBriefError] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [defenses, setDefenses] = useState({});
  const [defenseLoading, setDefenseLoading] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [question, setQuestion] = useState('');
  const [draftNotice, setDraftNotice] = useState(null);
  const [sentActionId, setSentActionId] = useState(null);
  const [theme, setTheme] = useState('light');
  const [pidgin, setPidgin] = useState(false);
  const [activeAgent, setActiveAgent] = useState('Priority');
  const defenseController = useRef(null);
  const now = useMemo(() => simulatedAt ? new Date(simulatedAt) : null, [simulatedAt]);
  const animatedDiscardCount = useCountUp(summary.opportunitiesDiscarded);
  const lagosWeekday = now ? new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Africa/Lagos' }).format(now).toUpperCase() : 'TODAY';
  const lagosHour = now ? Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(now)) : 9;
  const greeting = lagosHour < 12 ? 'Morning' : lagosHour < 17 ? 'Afternoon' : 'Evening';

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('aria-theme');
    if (savedTheme === 'dark') setTheme('dark');
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('aria-theme', theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    setBriefLoading(true);
    setBriefError(null);
    setActiveAgent('Ingestion');
    fetch(`${apiUrl}/api/brief?merchant=${encodeURIComponent(merchantId)}`, { signal: controller.signal })
      .then(async (response) => response.ok ? response.json() : Promise.reject(new Error(responseError(await response.json()))) )
      .then((brief) => {
        setActions(brief.actions);
        setMerchant(brief.merchant);
        setMerchants(brief.merchants);
        setSummary(brief.prioritySummary);
        setLedger(brief.ledger);
        setSimulatedAt(brief.simulatedAt ?? new Date().toISOString());
        setActiveAgent('Priority');
      })
      .catch((error) => {
        if (error.name !== 'AbortError') {
          setBriefError('Couldn’t reach ARIA’s live data. Showing example brief.');
          setSimulatedAt(new Date().toISOString());
          setActiveAgent('Priority');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setBriefLoading(false);
      });
    return () => controller.abort();
  }, [merchantId]);

  useEffect(() => {
    if (!draftNotice) return undefined;
    const timeout = window.setTimeout(() => setDraftNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [draftNotice]);

  useEffect(() => () => defenseController.current?.abort(), []);

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
    try {
      const response = await fetch(`${apiUrl}/api/defense/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ merchantId, insightId: action.id }),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(responseError(await response.json()));
      await consumeSse(response, ({ event, payload }) => {
        if (event === 'meta' || event === 'done') {
          setDefenses((current) => ({ ...current, [action.id]: { ...current[action.id], confidence: payload.confidence, recalculatedAt: payload.recalculatedAt } }));
        }
        if (event === 'delta') {
          setDefenseLoading(null);
          setDefenses((current) => ({ ...current, [action.id]: { ...current[action.id], narrative: `${current[action.id]?.narrative ?? ''}${payload.delta}` } }));
        }
        if (event === 'error') throw new Error(responseError(payload));
      });
    } catch (error) {
      if (error.name === 'AbortError') return;
      setDefenses({ [action.id]: { narrative: error.message, confidence: action.confidence, error: true } });
    } finally {
      if (defenseController.current === controller) {
        defenseController.current = null;
        setDefenseLoading(null);
      }
    }
  }

  async function runAnalysis(event) {
    event.preventDefault();
    if (!question.trim()) {
      setAnalysis({ error: 'Ask a business question before running analysis.' });
      return;
    }
    setAnalysisLoading(true);
    setAnalysis(null);
    setActiveAgent('Analysis');
    try {
      const response = await fetch(`${apiUrl}/api/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchantId, question }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(responseError(payload));
      setAnalysis({ question, result: payload.result, generatedCode: payload.generatedCode });
    } catch (error) {
      setAnalysis({ question, error: error.message });
    } finally {
      setAnalysisLoading(false);
    }
  }

  function selectMerchant(nextMerchantId) {
    if (nextMerchantId === merchantId) return;
    defenseController.current?.abort();
    defenseController.current = null;
    setMerchantId(nextMerchantId);
    setExpandedId(null);
    setDefenses({});
    setDefenseLoading(null);
    setAnalysis(null);
    setSentActionId(null);
    setDraftNotice(null);
  }

  function useDraft(action) {
    setDraftNotice(action.draftMessage);
    setSentActionId(action.id);
  }

  function speakBrief() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const message = new SpeechSynthesisUtterance(`ARIA morning brief for ${merchant.business}. ${actions.map((action) => `${action.title}. ${action.action}`).join(' ')}`);
    message.rate = 0.95;
    window.speechSynthesis.speak(message);
  }

  const copy = pidgin ? {
    greeting: `Good ${greeting}, ${merchant.name}.`,
    subhead: 'Na only the things wey need your attention today.',
    brief: `Wetin need ${merchant.name} attention today`,
    briefNote: `This week, ${summary.signalsRead} signals land. ${summary.opportunitiesDiscarded} no need ${merchant.name} time.`,
    liveReasoning: 'See as ARIA dey work am out, live',
    question: 'Ask ARIA anything about this business',
    helper: 'Try sales this week or customers wey don quiet.'
  } : {
    greeting: `Good ${greeting}, ${merchant.name}.`,
    subhead: 'Here’s what matters today.',
    brief: `What needs ${merchant.name}’s attention today`,
    briefNote: `This week, ${summary.signalsRead} signals came in. ${summary.opportunitiesDiscarded} did not need ${merchant.name}’s time.`,
    liveReasoning: 'Watching this get worked out, live',
    question: 'Ask ARIA a new business question',
    helper: 'Ask about sales, customers, stock, prices, or suppliers.'
  };

  return <><a className="skip-link" href="#morning-brief">Skip to your Morning Brief</a><main>
    <section className="hero textile-motif">
      <nav className="nav" aria-label="Application controls"><div className="brand"><span className="brand-mark"><Icon name="spark" size={18} /></span><span>ARIA</span></div><div className="nav-controls"><span className="live"><i /> Watching synthetic signals</span><button className="icon-button" onClick={() => setPidgin((value) => !value)} aria-label={`Switch to ${pidgin ? 'English' : 'Pidgin'} copy`} aria-pressed={pidgin}>{pidgin ? 'EN' : 'PG'}</button><button className="icon-button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} /></button></div></nav>
      {briefError && <p className="live-data-warning" role="alert">{briefError}</p>}
      <div className="hero-copy"><p className="eyebrow">{lagosWeekday} · {merchant.location?.toUpperCase()}</p><h1>{copy.greeting}<br /><em>{copy.subhead}</em></h1><p>ARIA reads the signals from {merchant.business}, then keeps only the actions worth a merchant’s time.</p></div>
      <div className="merchant-switcher" role="group" aria-label="Choose a synthetic demo merchant"><span><Icon name="building" size={16} /> Demo merchant</span>{merchants.map((option) => <button key={option.id} type="button" className={option.id === merchantId ? 'selected' : ''} onClick={() => selectMerchant(option.id)} aria-pressed={option.id === merchantId}>{option.business}</button>)}</div>
      <div className="signal-strip" aria-busy={briefLoading}><span><Icon name="shield" size={17} /> {summary.actionsSurfaced} actions surfaced</span><span>{summary.signalsRead} synthetic signals read · <strong aria-label={`${summary.opportunitiesDiscarded} opportunities quietly discarded`}>{animatedDiscardCount}</strong> opportunity quietly discarded</span><button onClick={speakBrief}><Icon name="volume" size={17} /> Listen to brief</button></div>
    </section>

    <section className="brief" id="morning-brief" aria-labelledby="brief-title"><div className="section-heading"><div><p className="eyebrow">MORNING BRIEF</p><h2 id="brief-title">{copy.brief}</h2></div><p className="quiet">{copy.briefNote}</p></div>
      <div className="action-list" key={merchantId}>{actions.map((action, index) => {
        const defense = defenses[action.id];
        const expanded = expandedId === action.id;
        const defenseConfidence = defense?.confidence ?? action.confidence;
        return <article className={`action-card ${expanded ? 'expanded' : ''}`} style={{ '--enter-index': index }} key={action.id}><div className="rank">0{index + 1}</div><div className="action-content"><p className="type" aria-label={`${typeLabel(action.kind)} · ${action.confidence}% confidence`}>{typeLabel(action.kind)} <span>·</span> <AnimatedNumber value={action.confidence} />% confidence</p><h3>{action.title}</h3><p className="action-text">{action.action}</p>{action.kind === 'churn-risk' && <Sparkline series={action.evidence?.series} />}<div className="action-buttons"><button className={`primary ${sentActionId === action.id ? 'confirmed' : ''}`} onClick={() => useDraft(action)}>{sentActionId === action.id ? <><Icon name="check" size={17} /> Draft ready</> : <><Icon name="message" size={17} /> Use draft <Icon name="arrow" size={16} /></>}</button><button className="secondary" onClick={() => askWhy(action)} aria-expanded={expanded}>{expanded ? 'Hide reasoning' : 'Why did ARIA pick this?'}</button></div><div className={`defense-region ${expanded ? 'expanded' : ''}`} aria-live="polite">{expanded && <section className="defense" aria-busy={defenseLoading === action.id}><p className="eyebrow">{copy.liveReasoning}</p>{defenseLoading === action.id && !defense?.narrative ? <p className="thinking" role="status"><span /><span /><span /> ARIA is re-checking current signals</p> : <><p className={defense?.error ? 'defense-error' : ''}>{defense?.narrative}</p><div className="confidence"><span>Calculated from current structured events</span><strong aria-label={`${defenseConfidence}% confidence`}><AnimatedNumber value={defenseConfidence} />% confidence</strong></div></>}</section>}</div></div><div className="score" aria-label={`Priority score ${action.priorityScore}`}><strong aria-hidden="true"><AnimatedNumber value={action.priorityScore} /></strong><span>priority</span></div></article>;
      })}</div>
    </section>

    <section className="analysis" aria-labelledby="analysis-title"><div><p className="eyebrow">CODEX ANALYSIS AGENT</p><h2 id="analysis-title">{copy.question}</h2><p>ARIA creates a small program from structured event data and executes it inside a capability-free V8 isolate.</p></div><form onSubmit={runAnalysis} className="analysis-form"><label htmlFor="analysis-question">Business question</label><div className="question-row"><input id="analysis-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. Which customers have gone quiet?" maxLength="300" aria-describedby={analysis?.error ? 'analysis-helper analysis-error' : 'analysis-helper'} disabled={analysisLoading} /><button className="primary" type="submit" disabled={analysisLoading}>{analysisLoading ? 'Running safely…' : 'Run analysis'} <Icon name="arrow" size={16} /></button></div><p className="helper" id="analysis-helper">{copy.helper}</p>{analysis?.error && <p className="form-error" id="analysis-error" role="alert">{analysis.error}</p>}</form>{analysis && <div className="analysis-result" aria-live="polite">{analysis.error ? <><strong>Analysis needs a different question.</strong><p>{analysis.error}</p></> : <><div className="result-heading"><span><Icon name="terminal" size={17} /> Fresh sandbox run</span><span>No host capabilities · 128 MB · 5 seconds</span></div><pre>{analysis.generatedCode}</pre><div className="result-output"><strong>Result</strong><code>{JSON.stringify(analysis.result, null, 2)}</code></div></>}</div>}</section>

    <AgentFlow active={activeAgent} />

    <section className="trust" aria-labelledby="trust-title"><div className="trust-intro"><p className="eyebrow">TRUST LEDGER</p><h2 id="trust-title">What ARIA helped {merchant.name} notice</h2><p>Entries come from this merchant’s 12-week synthetic history. ARIA suggests a draft; it never messages customers or makes financial decisions without the merchant.</p></div><div className="ledger-summary" aria-label={`${summary.actionsSurfaced} actions surfaced for ${merchant.name} today`}><span className="ledger-highlight" aria-hidden="true"><AnimatedNumber value={summary.actionsSurfaced} /></span><p><strong>{summary.actionsSurfaced} actions</strong> worth {merchant.name}’s time today.</p></div><div className="ledger" role="list">{ledger.length ? ledger.map((entry) => <div role="listitem" key={entry.id}><span>{formatLedgerDate(entry.occurredAt)}</span><strong>{entry.title}</strong><small>{entry.status}</small></div>) : <p className="ledger-empty">Connect the API to load this merchant’s synthetic history.</p>}</div></section>

    {draftNotice && <div className="toast" role="status" aria-live="polite"><strong>Draft ready for {merchant.name}’s review</strong><span>{draftNotice}</span><button onClick={() => setDraftNotice(null)}>Dismiss</button></div>}
  </main></>;
}
