import { buildLocalWebServer } from "./local-web-server.js";

const parsedPort = Number.parseInt(process.env.AI4SE_LOCAL_API_PORT ?? "4174", 10);
if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
  throw new Error("AI4SE_LOCAL_API_PORT 必须是有效端口");
}

const app = buildLocalWebServer({ cwd: process.cwd() });
await app.listen({ host: "127.0.0.1", port: parsedPort });
