import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [
    react(),
    ...(mode === "local-run" ? [{
      name: "ai4se-local-entry",
      transformIndexHtml: {
        order: "pre",
        handler(html: string) {
          return html.replace("/src/main.tsx", "/src/main.local.tsx");
        }
      }
    }] : [])
  ],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4174" }
  }
}));
