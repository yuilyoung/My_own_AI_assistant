# Local/cloud service implementation plan

> **For agentic workers:** Use the existing feature branch and test-driven-development; independent server and avatar tasks are delegated under dispatching-parallel-agents, frontend integration stays with the parent.

**Goal:** Preserve local operation and add explicit cloud LLM selection and a usable avatar on both deployments.
**Architecture:** Per-service store/engine registry; same-origin authenticated frontend; server-only API credentials; basic SVG or installed Live2D assets.
**Tech Stack:** FastAPI/httpx/SQLite, React/TypeScript/Vite, Docker/Render.
**Spec:** docs/superpowers/specs/2026-11-17-local-cloud-services-design.md

## Global constraints
- Preserve existing local Ollama and default demo APIs; no silent provider fallback.
- Cloud service is explicit HTTPS configuration; no keys in API responses, browser storage or Git.
- Local/cloud memories, notes and sessions remain isolated; cancelling old work precedes a switch.
- Do not distribute unavailable licensed SDK or character assets; label the built-in avatar honestly.

## Review focus
- Missing credentials must disable cloud choice rather than break demo or pretend inference succeeded.
- A late local answer or recording must not enter a new cloud conversation.
- A pending mode/service change must not dispatch stale cues into the next avatar.
- Wrong API JSON, HTTP errors and redirects must fail with bounded, non-secret errors.
- A deploy must include the shared diagnostics source files as well as frontend files.

### Task 1: Backend services
- [x] Write provider/config/routing/isolation tests, observe RED, implement registry/settings/cloud API and avatar mount, run Python tests GREEN.
- Produces: status.default_service, status.deployment, status.services [{id,label,available,model,reason?}]; session creation accepts optional service demo|local|cloud.

### Task 2: Basic and licensed avatar choice
- [x] Test default SVG, Live2D opt-in, cleanup/cue/audio limits RED; implement AvatarPanel(bridge,level,cue?,busy?), verify GREEN.

### Task 3: Frontend switching
- [x] Test service selection, cancellation, unavailable provider and state clearing RED; implement GatewayClient/Conversation switching and cue state; targeted GREEN.
- [x] Integrate service selector, truthful storage/provider copy and AvatarPanel; run integration tests.

### Task 4: Delivery and verification
- [x] Update Windows launch/env examples and local/cloud deployment guide.
- [x] Python suite, frontend tests/format/lint/build, real browser synthetic smoke, Docker build/container auth smoke.
- [x] Independent review, fix material findings, commit and publish feature branch; do not change the live deployment before reporting final configuration and required external assets/keys.

## Verified outcome (2026-11-17)

Python 140/140, frontend 98/98, format/lint/typecheck/build passed. Chromium synthetic local/cloud switching, memory isolation and voice flow passed. Docker image build and container authentication/default/unavailable-service checks passed. Independent review found no material issues and independently probed four stale-operation transitions. External paid API, actual Windows hardware/Ollama and licensed Live2D remain unverified because credentials/assets/devices were not supplied. Feature is published to the deployment branch without merging main; API credentials remain a user-controlled Render setting.
