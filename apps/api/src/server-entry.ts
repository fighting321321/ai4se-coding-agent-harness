import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildLocalWebServer,
  type LocalWebServerOptions
} from "./local-web-server.js";

interface LocalWebServerProcess {
  listen(options: { readonly host: string; readonly port: number }): Promise<unknown>;
}

export interface StartLocalApiOptions {
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly createServer?: (options: LocalWebServerOptions) => LocalWebServerProcess;
}

export function parseLocalApiPort(value: string | undefined): number {
  const candidate = value ?? "4174";
  if (!/^[0-9]+$/u.test(candidate)) {
    throw new Error("AI4SE_LOCAL_API_PORT 必须是有效端口");
  }

  const port = Number(candidate);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("AI4SE_LOCAL_API_PORT 必须是有效端口");
  }
  return port;
}

export async function startLocalApi({
  cwd = process.cwd(),
  environment = process.env,
  createServer = buildLocalWebServer
}: StartLocalApiOptions = {}): Promise<void> {
  const port = parseLocalApiPort(environment.AI4SE_LOCAL_API_PORT);
  const app = createServer({ cwd });
  await app.listen({ host: "127.0.0.1", port });
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  await startLocalApi();
}
