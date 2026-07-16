'use client';

import { useEffect, useMemo, useState } from 'react';

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const fallbackActions = [
  {
    id: 'churn-cust-amara',
    kind: 'churn-risk',
    title: 'Amara Okafor may be drifting away',
    action: 'Send Amara a personal check-in and show the new Ankara arrivals.',
    draftMessage: 'Hi Amara, we just received fresh Ankara patterns I think you would like. Should I send you a quick video before they go?',
    confidence: 86,
    priorityScore: 95
  },
  {
    id: 'inventory-follow-up',
    kind: 'inventory',
    title: 'Turn yesterday’s Ankara restock into sales',
    action: 'Share a short arrivals video with your repeat Ankara buyers before the weekend.',
    draftMessage: 'New Ankara just landed today. I saved the patterns that match what you normally pick — would you like a quick video?',
    confidence: 79,
    priorityScore: 91
  },
  {
    id: 'weekend-bundles',
    kind: 'sales-opportunity',
    title: 'Create a weekend Ankara bundle offer',
    action: 'Bundle three slow-moving Ankara patterns and send the offer to customers who bought prints this month.',
    draftMessage: 'I put together a weekend Ankara bundle with three fresh patterns at a better price. Would you like me to reserve one for you?',
    confidence: 74,
    priorityScore: 82
  }
];

const fallbackSummary = { signalsRead: 25, opportunitiesEvaluated: 4, actionsSurfaced: 3, opportunitiesDiscarded: 1 };

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
    chart: <><path d="M4 19V5M4 19h16" /><path d="m7 15 3-4 3 2 5-7" /></>
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function typeLabel(kind) {
  return kind === 'churn-risk' ? 'Customer signal' : kind === 'inventory' ? 'Inventory window' : 'Sales opportunity';
}

function Sparkline() {
  return <div className="sparkline" role="img" aria-label="Amara’s order pattern was regular before her most recent smaller order and longer gap.">
    <svg viewBox="0 0 180 44" aria-hidden="true"><path className="spark-base" d="M2 34H178" /><path className="spark-path" d="M4 16 L30 15 L56 17 L82 14 L108 16 L134 15 L160 34 L176 37" /><circle cx="160" cy="34" r="4" className="spark-point" /></svg>
    <span>Order rhythm changed</span>
  </div>;
}

function AgentFlow({ active }) {
  const agents = [['Ingestion', 'Ingestion Agent'], ['Analysis', 'Codex Analysis'], ['Reasoning', 'Reasoning Agent'], ['Priority', 'Priority Agent'], ['Defense', 'Defense Agent']];
  return <section className="control-room" aria-labelledby="control-title"><div><p className="eyebrow">CONTROL ROOM</p><h2 id="control-title">ARIA is a live decision system</h2><p>Each answer starts with structured synthetic events. Priority discards noise; Defense re-checks the evidence on request.</p></div><ol className="agent-flow">{agents.map(([id, label], index) => <li key={id} className={active === id ? 'active' : ''}><span>{String(index + 1).padStart(2, '0')}</span>{label}</li>)}</ol></section>;
}

