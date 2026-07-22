import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import type * as React from "../../../apps/web/node_modules/@types/react/index.d.ts";
import type * as ReactDomServer from "../../../apps/web/node_modules/@types/react-dom/server.d.ts";
import { describe, expect, it } from "vitest";

import { App } from "../../../apps/web/src/App.js";
import { LocalApp } from "../../../apps/web/src/LocalApp.js";

const require = createRequire(import.meta.url);
const { createElement } = require("../../../apps/web/node_modules/react") as typeof React;
const { renderToStaticMarkup } = require("../../../apps/web/node_modules/react-dom/server") as typeof ReactDomServer;

describe("Web 双入口页面", () => {
  it("静态页面只展示固定演示内容，不包含本地运行表单", () => {
    const html = renderToStaticMarkup(createElement(App));

    expect(html).toContain("Coding Agent Harness");
    expect(html).toContain("固定 mock 轨迹");
    expect(html).toContain("治理阻断");
    expect(html).toContain("失败反馈修正");
    expect(html).toContain("Memory 摘要");
    expect(html).toContain("pnpm demo");
    expect(html).toContain("pnpm install --frozen-lockfile");
    expect(html.indexOf("Step 1")).toBeLessThan(html.indexOf("Step 2"));
    expect(html).not.toMatch(/<form|<input|type="password"|\/api\/runs|localhost/iu);
  });

  it("本地页面将静态内容与受控本地运行表单组合", () => {
    const html = renderToStaticMarkup(createElement(LocalApp));

    expect(html).toContain("Coding Agent Harness");
    expect(html).toMatch(/<label[^>]*>任务/iu);
    expect(html).toMatch(/<label[^>]*>Provider Base URL/iu);
    expect(html).toMatch(/<label[^>]*>模型/iu);
    expect(html).toMatch(/<input[^>]*type="password"/iu);
    expect(html.match(/<button[^>]*type="submit"/giu)).toHaveLength(1);
    expect(html).toContain("仅在本机开发服务器运行时发送");
    expect(html).toContain("本地运行尚未开始");
    expect(html).toMatch(/<header/iu);
    expect(html).toMatch(/<nav/iu);
    expect(html).toMatch(/<main/iu);
    expect(html).toMatch(/<section/iu);
    expect(html).toMatch(/<footer/iu);
  });

  it("网页源码不会持久化浏览器状态", async () => {
    const sourceDirectory = resolve("apps/web/src");
    const sourceFiles = [
      "App.tsx",
      "LocalApp.tsx",
      "demo-data.ts",
      "local-run-client.ts",
      "main.local.tsx",
      "main.tsx"
    ];
    const source = await Promise.all(sourceFiles.map(async (file) =>
      await readFile(resolve(sourceDirectory, file), "utf8")
    ));

    expect(source.join("\n")).not.toMatch(/localStorage|sessionStorage/u);
  });

  it("本地模式在 HTML 入口扫描前替换入口", async () => {
    const config = await readFile(resolve("apps/web/vite.config.ts"), "utf8");

    expect(config).toContain('mode === "local-run"');
    expect(config).toContain('order: "pre"');
    expect(config).toContain('html.replace("/src/main.tsx", "/src/main.local.tsx")');
  });
});
