# ARIA — Autonomous Revenue Intelligence Agent

ARIA is a standing intelligence layer for Aisha, a fictional fabric merchant in Yaba, Lagos. It reads synthetic SMS bank alerts, WhatsApp orders, and receipt signals; finds patterns; discards the noise; and delivers a short Morning Brief with actions worth taking today.

## What works

- Synthetic multi-month merchant signals, including a deliberate churn-risk pattern.
- Reasoning that combines a customer’s changing purchase rhythm and basket size.
- A Priority Agent with concrete actionability, urgency, value, and resolution gates. It discards suppressed findings rather than storing a hidden queue.
- A Defense Agent that recalculates an explanation from structured events for every request.
- A Codex Analysis Agent that generates a fresh JavaScript analysis program for supported business questions and runs it only in a constrained Docker sandbox.
- A responsive Next.js Morning Brief with light/dark mode, optional Pidgin copy, inline live reasoning, a control-room view, a synthetic trust ledger, and browser voice playback.
- A judge-facing business-question input that shows the fresh program and its constrained result, with clear fallback guidance for unsupported questions.

## Run locally

```bash
npm install
npm --workspace backend test
docker build -t aria-analysis-sandbox:latest backend/sandbox
npm --workspace backend run dev
npm --workspace frontend run dev
```

Open `http://localhost:3000`. The frontend expects the API at `http://localhost:4000`; set `NEXT_PUBLIC_API_URL` when deploying.

## Security model

The analysis API only sends structured synthetic events into generated code. Generated programs are statically rejected if they use modules, processes, filesystem, network, dynamic evaluation, imports, or dynamic loading. They execute in a short-lived Docker container with no network, read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, a dedicated wiped scratch mount, a 128 MB memory ceiling, a process limit, a 64 KB output cap, and a five-second backend timeout. The API rate-limits analysis requests and disables permissive CORS in production unless `FRONTEND_ORIGIN` is configured.

This Docker dependency is intentional. A plain in-process JavaScript evaluator is not an acceptable execution boundary for model-generated code. The current event adapter, rate limiter, trust history, and metrics are in-memory demo shortcuts; replace them with Postgres and a shared rate-limit store before any multi-user deployment. Configure a production `FRONTEND_ORIGIN`, place the API behind TLS, and add authentication before connecting real merchant data.

## Codex collaboration

Codex accelerated the implementation of the synthetic event pipeline, testable agent boundaries, Docker execution contract, and the Morning Brief UI. The Sentinel team made the product calls: ARIA must suppress noise rather than archive it, defense responses must be re-derived instead of cached, and the demo must remain grounded in a specific Lagos merchant. These decisions shape the behavior Codex implemented rather than being delegated to it.

## Test coverage

`npm --workspace backend test` covers Priority Agent discard behavior, Defense Agent re-derivation from changed structured events, generated-code validation, and sandbox policy rejection. Build the Docker image before exercising `POST /api/analysis` end to end.

GitHub Actions installs locked dependencies, scans tracked source for credential-shaped values, runs the backend tests, and builds the frontend on every pull request and push to `main`.
