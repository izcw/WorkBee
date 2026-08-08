import { DownloadButton } from "./DownloadButton";
import { InteractiveDigits } from "./InteractiveDigits";
import { NetworkGraph } from "./NetworkGraph";

const downloadUrl = "https://github.com/izcw/Aivra-Agent/releases";

const agents = [
  { name: "BeeYo", role: "全能统筹 Agent", image: "/team/logo.png", desc: "负责拆解目标、分派任务，并协调团队成员持续推进项目。", skills: ["任务拆解", "团队统筹"], knowledge: ["工作准则", "交付手册"] },
  { name: "Codeo", role: "软件工程 Agent", image: "/team/codeo.png", desc: "将需求转化为可靠的实现方案，处理代码、验证与交付细节。", skills: ["软件开发", "问题排查"], knowledge: ["工程实践", "质量基线"] },
  { name: "Viso", role: "产品设计 Agent", image: "/team/viso.png", desc: "梳理用户路径与产品结构，把想法打磨成可验证的体验方案。", skills: ["产品设计", "体验规划"], knowledge: ["设计规范", "产品指南"] },
  { name: "Lexo", role: "研究文档 Agent", image: "/team/lexo.png", desc: "收集资料、核对信息并提炼重点，为团队提供可靠的研究支持。", skills: ["资料研究", "文档整理"], knowledge: ["研究方法", "证据手册"] },
  { name: "Buzzo", role: "运营内容 Agent", image: "/team/buzzo.png", desc: "规划内容与推进节奏，把团队成果清晰地传递到合适的场景。", skills: ["内容策划", "运营推进"], knowledge: ["运营手册", "活动执行"] },
];

