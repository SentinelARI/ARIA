# ARIA — Autonomous Revenue Intelligence Agent

ARIA is a standing intelligence layer for Aisha, a fictional fabric merchant in Yaba, Lagos. It reads synthetic SMS bank alerts, WhatsApp orders, and receipt signals; finds patterns; discards the noise; and delivers a short Morning Brief with actions worth taking today.

## What works

- Synthetic multi-month merchant signals, including a deliberate churn-risk pattern.
- Deterministic candidate detection that compares purchase cadence and basket size using structured events.
- A Priority Agent with concrete actionability, urgency, value, and resolution gates. It discards suppressed findings rather than storing a hidden queue.
- A live OpenAI Defense Agent that receives freshly re-derived evidence and writes a new plain-language explanation for every request.
- A live OpenAI Analysis Agent using the Responses API and `gpt-5.6` by default. It receives a judge's natural-language question and produces a fresh JavaScript analysis program.
- A responsive Next.js Morning Brief with light/dark mode, optional Pidgin copy, inline live reasoning, a control-room view, a synthetic trust ledger, and browser voice playback.

## Run locally

1. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
2. Build the constrained execution image:

```bash
npm install
docker build -t aria-analysis-sandbox:latest backend/sandbox
npm --workspace backend test
npm --workspace backend run dev
npm --workspace frontend run dev
```

Open `http://localhost:3000`. The frontend expects the API at `http://localhost:4000`; set `NEXT_PUBLIC_API_URL` when deploying.

## Security model

The analysis model receives the merchant's question and validated, structured synthetic events only; raw source text is excluded. Its generated program is statically rejected if it uses modules, processes, filesystem, network, dynamic evaluation, imports, or dynamic loading. Local development executes it in a short-lived Docker container with no network, read-only root filesystem, dropped Linux capabilities, `no-new-privileges`, a dedicated wiped scratch mount, a 128 MB memory ceiling, a process limit, a 64 KB output cap, and a five-second timeout.

Railway cannot safely run Docker-in-Docker. In production, the API requires `SANDBOX_RUNNER_URL`, which points to the separately deployed `backend/sandbox/runner.js` service on a Docker-capable host. That runner authenticates calls with `SANDBOX_RUNNER_TOKEN` and applies the same Docker policy by running `backend/src/sandbox.js`. Do not expose it publicly; place it on a private network or restrict access to the backend service.

The current event adapter, rate limiter, trust history, and metrics are in-memory demo shortcuts; replace them with Postgres and a shared rate-limit store before any multi-user deployment. Configure `FRONTEND_ORIGIN`, place the API behind TLS, and add authentication before connecting real merchant data.

## Deploy the sandbox runner

Build the runner from the repository root, after building `aria-analysis-sandbox:latest` on the same Docker host:

```bash
docker build -f backend/sandbox/runner.Dockerfile -t aria-sandbox-runner:latest .
docker run --rm -p 4100:4100 -e SANDBOX_RUNNER_TOKEN=<long-random-secret> -v /var/run/docker.sock:/var/run/docker.sock aria-sandbox-runner:latest
```

Set the API service's `SANDBOX_RUNNER_URL` to the runner's private `/execute` URL and use the same `SANDBOX_RUNNER_TOKEN`. The runner host must have the `aria-analysis-sandbox:latest` image available.

## Codex collaboration

Codex accelerated the implementation of the synthetic event pipeline, testable agent boundaries, OpenAI Responses API integration, Docker execution contract, and Morning Brief UI. The Sentinel team made the product calls: ARIA must suppress noise rather than archive it, deterministic evidence must remain separate from model narration, and the demo must remain grounded in a specific Lagos merchant.

## Test coverage

`npm --workspace backend test` covers Priority Agent discard behavior, re-derived defense evidence, real OpenAI request contracts through mocked SDK responses, generated-code validation, and the remote sandbox-runner contract. Run a Docker-backed end-to-end test after configuring `OPENAI_API_KEY` and a runner.

GitHub Actions installs locked dependencies, scans tracked source for credential-shaped values, runs the backend tests, and builds the frontend on every pull request and push to `main`.
