# ARIA — Autonomous Revenue Intelligence Agent

ARIA is a standing intelligence layer for two fictional Lagos merchants: Aisha Textiles in Yaba and Kola Mobile Accessories in Computer Village. It reads synthetic commerce signals, finds patterns, discards noise, and delivers a short Morning Brief with actions worth taking today.

## What works

- Twelve weeks of synthetic, structured data for two merchants in different sectors, with richer repeat-buyer histories and merchant records.
- A request-time Lagos reference clock: every brief and Defense re-derivation receives a fresh, internally consistent synthetic timeline, and the UI refreshes when the Lagos calendar day changes.
- Deterministic detection for churn risk, pricing anomalies, supplier delays, inventory windows, and lower-priority sales opportunities.
- A Priority Agent with actionability, urgency, value, and resolution gates. It discards suppressed findings rather than storing a hidden queue.
- A real trust ledger derived from structured merchant-history events, not hardcoded UI rows.
- Live AI Defense and Analysis Agents that use OpenAI (`gpt-5.6-terra`) first, then Groq (`openai/gpt-oss-20b`) when the primary provider cannot return usable output. Defense re-derives current evidence for every request and streams its fresh explanation token-by-token to the UI with SSE.
- A Railway-compatible `isolated-vm` execution boundary that passes validated structured events as a read-only isolate input, limits each program to 128 MB and five seconds, and exposes no Node, network, filesystem, or process capabilities.
- A responsive Next.js Morning Brief with merchant switching, light/dark mode, complete English and Nigerian Pidgin copy, accessible inline feedback, motion that respects reduced-motion preferences, and locale-aware browser voice playback.

## Run locally

1. Copy `backend/.env.example` to `backend/.env`, then set `OPENAI_API_KEY` and `GROQ_API_KEY`. Copy `frontend/.env.local.example` to `frontend/.env.local` if you need to override the local frontend URL.
2. Install dependencies and start both services:

```bash
npm install
npm test
npm --workspace backend run dev
npm --workspace frontend run dev
```

Open `http://localhost:3000`. The frontend expects the API at `http://localhost:4000` during local development.

For deployment, configure Railway with `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.6-terra`, `GROQ_API_KEY`, `GROQ_MODEL=openai/gpt-oss-20b`, and `FRONTEND_ORIGIN` set to the exact Vercel origin or a comma-separated list of exact origins. OpenAI is the primary provider; Groq is tried only when OpenAI is missing, cannot authenticate, lacks model access or quota, is rate-limited, times out, is unavailable, or returns unusable output before a response is sent. A provider-rejected request (HTTP 400/413/422) is reported for operator correction rather than retried against Groq. Configure Vercel with `NEXT_PUBLIC_API_URL` set to the Railway **API** origin (for example, `https://aria-api.example.up.railway.app`) and `NEXT_PUBLIC_SITE_URL` set to the Vercel **web** origin. Do not swap those values, include a path, or leave `NEXT_PUBLIC_API_URL` unset. Because `NEXT_PUBLIC_*` values are compiled into the browser bundle, redeploy Vercel after changing them.

A valid OpenAI API key also needs API billing or credits in its associated project. Model access and a valid credential alone cannot run live analysis if the project reports `insufficient_quota`; an OpenAI-only deployment will remain unavailable in that case. Fallback activates only after a real Railway-only `GROQ_API_KEY` is set and Railway is redeployed. Each non-stream provider attempt, and each streamed Defense request until its first text delta, has a 22-second budget so failover remains within the browser request budget. Brief enrichment has a 46-second total budget and falls back to deterministic actions if it expires. Analysis validates each provider program by executing it in the sandbox before accepting it, with a 47-second provider-selection budget; a selected sandbox run retains its separate five-second hard limit, and a runtime-invalid OpenAI program can therefore fall back to Groq. Once Defense text is streaming, ARIA never changes providers mid-explanation. Never put either key in a `NEXT_PUBLIC_*` variable.

## Security model

The analysis model receives the merchant's business question and validated, structured synthetic events only; raw source text is excluded. The resulting analysis logic receives a separate, read-only copy of those validated events inside the isolate, rather than an event literal it can alter or return to the browser. Questions are bounded to 3–300 characters, checked for business relevance, and rejected before model execution when they attempt instruction injection or secret access. Generated programs are statically rejected if they use modules, processes, filesystem, network, dynamic evaluation, imports, dynamic loading, or attempt to replace the injected event input.

Every accepted program runs in a fresh `isolated-vm` V8 isolate with a 128 MB memory limit and a five-second execution timeout. Output is capped inside the isolate before it can cross into Node. The API does not inject Node globals, host callbacks, `require`, `process`, filesystem APIs, network APIs, or child-process APIs into that isolate, and it never returns generated program source to the browser. The execution boundary—not the token filter—prevents capability access. The API rate-limits Brief, Analysis, and Defense requests per client, bounds the demo-only in-memory rate-limit stores, trusts one Railway proxy hop for accurate client addresses, and disables permissive CORS in production unless `FRONTEND_ORIGIN` is configured.

`isolated-vm` is a native dependency. ARIA starts Node with `--no-node-snapshot`, as required by the package for Node 22+. The workspace and backend pin Node 22; confirm Railway's first build completes the native dependency install before recording the demo.

The current event adapter, rate limiter, and trust history are in-memory demo shortcuts; replace them with Postgres and a shared rate-limit store before any multi-user deployment. Configure `FRONTEND_ORIGIN`, place the API behind TLS, and add authentication before connecting real merchant data.

## Test coverage

`npm test` covers priority discard behavior, current-evidence re-derivation, two merchant scenarios, trust-ledger derivation, OpenAI-to-Groq fallback and streaming contracts through mocked SDK responses, SSE response framing, hostile query handling, proxy-aware analysis and Defense rate limits, generated-code response privacy, read-only structured-event injection, isolate output limits, direct isolate capability-escape attempts, and WCAG AA checks for the key lime/gold color pairs.

The date and locale tests also verify that a brief rebases on the current request time, a Lagos day rollover produces a new timeline, and every surfaced action and ledger entry carries structured copy for both English and Nigerian Pidgin. Add future languages only with a native-speaker review of their full copy set; do not publish a partial toggle.

GitHub Actions installs locked dependencies, scans tracked source for credential-shaped values, runs the full test suite, and builds the frontend on every pull request and push to `main`.
