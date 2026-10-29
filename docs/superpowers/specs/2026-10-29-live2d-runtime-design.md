# Official Cubism sample integration

User selected official Cubism SDK and official sample assets on 2026-10-29. Implements the already documented v0.3 contract in docs/design/live2d-frontend-integration.md.

Use existing React/Vite + official Cubism Web Framework/Core; one fixed official sample. Keep SDK/Core/model files in ignored local directories. Prefer direct official Framework integration over a third-party renderer to avoid another compatibility layer; an embedded official demo would not expose the required lifecycle and speech ownership.

A local runtime bundle exports a typed factory for a canvas-backed adapter. The app loads same-origin configuration, Core and runtime only when installed. Model files and their references must stay under the configured local asset root. No remote model loading. Emotion/gesture mappings are explicit and missing mappings are ignored. RMS controls the model's declared LipSync parameters after animation updates.

React owns one adapter lifecycle; asynchronous completion after unmount is discarded. Stop, mode change, pagehide and disconnect reset mouth and expression state. Disposal cancels animation and loading, releases textures, model and WebGL resources. Failed assets/context show a recoverable explanation while text chat remains available.

Tests cover configuration boundaries, unavailable assets, stale loads, lifecycle cleanup, response cues and reset behavior. Actual model rendering requires official Core and sample assets; synthetic tests do not prove it. Real STT/TTS/LLM and Windows device quality remain a subsequent validation stage.
