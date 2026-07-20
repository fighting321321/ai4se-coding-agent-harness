import { useState, type FormEvent } from "react";

import { App } from "./App.js";
import { submitLocalRun, type LocalRunResponse } from "./local-run-client.js";

export function LocalApp() {
  const [task, setTask] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<LocalRunResponse>();
  const [error, setError] = useState<string>();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    setResult(undefined);
    setError(undefined);
    const request = { task, baseUrl, model, apiKey };
    const outcome = await submitLocalRun(request);
    setApiKey(outcome.apiKey);
    setResult(outcome.result);
    setError(outcome.error);
    setRunning(false);
  }

  return (
    <>
      <App />
      <section className="container local-runner-section" aria-labelledby="local-title">
        <section className="local-runner">
          <h2 id="local-title">本地运行器</h2>
          <p>仅在本机开发服务器运行时发送请求。ask 动作会被拒绝；加密持久化凭据与审批请使用 CLI。</p>
          <form onSubmit={handleSubmit}>
            <label htmlFor="task">任务<input id="task" value={task} onChange={(event) => setTask(event.target.value)} required /></label>
            <label htmlFor="base-url">Provider Base URL<input id="base-url" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required /></label>
            <label htmlFor="model">模型<input id="model" value={model} onChange={(event) => setModel(event.target.value)} required /></label>
            <label htmlFor="api-key">API Key<input id="api-key" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required /></label>
            <button type="submit" disabled={running}>{running ? "运行中…" : "运行本地任务"}</button>
          </form>
          <div className="run-status" role="status" aria-live="polite">
            {running ? "本地任务运行中" : error ?? (result === undefined ? "本地运行尚未开始" : `任务状态：${result.status}`)}
          </div>
          {result === undefined ? null : <ol className="local-trace">{result.trace.map((entry) => <li key={entry.step}>Step {entry.step}：{entry.action?.type ?? "action"} · {entry.policy} · {entry.status} · {entry.observation ?? ""}</li>)}</ol>}
        </section>
      </section>
    </>
  );
}
