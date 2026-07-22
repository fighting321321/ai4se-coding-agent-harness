import { describe, expect, it, vi } from "vitest";

import {
  parseLocalApiPort,
  startLocalApi
} from "../../../apps/api/src/server-entry.js";
import { createWebConfig } from "../../../apps/web/vite.config.js";

describe("本地 Web API 端口", () => {
  it("非默认端口同时驱动 API listen 与 Vite proxy", async () => {
    const listen = vi.fn(async () => undefined);
    const createServer = vi.fn(() => ({ listen }));

    await startLocalApi({
      cwd: "workspace",
      environment: { AI4SE_LOCAL_API_PORT: "4312" },
      createServer
    });
    const webConfig = createWebConfig("local-run", { AI4SE_LOCAL_API_PORT: "4312" });

    expect(createServer).toHaveBeenCalledWith({ cwd: "workspace" });
    expect(listen).toHaveBeenCalledWith({ host: "127.0.0.1", port: 4312 });
    expect(webConfig.server?.proxy).toEqual({ "/api": "http://127.0.0.1:4312" });
  });

  it("未配置时统一使用 4174", async () => {
    const listen = vi.fn(async () => undefined);

    await startLocalApi({
      cwd: "workspace",
      environment: {},
      createServer: () => ({ listen })
    });

    expect(parseLocalApiPort(undefined)).toBe(4174);
    expect(listen).toHaveBeenCalledWith({ host: "127.0.0.1", port: 4174 });
    expect(createWebConfig("local-run", {}).server?.proxy)
      .toEqual({ "/api": "http://127.0.0.1:4174" });
  });

  it.each(["", " 4174", "4174 ", "4174abc", "41.74", "0", "65536", "-1"])(
    "拒绝非严格端口 %j",
    (value) => {
      expect(() => parseLocalApiPort(value)).toThrow("AI4SE_LOCAL_API_PORT 必须是有效端口");
      expect(() => createWebConfig("local-run", { AI4SE_LOCAL_API_PORT: value }))
        .toThrow("AI4SE_LOCAL_API_PORT 必须是有效端口");
    }
  );
});
