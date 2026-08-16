# WorkBee

> 本地优先的桌面 AI Agent 工作空间。

WorkBee 将 Electron 桌面端与本机 Python Agent 组合在一起，用于在用户授权的工作区中完成开发、研究、设计、办公与内容任务。用户自行配置模型服务和本地目录；Agent 的文件、Git 与命令操作均受工作区边界和审批机制约束。

## 适用场景

- 在一个本地项目中分析代码、整理资料、生成文档或执行多步骤任务。
- 为不同角色配置 OpenAI-compatible 模型，并按任务选择协作角色。
- 让 Agent 检索已授权工作区中的文本和源码，再基于结果继续工作。
- 连接 GitHub 或兼容 Streamable HTTP 的 MCP 服务，并在执行高风险操作前保留用户确认。

## 产品特点

| 特点 | 说明 |
|---|---|
| 本地优先 | 从选择工作区到任务记录，核心流程围绕本机文件与数据展开。 |
| 任务可控 | 对话、任务、角色选择与审批模式彼此配合，让自动化保持在用户可见、可干预的范围内。 |
| 多角色协作 | 统筹角色可结合不同专长完成分析、执行与结果检查，适应复杂的多步骤工作。 |
| 贴近上下文 | 将工作区中的资料、源码与用户主动加入的知识内容作为任务上下文，减少重复说明。 |
| 开放扩展 | 支持 OpenAI-compatible 模型与 MCP 服务，可按个人工作流连接模型、工具和知识来源。 |
| 安全分层 | 凭证、文件、命令与外部调用分层管理；高风险操作由用户在执行前确认。 |

模型请求会把完成任务所需的上下文发送给用户选择的模型服务商；外部 MCP 也可能将数据发送至其服务端。请勿提供不必要的敏感信息。

## 架构概览

```text
React Renderer
    │  仅调用白名单业务 API
Electron Preload
    │  参数校验后的 IPC
Electron Main
    │  JSON Lines（stdin / stdout）
Python Agent
    ├── SQLite、知识索引与 LangGraph 工作流
    ├── 工作区文件、Git 与命令工具
    └── 用户配置的模型与 MCP 服务
```

Renderer 不直接访问 Node.js、文件系统、Shell、SQLite 或密钥。Python Agent 是本地业务数据的单写入者。

## 快速开始

前置条件：Node.js `>=22.13`、npm 与 Python `>=3.11`（推荐 Python 3.12）。完成桌面端依赖安装和 Agent 环境准备后，使用下方的开发启动命令运行应用。

启动后依次：进入“设置 → 模型”添加并测试模型连接，选择本地工作区，选择角色和审批模式，再发送任务。

开发或 CI 可用 `WORKBEE_DEEPSEEK_API_KEY` 临时提供默认模型密钥。不要将真实密钥写入 `.env`、源码或提交记录。

## 开发

启动桌面端开发环境：

```bash
cd apps/desktop
npm run desktop:dev
```

首次运行前，按对应子项目的依赖说明完成安装与 Agent 环境准备。

## 生产打包

### 桌面软件

```bash
cd apps/desktop
npm run desktop:dist
```

桌面安装包与发布产物生成在 `apps/desktop/release/`。

### 官网

```bash
cd apps/website
npm run build
```

官网生产静态文件由此命令生成。正式对外分发前仍应完成目标平台签名、公证、安装验证和下载渠道配置。

## 安全边界

- API Key 与 MCP Token 由 Electron 系统安全存储保护，不写入项目目录、SQLite、协议消息或日志。
- Agent 只能在用户选择的工作区内处理文件；写文件和命令执行需在界面中获得批准。
- macOS 命令经 Seatbelt 限制网络和工作区外访问；Windows/Linux 的等价命令沙箱尚未实现，因此命令执行会被拒绝。
- “本地优先”不等于数据永不离开设备：模型和外部 MCP 服务会接收完成请求所需的数据。

## 仓库结构

```text
WorkBee/
├── apps/
│   ├── desktop/
│   │   ├── src/                  # React Renderer
│   │   ├── electron/             # Main、Preload、凭证与 Agent 进程管理
│   │   └── agent/
│   │       ├── workbee_agent/    # Python runtime、工具、知识库与 SQLite
│   │       ├── tests/
│   │       └── pyproject.toml
│   └── website/                  # 独立官网
├── packages/protocol/            # v1 Schema、TS 类型与协议测试
├── AGENT.md                      # 维护与安全约束
└── README.md
```

`apps/desktop/dist/`、`apps/desktop/release/`、`apps/desktop/agent/{build,dist}/` 和依赖目录均为生成物，不作为源代码修改。

## 后续方向

当前版本不依赖 WorkBee 云端 Server。后续工作包括本地 Embedding、跨编码器重排、Windows/Linux 命令沙箱、签名/公证与自动更新；这些事项不应被表述为已交付能力。

开发与修改边界见 [AGENT.md](./AGENT.md)。
