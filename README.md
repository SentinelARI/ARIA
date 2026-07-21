# ARIA — Autonomous Revenue Intelligence Agent

ARIA is a standing intelligence layer for two fictional Lagos merchants: Aisha Textiles in Yaba and Kola Mobile Accessories in Computer Village. It reads synthetic commerce signals, finds patterns, discards noise, and delivers a short Morning Brief with actions worth taking today.

## What works

- Twelve weeks of synthetic, structured data for two merchants in different sectors, with richer repeat-buyer histories and merchant records.
- A request-time Lagos reference clock: every brief and Defense re-derivation receives a fresh, internally consistent synthetic timeline, and the UI refreshes when the Lagos calendar day changes.
- Deterministic detection for churn risk, pricing anomalies, supplier delays, inventory windows, and lower-priority sales opportunities.
- A Priority Agent with actionability, urgency, value, and resolution gates. It discards suppressed findings rather than storing a hidden queue.
- A real trust ledger derived from structured merchant-history events, not hardcoded UI rows.
- A live OpenAI Defense Agent that re-derives current evidence for every request and streams its fresh explanation token-by-token to the UI with SSE.
- A live OpenAI Analysis Agent using the Responses API and `gpt-5.6-terra` by default. It receives a business question and structured events, then produces a fresh JavaScript analysis program.
- A Railway-compatible `isolated-vm` execution boundary that limits each program to 128 MB and five seconds without exposing Node, network, filesystem, or process capabilities.
- A responsive Next.js Morning Brief with merchant switching, light/dark mode, complete English and Nigerian Pidgin copy, accessible inline feedback, motion that respects reduced-motion preferences, and locale-aware browser voice playback.

## Run locally

1. Copy `backend/.env.example` to `backend/.env`, then set `OPENAI_API_KEY`. Copy `frontend/.env.local.example` to `frontend/.env.local` if you need to override the local frontend URL.
2. Install dependencies and start both services:

```bash
npm install
npm test
npm --workspace backend run dev
npm --workspace frontend run dev
```

Open `http://localhost:3000`. The frontend expects the API at `http://localhost:4000` during local development.

For deployment, configure Railway with `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-5.6-terra`, and `FRONTEND_ORIGIN` set to the exact Vercel origin or a comma-separated list of exact origins. Configure Vercel with `NEXT_PUBLIC_API_URL` set to the Railway **API** origin (for example, `https://aria-api.example.up.railway.app`) and `NEXT_PUBLIC_SITE_URL` set to the Vercel **web** origin. Do not swap those values, include a path, or leave `NEXT_PUBLIC_API_URL` unset. Because `NEXT_PUBLIC_*` values are compiled into the browser bundle, redeploy Vercel after changing them.

A valid API key also needs API billing or credits in the associated OpenAI project. Model access and a valid credential alone cannot run live analysis if the project reports `insufficient_quota`.

## Security model

The analysis model receives the merchant's business question and validated, structured synthetic events only; raw source text is excluded. Questions are bounded to 3–300 characters, checked for business relevance, and rejected before model execution when they attempt instruction injection or secret access. Generated programs are statically rejected if they use modules, processes, filesystem, network, dynamic evaluation, imports, or dynamic loading.

Every accepted program runs in a fresh `isolated-vm` V8 isolate with a 128 MB memory limit and a five-second execution timeout. The API does not inject Node globals, host callbacks, `require`, `process`, filesystem APIs, network APIs, or child-process APIs into that isolate. The execution boundary—not the token filter—prevents capability access. The API rate-limits analysis and Defense requests per client, trusts one Railway proxy hop for accurate client addresses, and disables permissive CORS in production unless `FRONTEND_ORIGIN` is configured.

`isolated-vm` is a native dependency. ARIA starts Node with `--no-node-snapshot`, as required by the package for Node 22+. The workspace and backend pin Node 22; confirm Railway's first build completes the native dependency install before recording the demo.

The current event adapter, rate limiter, and trust history are in-memory demo shortcuts; replace them with Postgres and a shared rate-limit store before any multi-user deployment. Configure `FRONTEND_ORIGIN`, place the API behind TLS, and add authentication before connecting real merchant data.

## Test coverage

`npm test` covers priority discard behavior, current-evidence re-derivation, two merchant scenarios, trust-ledger derivation, OpenAI request and streaming contracts through mocked SDK responses, SSE response framing, hostile query handling, proxy-aware analysis and Defense rate limits, retired public metrics, generated-code validation, direct isolate capability-escape attempts, and WCAG AA checks for the key lime/gold color pairs.

The date and locale tests also verify that a brief rebases on the current request time, a Lagos day rollover produces a new timeline, and every surfaced action and ledger entry carries structured copy for both English and Nigerian Pidgin. Add future languages only with a native-speaker review of their full copy set; do not publish a partial toggle.

GitHub Actions installs locked dependencies, scans tracked source for credential-shaped values, runs the full test suite, and builds the frontend on every pull request and push to `main`.