export default function Home() {
  return <main>
    <header className="site-header">
      <a className="logo" href="#top"><img src="/icon/logo.png" alt="WorkBee" />WorkBee</a>
      <nav aria-label="主导航"><a href="#product">产品概览</a><a href="#relations">协作关系</a><a href="#features">核心能力</a><a href="#models">模型接入</a><a href="#team">数字团队</a><a href="#download">下载</a></nav>
      <a className="header-cta" href={downloadUrl}>前往下载</a>
    </header>

    <section className="hero" id="top">
      <InteractiveDigits />
      <div className="hero-mask mask-a" aria-hidden="true" /><div className="hero-mask mask-b" aria-hidden="true" /><div className="hero-mask mask-c" aria-hidden="true" />
      <h1>WorkBee 桌面应用</h1>
      <p>本地运行、自主规划、安全可控的 AI 工作搭子。描述需求，自动执行，直接交付结果。</p>
      <div className="hero-actions"><DownloadButton /></div>
    </section>

    <section className="product-showcase" aria-labelledby="product-showcase-title">
      <div className="hero-product-heading"><h2>你的智能工作团队</h2><p>把任务、文件、协作与执行集中在一个安静的空间里。</p></div>
      <div className="hero-product"><img src="https://www.lumehub.duoyu.link/resource/aivra/original/7812bd86fe8d_20260712.png" alt="WorkBee Desktop 产品界面" /></div>
    </section>

    <section className="bento-section" aria-labelledby="bento-title">
      <div className="bento-heading">
        <h2 id="bento-title">说出想法，自动完成，直接交付。</h2>
        <p>本地优先的桌面 Agent 工作空间：多角色并行协作，混合检索提供依据，高风险操作先经你批准。</p>
      </div>
      <div className="bento-grid">
        <article className="bento-card bento-gray">
          <h3>多智能体协作</h3>
          <p>协调角色拆解目标，专家并行分析，质检 Agent 把关。</p>
          <img src="https://www.lumehub.duoyu.link/resource/aivra/original/9e582681c124_20260806.png" alt="多智能体协作" />
        </article>
        <div className="bento-group">
          <article className="bento-card bento-dark">
            <h3>自定义模型接入</h3>
            <p>任意 OpenAI-compatible 模型，密钥仅本机加密保存。</p>
            <img src="https://www.lumehub.duoyu.link/resource/aivra/original/2bb489720139_20260806.png" alt="模型接入配置" />
          </article>
          <article className="bento-card bento-green">
            <h3>对话即任务</h3>
            <p>对话中讨论思路，任务中执行工作，可随时停止与回溯。</p>
            <img src="https://www.lumehub.duoyu.link/resource/aivra/original/6acbdba989f8_20260806.png" alt="对话任务交互" />
          </article>
          <article className="bento-card bento-blue bento-wide">
            <h3>混合检索增强</h3>
            <p>工作区文件增量索引，向量召回融合本地 FTS5，引用附带路径与行号。</p>
            <img src="https://www.lumehub.duoyu.link/resource/aivra/original/8996e2824b67_20260806.png" alt="混合检索增强" />
          </article>
        </div>
      </div>
    </section>

    <section className="intro" id="product">
      <h2>让角色、知识和流程<br />在同一个项目里协作。</h2>
      <p>为项目选择合适的角色，连接专属知识库，并用可编辑步骤组织执行过程。WorkBee 让每次对话都承接已有背景，并自然延展为下一步行动。</p>
    </section>

    <section className="relation-section product-relation" id="relations"><div className="relation-copy"><h3>角色不是孤立的聊天对象。</h3><p>任务模式下，协调角色拆解目标并调度最多三名专家并行分析，独立质检 Agent 核查结果后再汇总交付；每一步都受工作区授权与审批机制保护。</p></div><NetworkGraph /></section>

    <section className="feature-grid" id="features">
      <article className="feature-card feature-large">
        <div className="card-copy"><h3>从想法到行动，<br />不必离开同一个上下文。</h3><p>使用“对话”快速讨论、补充信息和探索思路；切换到“任务”后，让选定角色按权限与步骤执行具体工作。</p></div>
        <div className="mode-demo"><div className="mode-tabs"><span className="active">对话</span><span>任务</span></div><div className="mode-input"><p>分析这些候选人简历，并找出与岗位最匹配的人选。</p><div><span>＋ 选择文件</span><span>◎ 选择角色</span><b>发送</b></div></div><div className="mode-note"><i>对话</i><span>适合询问、讨论和补充上下文</span><i>任务</i><span>适合调用角色能力并执行工作</span></div></div>
      </article>
      <article className="feature-card workflow-card">
        <div className="card-copy"><h3>把一次对话，<br />组织成可编辑的流程。</h3><p>添加、删除、选择或拖动步骤，并为每一步分别绑定角色、技能与知识库。需求分析可以交给 BeeYo，资料研究由 Lexo 读取项目知识库，后续步骤再调用不同成员继续执行。</p></div>
        <div className="workflow-demo"><div className="workflow-title"><span>当前工作流</span><b>可拖动排序</b></div><div className="workflow-steps">{["需求","设计","实现","测试","行动"].map((step,i)=><div className={i===2?"active":""} key={step}><i>⠿</i><span>{step}</span><b>×</b></div>)}<button>＋ 添加步骤</button></div><div className="step-bindings"><span><b>BeeYo</b> 需求分析</span><span><b>Lexo</b> 项目知识库</span><span><b>Codeo</b> 代码实现</span></div><p>每个步骤都可以拥有独立的角色、技能与知识来源</p></div>
      </article>
    </section>

    <section className="team-section" id="team">
      <div className="team-copy"><h2>角色由你定义，团队按需生长。</h2><p>从职责、描述、技能到专属知识库，每个角色都可自由创建和调整。先用默认角色开始，再把团队塑造成你的工作方法。</p></div>
      <div className="agent-marquee"><div className="agent-track">{[...agents,...agents,...agents].map((agent, i) => <article key={`${agent.name}-${i}`} aria-hidden={i>=agents.length}><div className="agent-card-inner"><div className="agent-front"><span className="agent-speech">{agent.role}</span><img src={agent.image} alt={i<agents.length ? `${agent.name} 头像` : ""} /><h3>{agent.name}</h3><p>{agent.role}</p></div><div className="agent-back"><small>{agent.role}</small><h3>{agent.name}</h3><p>{agent.desc}</p><strong>技能</strong><div className="agent-tags">{agent.skills.map(x=><span key={x}>{x}</span>)}</div><strong>知识库</strong><div className="agent-tags">{agent.knowledge.map(x=><span key={x}>{x}</span>)}</div></div></div></article>)}</div></div>
    </section>

    <section className="download" id="download">
      <div className="download-buttons">
        <a href={downloadUrl}><img className="download-icon" src="/icon/apple.png" alt="" /><div><small>下载适用于</small><strong>macOS</strong><span>Apple 芯片 · macOS 12+</span></div></a>
        <a href={downloadUrl}><img className="download-icon" src="/icon/windows.png" alt="" /><div><small>下载适用于</small><strong>Windows</strong><span>64 位 · Windows 10+</span></div></a>
        <small>当前版本 0.1.0</small>
      </div>
    </section>

    <footer><div className="footer-brand"><a className="logo" href="#top">WorkBee</a><p>组建团队，连接知识，推进任务。</p><small>© 2026 WorkBee. All Rights Reserved.<br />本地优先的桌面 AI 工作空间。</small></div><div><strong>产品</strong><a href="#product">产品概览</a><a href="#features">核心能力</a><a href="#models">模型接入</a><a href="#download">下载</a></div><div><strong>功能</strong><a href="#team">数字团队</a><a href="#relations">协作关系</a><a href="#features">知识与流程</a></div><div><strong>关于</strong><a href={downloadUrl}>GitHub</a><a href="#download">桌面端</a><a href="#top">返回顶部</a></div><span className="footer-legal">© 2026 WorkBee</span></footer>
  </main>;
}
