# React UI — F1 text chat

React + TypeScript + Vite frontend. This first stage implements token pairing, session creation, mode switching, text turns, polling and cancellation. Live2D, microphone, audio playback and memory management are **not** implemented in this frontend; use `apps/diagnostics` for existing voice features.

Start the FastAPI Gateway, then run:

```sh
cd apps/web
npm install
npm run dev
```

The development server binds to `127.0.0.1` and proxies `/api` to `127.0.0.1:8765`. Do not expose it to the network. Run `npm run build` to type-check and build. Build and browser validation have **not** been executed for this commit. Production serving requires additional same-origin integration.