export default function Home() {
  const [actions, setActions] = useState(fallbackActions);
  const [merchant, setMerchant] = useState({ name: 'Aisha', business: 'Aisha Textiles', location: 'Yaba, Lagos' });
  const [summary, setSummary] = useState(fallbackSummary);
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
  const now = useMemo(() => new Date(), []);
  const lagosWeekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Africa/Lagos' }).format(now).toUpperCase();
  const lagosHour = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Lagos' }).format(now));
  const greeting = lagosHour < 12 ? 'Morning' : lagosHour < 17 ? 'Afternoon' : 'Evening';

  useEffect(() => {
    const savedTheme = window.localStorage.getItem('aria-theme');
    if (savedTheme === 'dark') setTheme('dark');
    fetch(`${apiUrl}/api/brief`).then((response) => response.ok ? response.json() : Promise.reject()).then((brief) => {
      setActions(brief.actions);
      setMerchant(brief.merchant);
      setSummary(brief.prioritySummary);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('aria-theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!draftNotice) return undefined;
    const timeout = window.setTimeout(() => setDraftNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [draftNotice]);

  async function askWhy(action) {
    const isOpen = expandedId === action.id;
    setExpandedId(isOpen ? null : action.id);
    if (isOpen || defenses[action.id]) return;
    setDefenseLoading(action.id);
    setActiveAgent('Defense');
    try {
      const response = await fetch(`${apiUrl}/api/defense`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ insightId: action.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setDefenses((current) => ({ ...current, [action.id]: payload }));
    } catch {
      setDefenses((current) => ({ ...current, [action.id]: { narrative: 'ARIA needs the live signal service to re-check this action. Start the API, then try again.', confidence: action.confidence } }));
    } finally {
      setDefenseLoading(null);
    }
  }

  async function runAnalysis(event) {
    event.preventDefault();
    if (!question.trim()) return;
    setAnalysisLoading(true);
    setAnalysis(null);
    setActiveAgent('Analysis');
    try {
      const response = await fetch(`${apiUrl}/api/analysis`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error);
      setAnalysis({ question, result: payload.result, generatedCode: payload.generatedCode });
    } catch (error) {
      setAnalysis({ question, error: error.message });
    } finally {
      setAnalysisLoading(false);
    }
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
    brief: 'Your next best moves',
    question: 'Ask ARIA anything about this business',
    helper: 'Try sales this week or customers wey don quiet.'
  } : {
    greeting: `Good ${greeting}, ${merchant.name}.`,
    subhead: 'Here’s what matters today.',
    brief: 'Your next best moves',
    question: 'Ask ARIA a new business question',
    helper: 'Ask about sales this week or which customers have gone quiet.'
  };

  return <><a className="skip-link" href="#morning-brief">Skip to your Morning Brief</a><main>
    <section className="hero">
      <nav className="nav" aria-label="Application controls"><div className="brand"><span className="brand-mark"><Icon name="spark" size={18} /></span><span>ARIA</span></div><div className="nav-controls"><span className="live"><i /> Watching your business</span><button className="icon-button" onClick={() => setPidgin((value) => !value)} aria-pressed={pidgin}>{pidgin ? 'EN' : 'PG'}</button><button className="icon-button" onClick={() => setTheme((value) => value === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}><Icon name={theme === 'light' ? 'moon' : 'sun'} size={18} /></button></div></nav>
      <div className="hero-copy"><p className="eyebrow">{lagosWeekday} · {merchant.location?.toUpperCase()}</p><h1>{copy.greeting}<br /><em>{copy.subhead}</em></h1><p>ARIA reads the signals from {merchant.business}, then keeps only the actions worth a merchant’s time.</p></div>
      <div className="signal-strip"><span><Icon name="shield" size={17} /> {summary.actionsSurfaced} actions surfaced</span><span>{summary.signalsRead} synthetic signals read · {summary.opportunitiesDiscarded} opportunity quietly discarded</span><button onClick={speakBrief}><Icon name="volume" size={17} /> Listen to brief</button></div>
    </section>

    <section className="brief" id="morning-brief" aria-labelledby="brief-title"><div className="section-heading"><div><p className="eyebrow">MORNING BRIEF</p><h2 id="brief-title">{copy.brief}</h2></div><p className="quiet">No hidden queue. Unhelpful opportunities are discarded.</p></div>
      <div className="action-list">{actions.map((action, index) => {
        const defense = defenses[action.id];
        const expanded = expandedId === action.id;
        return <article className={`action-card ${expanded ? 'expanded' : ''}`} key={action.id}><div className="rank">0{index + 1}</div><div className="action-content"><p className="type">{typeLabel(action.kind)} <span>·</span> {action.confidence}% confidence</p><h3>{action.title}</h3><p className="action-text">{action.action}</p>{action.kind === 'churn-risk' && <Sparkline />}<div className="action-buttons"><button className={`primary ${sentActionId === action.id ? 'confirmed' : ''}`} onClick={() => useDraft(action)}>{sentActionId === action.id ? <><Icon name="check" size={17} /> Draft ready</> : <><Icon name="message" size={17} /> Use draft <Icon name="arrow" size={16} /></>}</button><button className="secondary" onClick={() => askWhy(action)} aria-expanded={expanded}>{expanded ? 'Hide reasoning' : 'Why did ARIA pick this?'}</button></div>{expanded && <section className="defense" aria-live="polite"><p className="eyebrow">LIVE RE-DERIVATION</p>{defenseLoading === action.id ? <p className="thinking" role="status"><span /><span /><span /> ARIA is re-checking the signals</p> : <><p>{defense?.narrative}</p><div className="confidence"><span>Calculated from current structured events</span><strong>{defense?.confidence ?? action.confidence}% confidence</strong></div></>}</section>}</div><div className="score" aria-label={`Priority score ${action.priorityScore}`}><strong>{action.priorityScore}</strong><span>priority</span></div></article>;
      })}</div>
    </section>

    <section className="analysis" aria-labelledby="analysis-title"><div><p className="eyebrow">CODEX ANALYSIS AGENT</p><h2 id="analysis-title">{copy.question}</h2><p>ARIA creates a small program from structured event data and executes it inside a locked-down, no-network Docker sandbox.</p></div><form onSubmit={runAnalysis} className="analysis-form"><label htmlFor="analysis-question">Business question</label><div className="question-row"><input id="analysis-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="e.g. Which customers have gone quiet?" maxLength="300" disabled={analysisLoading} /><button className="primary" type="submit" disabled={analysisLoading}>{analysisLoading ? 'Running safely…' : 'Run analysis'} <Icon name="arrow" size={16} /></button></div><p className="helper">{copy.helper}</p></form>{analysis && <div className="analysis-result" aria-live="polite">{analysis.error ? <><strong>Analysis needs a different question.</strong><p>{analysis.error}</p></> : <><div className="result-heading"><span><Icon name="terminal" size={17} /> Fresh sandbox run</span><span>Network off · 128 MB · 5 seconds</span></div><pre>{analysis.generatedCode}</pre><div className="result-output"><strong>Result</strong><code>{JSON.stringify(analysis.result, null, 2)}</code></div></>}</div>}</section>

    <AgentFlow active={activeAgent} />

    <section className="trust" aria-labelledby="trust-title"><div><p className="eyebrow">TRUST LEDGER</p><h2 id="trust-title">What ARIA helped Aisha notice</h2><p>Demo history is synthetic. ARIA suggests a draft; it never messages customers or makes financial decisions without the merchant.</p></div><div className="ledger" role="list"><div role="listitem"><span>10 Jul</span><strong>Amara check-in surfaced</strong><small>Awaiting Aisha’s approval</small></div><div role="listitem"><span>12 Jul</span><strong>Adire restock shared</strong><small>Merchant approved the drafted message</small></div><div role="listitem"><span>14 Jul</span><strong>No action surfaced</strong><small>ARIA stayed quiet</small></div></div></section>

    {draftNotice && <div className="toast" role="status" aria-live="polite"><strong>Draft ready for Aisha’s review</strong><span>{draftNotice}</span><button onClick={() => setDraftNotice(null)}>Dismiss</button></div>}
  </main></>;
}
