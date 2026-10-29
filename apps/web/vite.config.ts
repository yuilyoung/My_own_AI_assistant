import { defineConfig } from "vite";
export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    cors: false,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
        configure: (proxy) =>
          proxy.on("proxyReq", (request, incoming) => {
            // Preserve hostile Origins for the Gateway to reject. Rewrite only this dev UI.
            if (
              ["http://127.0.0.1:5173", "http://localhost:5173"].includes(
                incoming.headers.origin || "",
              )
            )
              request.setHeader("origin", "http://127.0.0.1:8765");
          }),
      },
    },
  },
  build: { assetsInlineLimit: 0 },
});
