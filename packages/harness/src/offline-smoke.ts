import { parseAction } from "./action-parser.js";
import { ScriptedMockLLM } from "./scripted-mock-llm.js";

export async function runOfflineSmoke(): Promise<string> {
  const provider = new ScriptedMockLLM([
    { raw: { type: "finish", summary: "completed" } }
  ]);
  const output = await provider.complete({
    task: "验证已安装 Harness 的离线入口",
    context: [],
    observations: []
  });
  const parsed = parseAction(output.raw);
  if (!parsed.ok || parsed.value.type !== "finish") {
    throw new Error("离线 smoke 未得到 finish Action");
  }
  return `AI4SE Harness 离线 smoke：${parsed.value.summary}`;
}
