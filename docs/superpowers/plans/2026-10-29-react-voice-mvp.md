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
- [x] Write failing transport/controller tests for WAV bytes, transcript review, stale turns, playback stop and scope changes.
- [x] Implement GatewayClient.audio and Conversation controller, reusing recorder/player/VoiceInput with declarations.
- [x] Run Vitest and existing Node audio suite; commit independently.

### Task 2: React user workflows
- [x] Connect controller to React: provider status, mode, PTT, transcript composer, chat/playback, memories and assistant notes.
- [x] Add DOM integration tests for demo notice, explicit send, mode switch and unavailable avatar.
- [x] Run full web tests/typecheck/build; commit independently.

### Task 3: Production execution and reproducible CI
- [x] Test built UI selection and environment override using pytest, then implement serving and docs.
- [x] Add lockfile, formatter/lint, npm ci, artifact validation and CI checks.
- [x] Run Python/Node/web checks; inspect production assets and push small commits; verify exact remote SHAs and Actions jobs/artifacts.

## Progress
Baseline main 31d56bb; existing remote engine/web workflows successful. External Cubism Core/SDK, licensed model and real local inference assets absent. Do all independent software work before requesting assets.


## Execution ledger

- Task 1 complete: voice/session controller, authenticated WAV transport and stale-generation tests; initial 12 web tests green.
- Task 2 complete: React voice, memory and notes UI; DOM integration, full web suite and production build green.
- Task 3: implementation committed, final exact-SHA CI verification recorded in docs/implementation-status.md.
- Ruling: user explicitly requested autonomous implementation/push; no additional design/merge permission gates introduced. Existing architecture and runtime choices preserved.
- Ruling: reuse existing tested diagnostics audio modules through typed declarations rather than duplicate a second audio stack; shared-module paths now trigger web CI.
- Fresh whole-branch review found orphaned inference after polling rejection. Added failing regression, cancelled active server turn on error, and verified 14 web tests green.
- CI exposed Windows registry .mjs MIME mismatch. Reproduced with an overridden MIME map and verified explicit JavaScript mapping with 59 Python tests green.
- CI browser test locator combined memory text with its delete button. Scoped assertion to the list item without weakening scope or deletion checks.
- External gate: actual Cubism SDK/Core, licensed model export and real local inference assets are absent. No complete Live2D MVP claim.

- Browser voice 422 was traced to the upload boundary; test uses a deterministic non-silent WAV microphone and asserts rate/frame-count/nonzero PCM before recording final CI evidence.

- Final code bf6b545: engine CI 40874171930 and web CI 40874172006 both success; production Chromium synthetic voice flow green, web-dist and gateway-wheel artifacts verified. Evidence: docs/validation/react-voice-ci.json.
