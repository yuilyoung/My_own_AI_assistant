# React voice MVP Implementation Plan

> Agentic workers: execute inline with superpowers:executing-plans. The user authorizes implementation, commits and push without intermediate approvals.

**Goal:** Bring existing local voice and memory workflows into the React UI, verify builds and CI, and identify the exact external assets still required for Live2D.
**Architecture:** Reuse the tested diagnostics audio modules through typed declarations. A session controller owns cancellation and rejects stale results; React renders its state. Serve the production build through the guarded Gateway.
**Tech Stack:** React, TypeScript, Vite, Vitest, FastAPI, pytest.
**Spec:** docs/design/live2d-frontend-integration.md and docs/design/technical-design.md.

## Global constraints
Local only; explicit microphone activation; transcript review before send; no cloud fallback; no bundled SDK/model without rights; assistant/companion scopes remain server controlled.

## Review focus
Late turn creation after stop; mode switches while recording/transcribing/playing; worklet URL in production under CSP; failure of audio must preserve text; stale memory lists must not cross scopes.

### Task 1: Session controller and authenticated audio
- [ ] Write failing transport/controller tests for WAV bytes, transcript review, stale turns, playback stop and scope changes.
- [ ] Implement GatewayClient.audio and Conversation controller, reusing recorder/player/VoiceInput with declarations.
- [ ] Run Vitest and existing Node audio suite; commit independently.

### Task 2: React user workflows
- [ ] Connect controller to React: provider status, mode, PTT, transcript composer, chat/playback, memories and assistant notes.
- [ ] Add DOM integration tests for demo notice, explicit send, mode switch and unavailable avatar.
- [ ] Run full web tests/typecheck/build; commit independently.

### Task 3: Production execution and reproducible CI
- [ ] Test built UI selection and environment override using pytest, then implement serving and docs.
- [ ] Add lockfile, formatter/lint, npm ci, artifact validation and CI checks.
- [ ] Run Python/Node/web checks; inspect production assets and push small commits; verify exact remote SHAs and Actions jobs/artifacts.

## Progress
Baseline main 31d56bb; existing remote engine/web workflows successful. External Cubism Core/SDK, licensed model and real local inference assets absent. Do all independent software work before requesting assets.
