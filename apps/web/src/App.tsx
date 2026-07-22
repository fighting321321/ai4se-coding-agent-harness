import {
  architectureNodes,
  demoCommands,
  demoRuns,
  mechanisms,
  memorySummaries
} from "./demo-data.js";

export function App() {
  return (
    <>
      <a className="skip-link" href="#content">跳到主要内容</a>
      <header className="site-header">
        <div className="container">
          <p className="eyebrow">AI4SE course demo</p>
          <h1>Coding Agent Harness</h1>
          <p>以可解释、可治理的步骤完成工程任务。</p>
        </div>
      </header>
      <nav className="site-nav" aria-label="页面导航">
        <div className="container"><a href="#architecture">架构</a><a href="#trace">轨迹</a><a href="#memory">Memory</a><a href="#limits">边界</a></div>
      </nav>
      <main id="content" className="container">
        <section className="hero" aria-labelledby="hero-title">
          <p className="eyebrow">公开静态演示</p>
          <h2 id="hero-title">把 Agent 的每一步放在可检查的边界内</h2>
          <p className="boundary-callout">此页面仅使用固定 mock 轨迹；不会运行任务、收集凭据或连接本地服务。</p>
        </section>
        <section id="architecture" aria-labelledby="architecture-title">
          <h2 id="architecture-title">执行架构</h2>
          <div className="card-grid architecture-grid">
            {architectureNodes.map((node) => <article className="card" key={node.name}><h3>{node.name}</h3><p>{node.detail}</p></article>)}
          </div>
        </section>
        <section aria-labelledby="mechanism-title">
          <h2 id="mechanism-title">三项机制</h2>
          <div className="card-grid">
            {mechanisms.map((mechanism) => <article className="card" key={mechanism.title}><h3>{mechanism.title}</h3><p>{mechanism.detail}</p></article>)}
          </div>
        </section>
        <section id="trace" aria-labelledby="trace-title">
          <h2 id="trace-title">固定 mock 轨迹</h2>
          {demoRuns.map((run) => <article className="trace-run" key={run.id}><h3>{run.title}</h3><ol>{run.entries.map((entry) => <li key={entry.step}><strong>Step {entry.step}</strong><span className={`policy policy-${entry.policy}`}>{entry.policy}</span><code>{entry.action}</code><span>{entry.observation}</span><em>{entry.status}</em></li>)}</ol></article>)}
        </section>
        <section id="memory" aria-labelledby="memory-title">
          <h2 id="memory-title">Memory 摘要</h2>
          <ul className="memory-list">{memorySummaries.map((summary) => <li key={summary}>{summary}</li>)}</ul>
        </section>
        <section aria-labelledby="commands-title">
          <h2 id="commands-title">课程命令</h2>
          <div className="command-list">{demoCommands.map((command) => <code key={command}>{command}</code>)}</div>
        </section>
        <section id="limits" aria-labelledby="limits-title">
          <h2 id="limits-title">安全限制</h2>
          <p>策略拒绝敏感动作；需要确认的 ask 动作不在本静态演示中执行。持久化加密凭据和审批请使用 CLI。</p>
        </section>
      </main>
      <footer className="site-footer"><div className="container">AI4SE · 安全优先的 Coding Agent 教学演示</div></footer>
    </>
  );
}
