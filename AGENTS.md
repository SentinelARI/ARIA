# Sentinel Engineering Organization — ARIA

## Product rules

- ARIA is a standing intelligence layer for a fictional Lagos fabric trader. All fixtures and demo data must be synthetic.
- Priority Agent output is a discard-only filter. Suppressed insights must not be persisted or exposed in a hidden view.
- Defense responses must re-derive from the current structured events on every request. Do not cache explanation text.
- The analysis agent must generate and execute code at runtime, but only inside the Docker sandbox described below.

## Stack

- Frontend: Next.js, deployed on Vercel.
- Backend: Node.js and Express, deployed on Railway.
- Production store: Postgres. The demo adapter may use synthetic in-memory data.
- AI credentials are environment variables and must never be committed or logged.

## Analysis security gate

- Run generated code only through `backend/src/sandbox.js` in `backend/sandbox/Dockerfile`.
- Docker execution must have no network, a read-only root filesystem, a temporary scratch mount, a 128 MB memory limit, a process limit, and a five-second timeout.
- Never pass raw external text into executable code. The runtime receives validated, structured events only.
- Tests for the sandbox validation and priority discard behavior are mandatory for changes in these areas.

## Definition of done

- Keep the main flow demoable: ingest synthetic signals, surface three ranked actions, run a constrained analysis, and explain an action live.
- Add automated tests for new core logic and run the relevant validation before handoff.
- Document shortcuts that need production hardening. A local in-memory adapter is a demo shortcut; it must be replaced with Postgres before a multi-user launch.
