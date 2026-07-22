# 第三方许可证说明

本文件记录本仓库根 workspace、`apps/api`、`apps/web` 和 `packages/harness` 的**直接**依赖。版本以 `package.json` 的精确声明和 `pnpm-lock.yaml` 的锁定结果为准；许可证以当前已安装包的 `package.json` 元数据核验。核验日期为 2026-07-21。

所有列出的第三方许可证均为其作者授予的原始许可；本文件不复制许可证全文，也不为本项目或其使用者声明未被授予的权利。完整许可证文本应从相应依赖包或其上游仓库获取。

## 运行时直接依赖

| 所属包 | 依赖 | 声明/锁定版本 | 已安装包元数据许可证 | 用途 |
| --- | --- | --- | --- | --- |
| `apps/api` | `fastify` | `5.10.0` | MIT | 仅回环本地 Fastify API。 |
| `apps/web` | `react` | `19.2.7` | MIT | 静态 mock 与本地运行界面的组件渲染。 |
| `apps/web` | `react-dom` | `19.2.7` | MIT | React 的 DOM 渲染。 |

`apps/api` 还直接声明了 `@ai4se/harness: workspace:*`。这是仓库内本地 workspace 包，不是第三方依赖；其版本为 `0.2.0`，包元数据标记为 `UNLICENSED`。这不授予任何再分发或开源许可。`packages/harness` 自身没有第三方运行时直接依赖。

## 开发时直接依赖

| 所属包 | 依赖 | 声明/锁定版本 | 已安装包元数据许可证 | 用途 |
| --- | --- | --- | --- | --- |
| 根 workspace | `@eslint/js` | `10.0.1` | MIT | ESLint 推荐规则。 |
| 根 workspace | `@types/node` | `24.13.3` | MIT | Node.js TypeScript 类型。 |
| 根 workspace | `eslint` | `10.7.0` | MIT | 静态代码检查。 |
| 根 workspace | `typescript` | `6.0.3` | Apache-2.0 | TypeScript 编译与类型检查。 |
| 根 workspace | `typescript-eslint` | `8.64.0` | MIT | TypeScript 的 ESLint 集成。 |
| 根 workspace | `vitest` | `4.1.10` | MIT | 离线单元、集成与演示测试。 |
| `apps/web` | `@vitejs/plugin-react` | `6.0.3` | MIT | Vite 的 React 转换支持。 |
| `apps/web` | `@types/node` | `24.13.3` | MIT | Web 构建配置的 Node.js 类型。 |
| `apps/web` | `@types/react` | `19.2.17` | MIT | React TypeScript 类型。 |
| `apps/web` | `@types/react-dom` | `19.2.3` | MIT | React DOM TypeScript 类型。 |
| `apps/web` | `vite` | `8.1.5` | MIT | 静态 Web 构建与本地开发服务器。 |

`apps/api` 与 `packages/harness` 没有各自声明的开发时直接依赖；它们使用根 workspace 的开发工具。根 workspace 没有运行时直接依赖。

## 核验规则与范围

- 所有上述第三方依赖在各自 `package.json` 中使用精确版本声明，且已安装包元数据的名称、版本和许可证与该声明一致；本次未发现需要以包元数据覆盖锁文件版本的冲突。
- 本文件只覆盖直接依赖，不把它当作所有传递依赖的完整 SBOM 或法律意见。安装后产生的传递依赖仍受它们各自的许可证约束。
- Node.js、pnpm 和操作系统工具不是本 workspace 的 npm 直接依赖，因此不列入本表。
- 仓库根包 `ai4se` 为 `private: true`，未声明项目自身许可证；不要从本文件推断该项目向你授予了任何许可。
