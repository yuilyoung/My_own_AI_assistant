# Live2D Runtime Implementation Plan

> For agentic workers: use superpowers:executing-plans to implement task by task.

**Goal:** Connect the official Cubism runtime and one official sample to the existing React conversation UI.
**Architecture:** An optional local runtime bundle supplies a typed canvas adapter. React consumes its lifecycle and conversation cues; vendor assets remain ignored.
**Tech Stack:** TypeScript, React, Cubism Web Framework/Core, Vite/esbuild, Vitest.
**Spec:** docs/superpowers/specs/2026-10-29-live2d-runtime-design.md

## Global Constraints
- Existing isolated cloud checkout; no extra worktree.
- No Core/model redistribution in git; preserve local authentication and same-origin policy.
- Model missing/error must never display ready. Actual render validation is distinct from synthetic tests.

## Review Focus
- Disposed asynchronous loads must not resurrect canvas resources.
- Mode change/cancel must reset mouth and response cues.
- Remote or escaping model paths must be rejected.
- Missing motion/expression mappings must not call unsupported SDK entries.
- WebGL/runtime failures must preserve usable chat.

## Tasks
- [x] Add tests for local asset configuration and adapter load/dispose; observe failure, implement loader, verify.
- [x] Add response cue/reset tests; extend segment contract, conversation state and React canvas integration; verify.
- [x] Implement official Framework runtime against pinned official source, texture/model loading, motions/expressions/LipSync and cleanup. Build via a local SDK installer with explicit asset provenance.
- [x] Run all Python/web/diagnostic tests, lint and production build. Exercise actual renderer if Core is available; record concrete external blockers otherwise.
- [x] Review changes, correct defects, update implementation/asset instructions with verified results.

## Execution evidence and remaining gate

- User selected official SDK/sample approach; existing v0.3 contract governed implementation. Used existing isolated checkout and feature branch.
- SDK reference research and runtime work were delegated as independent components; whole change received a separate review.
- Tests first reproduced missing configuration/cues/lifecycle, neutral reset/idle interruption, Vite fallback and portrait fitting. Full suites and actual Framework bundle compiled successfully.
- Review found cross-filesystem installer rename: stage now lives beside target folders.
- Official Core is absent from GitHub and official download returns proxy 403. Full SDK install/typecheck, actual rendering and visual emotion mappings remain blocked, NOT complete.
- Default expression/nod/greeting mappings remain empty until visually verified; idle is Idle[0]. This avoids unsupported semantic claims and leaves character expressiveness pending.
