## T05 最终版本图修正

1. 在 Web workspace 显式固定 `@types/node` 为 `24.13.3`，消除 Vite 与 React 插件 peer 实例残留的 Node 26 类型。
2. 使用批准的 Node 24 与 pnpm 11.14.0 重建并核验锁文件、实际 junction 和工程门禁。
3. 记录修正证据后，以独立提交将本计划清空。
