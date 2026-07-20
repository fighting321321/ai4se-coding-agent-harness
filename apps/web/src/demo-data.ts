export const architectureNodes = [
  { name: "Plan", detail: "任务目标与边界" },
  { name: "Act", detail: "受限工具执行" },
  { name: "Observe", detail: "反馈转为下一步上下文" },
  { name: "Govern", detail: "策略与审批共同裁决" }
] as const;

export const mechanisms = [
  { title: "最小权限", detail: "每个动作先经过 allow、ask 或 deny 的策略判断。" },
  { title: "反馈修正", detail: "失败观测会回到下一轮，让 Agent 聚焦修正而非盲目重试。" },
  { title: "可审计轨迹", detail: "步骤、策略与结果按顺序记录，便于复盘。" }
] as const;

export const memorySummaries = [
  "测试失败：优先读取失败用例与最近观测。",
  "命令边界：只执行配置中明确允许的命令。",
  "敏感路径：凭据文件写入必须被治理层阻断。"
] as const;

export const demoCommands = ["pnpm demo", "pnpm test", "pnpm lint"] as const;

export const demoRuns = [
  {
    id: "feedback-correction",
    title: "失败反馈修正",
    entries: [
      { step: 1, action: "run_command pnpm test", policy: "allow", observation: "fail: 1 test failed", status: "running" },
      { step: 2, action: "read_file failing-test.ts", policy: "allow", observation: "pass: focused context loaded", status: "running" },
      { step: 3, action: "finish", policy: "allow", observation: "pass: finish", status: "completed", stopReason: "finish" }
    ]
  },
  {
    id: "governance-block",
    title: "治理阻断",
    entries: [
      { step: 1, action: "write_file .ai4se/credentials.json", policy: "deny", observation: "blocked: sensitive path", status: "blocked", stopReason: "policy_denied" }
    ]
  }
] as const;
