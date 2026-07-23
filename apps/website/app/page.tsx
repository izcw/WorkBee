import { DownloadButton } from "./DownloadButton";
import { InteractiveDigits } from "./InteractiveDigits";
import { NetworkGraph } from "./NetworkGraph";
import { KnowledgeGraph } from "./KnowledgeGraph";

const downloadUrl = "https://github.com/izcw";

const agents = [
  { name: "Aivra", role: "全能统筹 Agent", image: "/team/aivra-default.png", desc: "负责拆解目标、分派任务，并协调团队成员持续推进项目。", skills: ["任务拆解", "团队统筹"], knowledge: ["工作准则", "交付手册"] },
  { name: "Nova", role: "软件工程 Agent", image: "/team/nova.png", desc: "将需求转化为可靠的实现方案，处理代码、验证与交付细节。", skills: ["软件开发", "问题排查"], knowledge: ["工程实践", "质量基线"] },
  { name: "Mira", role: "产品设计 Agent", image: "/team/mira.png", desc: "梳理用户路径与产品结构，把想法打磨成可验证的体验方案。", skills: ["产品设计", "体验规划"], knowledge: ["设计规范", "产品指南"] },
  { name: "Sage", role: "研究文档 Agent", image: "/team/sage.png", desc: "收集资料、核对信息并提炼重点，为团队提供可靠的研究支持。", skills: ["资料研究", "文档整理"], knowledge: ["研究方法", "证据手册"] },
  { name: "Lyra", role: "运营内容 Agent", image: "/team/lyra.png", desc: "规划内容与推进节奏，把团队成果清晰地传递到合适的场景。", skills: ["内容策划", "运营推进"], knowledge: ["运营手册", "活动执行"] },
];

