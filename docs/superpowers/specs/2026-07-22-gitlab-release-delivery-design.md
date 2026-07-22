# GitLab Release 简易交付设计

## 背景

项目的静态 Web 构建与 CI 均已通过，但南京大学 GitLab 实例没有提供可用的 Pages 管理入口或公开访问地址。继续尝试 Pages 会增加时间成本，且不是完成作业的必要条件。助教允许只提供 CLI，并使用托管平台 Release 链接作为部署交付方式。

## 目标

以最少改动完成可检查、可下载、可安装的课程交付：

- GitLab `v1.0.0` Release 页面作为公开交付入口；
- Release 提供 `ai4se-harness-0.1.0.tgz` CLI 安装包；
- README 给出 Release 地址、下载安装与最小运行命令；
- WebUI 保留为本地可选演示，不再声明可公开访问的 Pages 服务。

## 实现范围

1. 删除无效的 Pages 部署作业和相应部署契约，保留现有 Web 构建与本地启动能力。
2. 更新 README，将交付方式改为 GitLab Release，并明确 Node.js 24 环境要求。
3. 使用现有 `pnpm pack` 和分发 smoke 测试生成、验证 CLI tarball，不增加新的打包系统。
4. 合并到 `main` 后创建 `v1.0.0` 标签和 GitLab Release，将经过 CI 验证的 tarball 上传为 Release 附件。

## 交付流程

```text
dev 修改与验证
  -> 合并 main
  -> main 流水线通过
  -> 创建 v1.0.0 标签
  -> 下载 CI 生成的 ai4se-harness-0.1.0.tgz
  -> 创建 GitLab Release 并上传 tarball
  -> 验证 Release 下载与 CLI 安装
```

## 验证与安全

- 统一入口的测试、lint、类型检查、构建、Demo 和最终审计全部通过后才提交。
- 在临时目录安装 Release tarball，并运行 `ai4se-harness smoke` 验证 CLI。
- Release、README、日志和 Git 历史不得包含 API Key、密码或 token。
- 不迁移到 GitHub，不增加数据库，不开发新的 WebUI 功能，也不建设自动发布流水线。

## 完成标准

- `main` 最新流水线通过；
- GitLab `v1.0.0` Release 链接可访问；
- tarball 可下载并通过离线安装 smoke；
- README 中没有 Pages 占位链接，且交付步骤可由助教直接执行。
