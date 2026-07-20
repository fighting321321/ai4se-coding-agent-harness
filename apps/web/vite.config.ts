import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function localApiPort(environment: Readonly<Record<string, string | undefined>>): number {
  const candidate = environment.AI4SE_LOCAL_API_PORT ?? "4174";
  if (!/^[0-9]+$/u.test(candidate)) {
    throw new Error("AI4SE_LOCAL_API_PORT 必须是有效端口");
  }

  const port = Number(candidate);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("AI4SE_LOCAL_API_PORT 必须是有效端口");
  }
  return port;
}

export function createWebConfig(
  mode: string,
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  const apiPort = localApiPort(environment);
  return {
    base: "./",
    plugins: [
      react(),
      ...(mode === "local-run" ? [{
        name: "ai4se-local-entry",
        transformIndexHtml: {
          order: "pre" as const,
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
      proxy: { "/api": `http://127.0.0.1:${apiPort}` }
    }
  };
}

export default defineConfig(({ mode }) => createWebConfig(mode));