function ProductShell({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`app-shell${compact ? " compact" : ""}`}>
      <div className="app-titlebar">
        <div className="traffic"><i /><i /><i /></div>
        <span>AIvra</span>
        <span className="command-key">⌘ K</span>
      </div>
      <div className="app-body">
        <aside className="app-sidebar">
          <strong>AIvra</strong>
          <nav><span className="selected">⌂ <b>主页</b></span><span>◌ <b>对话</b></span><span>□ <b>项目</b></span><span>◇ <b>团队</b></span></nav>
          <small>最近项目</small>
          <span className="project-link"><i /> 产品发布</span>
          <span className="project-link"><i /> 用户研究</span>
        </aside>
        <div className="app-content">
          <div className="welcome-row">
            <div className="mini-avatar"><img src="/team/aivra.png" alt="" /></div>
            <div><small>下午好</small><h3>今天想完成什么？</h3></div>
          </div>
          <div className="composer">
            <p>告诉 AIvra 你的目标，剩下的交给团队…</p>
            <div><span>＋ 添加文件</span><button aria-label="发送">↑</button></div>
          </div>
          <div className="project-row">
            <article><small>进行中</small><strong>产品发布</strong><p>整理发布清单与宣传内容</p><div className="avatar-stack">{agents.map(a => <img key={a.name} src={a.image} alt="" />)}</div></article>
            <article><small>本周</small><strong>用户研究</strong><p>分析 128 条用户反馈</p><div className="progress-line"><i /></div></article>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return <main>
    <header className="site-header">
      <a className="logo" href="#top">AIvra</a>
      <nav aria-label="主导航"><a href="#product">产品概览</a><a href="#relations">协作关系</a><a href="#features">核心能力</a><a href="#models">模型接入</a><a href="#team">数字团队</a><a href="#download">下载</a></nav>
      <a className="header-cta" href={downloadUrl}>免费下载</a>
    </header>

    <section className="hero" id="top">
      <InteractiveDigits />
      <div className="hero-mask mask-a" aria-hidden="true" /><div className="hero-mask mask-b" aria-hidden="true" /><div className="hero-mask mask-c" aria-hidden="true" />
      <img className="hero-avatar" src="/team/aivra.png" alt="AIvra" />
      <h1>AIvra Team</h1>
      <h2>为每项工作，组建专属数字团队</h2>
      <p>把角色、技能、知识库和项目放进同一个桌面工作空间。<br />从一次对话开始，让信息沉淀为可分派、可追踪、可继续推进的工作。</p>
      <div className="hero-actions"><DownloadButton /></div>
      <div className="hero-product-heading"><h2>你的智能工作团队</h2><p>把任务、文件、协作与执行集中在一个安静的空间里。</p></div>
      <div className="hero-product"><img src="/product/aivra-desktop.png" alt="AIvra Desktop 产品界面" /></div>
    </section>

    <section className="intro" id="product">
      <span className="section-label">从角色到执行，保持连接</span>
      <h2>让角色、知识和流程<br />在同一个项目里协作。</h2>
      <p>为项目选择合适的角色，连接专属知识库，并用可编辑步骤组织执行过程。AIvra 让每次对话都承接已有背景，并自然延展为下一步行动。</p>
    </section>

    <section className="relation-section product-relation" id="relations"><div className="relation-copy"><span className="section-label">协作关系谱</span><h3>角色不是孤立的聊天对象。</h3><p>技能决定角色能做什么，知识库提供执行依据，团队负责人将不同角色连接到同一个项目目标。</p></div><NetworkGraph /></section>

    <section className="feature-grid" id="features">
      <article className="feature-card feature-large">
        <div className="card-copy"><span>01 · 对话与任务</span><h3>从想法到行动，<br />不必离开同一个上下文。</h3><p>使用“对话”快速讨论、补充信息和探索思路；切换到“任务”后，让选定角色按权限与步骤执行具体工作。</p></div>
        <div className="mode-demo"><div className="mode-tabs"><span className="active">对话</span><span>任务</span></div><div className="mode-input"><p>分析这些候选人简历，并找出与岗位最匹配的人选。</p><div><span>＋ 选择文件</span><span>◎ 选择角色</span><b>发送</b></div></div><div className="mode-note"><i>对话</i><span>适合询问、讨论和补充上下文</span><i>任务</i><span>适合调用角色能力并执行工作</span></div></div>
      </article>
      <article className="feature-card">
        <div className="card-copy"><span>02 · 知识库管理</span><h3>让每个角色，<br />读取正确的知识。</h3><p>集中管理文档知识库；为角色绑定专属资料，也可以在对话中选择公共知识库，让回答与执行始终基于可信内容。</p></div>
        <KnowledgeGraph />
      </article>
      <article className="feature-card dark-card">
        <div className="card-copy"><span>03 · 项目状态</span><h3>执行到哪一步，<br />在项目里一眼看清。</h3><p>查看正在进行的项目、负责角色和当前阶段。对话历史、任务结果与下一步行动都留在同一条工作脉络中。</p></div>
        <div className="progress-board"><div className="progress-summary"><span>简历筛选</span><b>3 / 5 已完成</b></div><div className="progress-meter"><i /></div><div className="progress-timeline"><div className="done"><i>✓</i><span>需求确认<small>Aivra</small></span></div><div className="done"><i>✓</i><span>简历分析<small>Ava</small></span></div><div className="current"><i>3</i><span>候选人评估<small>团队协作中</small></span></div><div><i>4</i><span>生成名单<small>待开始</small></span></div></div></div>
      </article>
      <article className="feature-card workflow-card">
        <div className="card-copy"><span>04 · 自定义工作步骤</span><h3>把一次对话，<br />组织成可编辑的流程。</h3><p>添加、删除、选择或拖动步骤，并为每一步分别绑定角色、技能与知识库。需求分析可以交给 Aivra，资料研究由 Emma 读取项目知识库，后续步骤再调用不同成员继续执行。</p></div>
        <div className="workflow-demo"><div className="workflow-title"><span>当前工作流</span><b>可拖动排序</b></div><div className="workflow-steps">{["需求","设计","实现","测试","行动"].map((step,i)=><div className={i===2?"active":""} key={step}><i>⠿</i><span>{step}</span><b>×</b></div>)}<button>＋ 添加步骤</button></div><div className="step-bindings"><span><b>Aivra</b> 需求分析</span><span><b>Emma</b> 项目知识库</span><span><b>Ava</b> 信息聚合</span></div><p>每个步骤都可以拥有独立的角色、技能与知识来源</p></div>
      </article>
      <article className="feature-card always-on-card">
        <div className="card-copy"><span>05 · 持续运行</span><h3>保持工作 24 小时<br />不间断运转。</h3><p>把重复工作设置为定时任务。日报整理、资料汇总和周期性检查会按计划启动，由指定角色在后台持续处理。</p></div>
        <div className="schedule-demo"><div className="schedule-head"><span>自动运行计划</span><b>全部启用</b></div><div className="schedule-row"><i>07:30</i><div><strong>每日行业简报</strong><small>Emma · 每天</small></div><b>运行中</b></div><div className="schedule-row"><i>12:00</i><div><strong>候选人进度汇总</strong><small>Ava · 工作日</small></div><b>已计划</b></div><div className="schedule-row"><i>18:30</i><div><strong>项目状态检查</strong><small>Aivra · 每天</small></div><b>已计划</b></div><div className="heartbeat"><i /><span>团队在线 · 下次任务将在 24 分钟后运行</span></div></div>
      </article>
      <article className="feature-card model-card" id="models">
        <div className="card-copy"><span>06 · 自定义模型接入</span><h3>模型由你选择，<br />AIvra 负责组织协作。</h3><p>AIvra 不内置大模型。通过自己的 API 配置连接外部模型服务，并根据对话、任务或工作步骤选择合适的模型。模型凭证与使用方式始终由你掌控。</p></div>
        <div className="model-demo"><div className="model-head"><span>模型服务</span><button>＋ 添加服务</button></div><div className="model-row active"><i>API</i><div><strong>主要模型</strong><small>自定义接口 · 已连接</small></div><b>默认</b></div><div className="model-row"><i>API</i><div><strong>快速模型</strong><small>自定义接口 · 已连接</small></div><b>任务</b></div><div className="model-route"><span>对话</span><i />主要模型<i /><span>步骤 03</span><i />快速模型</div><small>不同对话、角色和步骤可选择不同模型</small></div>
      </article>
    </section>

    <section className="agent-spotlight" aria-labelledby="agent-spotlight-title">
      <div className="spotlight-copy"><span>AIvra Agent</span><h2 id="agent-spotlight-title">把目标交给团队，<br />让每一步都有专长。</h2><p>AIvra 统筹你的工作目标，把研究、设计、实现与交付交给合适的角色。每个 Agent 都带着自己的技能、知识与工作上下文。</p><a href="#team">认识你的团队 <b>↓</b></a><div className="spotlight-index" aria-hidden="true"><i /><i className="active" /><i /><i /><i /></div></div>
      <div className="spotlight-stage" aria-label="Agent 协作示例">
        <article className="spotlight-card research-card"><div className="spotlight-card-head"><img src="/team/sage.png" alt="" /><span>Sage · 资料研究</span><b>处理中</b></div><h3>用户研究摘要</h3><p>已整理 128 条反馈，并标记 3 个高优先级机会。</p><div className="research-lines"><i /><i /><i /><i /></div></article>
        <article className="spotlight-card plan-card"><div className="spotlight-card-head"><img src="/team/aivra-default.png" alt="" /><span>Aivra · 团队统筹</span><b>进行中</b></div><h3>发布计划</h3><div className="plan-list"><p><i>✓</i> 汇总目标与约束</p><p><i>✓</i> 分派研究与设计</p><p className="current"><i>3</i> 生成发布清单</p></div></article>
        <article className="spotlight-card build-card"><div className="spotlight-card-head"><img src="/team/nova.png" alt="" /><span>Nova · 软件工程</span><b>待确认</b></div><h3>实现建议</h3><div className="code-lines"><i /><i /><i /><i /><i /></div><small>变更将在确认后执行</small></article>
      </div>
    </section>

    <section className="team-section" id="team">
      <div className="team-copy"><span className="section-label">你的 AIvra 团队</span><h2>角色由你定义，团队按需生长。</h2><p>从职责、描述、技能到专属知识库，每个角色都可自由创建和调整。先用默认角色开始，再把团队塑造成你的工作方法。</p></div>
      <div className="agent-marquee"><div className="pixel-dissolve pixel-left" aria-hidden="true">{Array.from({length:96},(_,i)=><i key={i}/>)}</div><div className="pixel-dissolve pixel-right" aria-hidden="true">{Array.from({length:96},(_,i)=><i key={i}/>)}</div><div className="agent-track">{[...agents,...agents,...agents].map((agent, i) => <article key={`${agent.name}-${i}`} aria-hidden={i>=agents.length}><div className="agent-card-inner"><div className="agent-front"><span className="agent-speech">{agent.role}</span><img src={agent.image} alt={i<agents.length ? `${agent.name} 头像` : ""} /><h3>{agent.name}</h3><p>{agent.role}</p></div><div className="agent-back"><small>{agent.role}</small><h3>{agent.name}</h3><p>{agent.desc}</p><strong>技能</strong><div className="agent-tags">{agent.skills.map(x=><span key={x}>{x}</span>)}</div><strong>知识库</strong><div className="agent-tags">{agent.knowledge.map(x=><span key={x}>{x}</span>)}</div></div></div></article>)}</div></div>
    </section>

    <section className="quote-section"><p>角色负责专长，知识提供依据，<br />流程让团队真正协作起来。</p><span>Build your own AIvra Team</span><div className="quote-orbit" aria-hidden="true"><i /><i /><i /><b>AI</b></div></section>

    <section className="download" id="download">
      <div className="download-copy"><span className="section-label">开始使用 AIvra</span><h2>把下一件事，<br />交给 AIvra。</h2><p>免费下载桌面端。安装完成后，先定义团队，再决定它如何与你一起工作。</p></div>
      <div className="download-buttons">
        <a href={downloadUrl}><img className="download-icon" src="/icon/apple.png" alt="" /><div><small>下载适用于</small><strong>macOS</strong><span>Apple 芯片 · macOS 12+</span></div></a>
        <a href={downloadUrl}><img className="download-icon" src="/icon/windows.png" alt="" /><div><small>下载适用于</small><strong>Windows</strong><span>64 位 · Windows 10+</span></div></a>
        <small>当前版本 0.1.0</small>
      </div>
    </section>

    <footer><div><a className="logo" href="#top">AIvra</a><p>组建团队，连接知识，推进任务。</p></div><div><strong>产品</strong><a href="#product">功能</a><a href="#team">数字团队</a><a href="#download">下载</a></div><div><strong>平台</strong><a href={downloadUrl}>macOS</a><a href={downloadUrl}>Windows</a><a href={downloadUrl}>GitHub</a></div><span>© 2026 AIvra</span></footer>
  </main>;
}
