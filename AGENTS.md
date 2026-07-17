# Sentinel Engineering Organization — ARIA

## Product rules

- ARIA is a standing intelligence layer for a fictional Lagos fabric trader. All fixtures and demo data must be synthetic.
- Priority Agent output is a discard-only filter. Suppressed insights must not be persisted or exposed in a hidden view.
- Defense responses must re-derive from the current structured events on every request. Do not cache explanation text.
- The analysis agent must generate and execute code at runtime, but only inside an execution boundary that enforces: no network access, no filesystem access, no process or child-process access, a hard memory ceiling, and a hard timeout. The current implementation is `isolated-vm` (an in-process V8 isolate). Any future change to the execution mechanism must preserve all five properties and be called out explicitly in the PR description.

## Stack

- Frontend: Next.js, deployed on Vercel.
- Backend: Node.js and Express, deployed on Railway.
- Production store: Postgres. The demo adapter may use synthetic in-memory data.
- AI credentials are environment variables and must never be committed or logged.

## Analysis security gate

- Run generated code only through `backend/src/sandbox.js`. This uses `isolated-vm`, not Docker, approved explicitly to keep the entire stack on Railway and Vercel with no third-party host to provision or maintain.
- The execution boundary, whatever implements it, must enforce: no network access, no filesystem access, no process/child_process access, a 128 MB memory ceiling, and a five-second timeout.
- `validateGeneratedCode`'s syntactic checks run before execution as a first filter; the execution boundary itself is the real isolation guarantee, not the regex.
- Never pass raw external text into executable code. The runtime receives validated, structured events only.
- Tests for sandbox validation and priority discard behavior are mandatory for changes in these areas. Add a test proving the isolate genuinely has no access to `require`, `process`, or the filesystem, not just that the regex rejects code that mentions them.

## Definition of done

- Keep the main flow demoable: ingest synthetic signals, surface three ranked actions, run a constrained analysis, and explain an action live.
- Add automated tests for new core logic and run the relevant validation before handoff.
- Document shortcuts that need production hardening. A local in-memory adapter is a demo shortcut; it must be replaced with Postgres before a multi-user launch.
