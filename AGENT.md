# Aivra Agent Development Guide

本文件定义 Aivra 的目标架构、工程边界和 AI 编码代理的工作规则。修改代码前必须先核验仓库现状，不得把目标设计当成已实现功能。

## 1. 如何使用本文件

信息冲突时按以下顺序判断：

1. 用户当前明确提出的需求；
2. 实际源码、配置、锁文件和测试结果（判断“现在有什么”）；
3. 本文件中的架构边界（判断“应该如何实现”）；
4. 根 `README.md` 与子项目 README。

本文件是架构约束，不替代代码事实。任何涉及依赖版本、命令、目录或完成状态的判断，都要先查看对应 `package.json`、`pyproject.toml` 和文件树。

文档中的用词：

- **必须 / 禁止**：不可绕过的安全或架构边界；
- **应**：默认方案，偏离时需说明理由并补充决策记录；
- **目标**：尚未承诺已经实现。

## 2. 产品定位与原则

Aivra 是本地优先的桌面 AI 智能体工作空间。用户在 Electron 应用中选择本地工作区，由随应用安装的 Python Agent 调用模型、读取或修改项目文件、执行 Git/Shell 工具，并通过 React 界面查看过程、审批和结果。

核心原则：

1. 本地执行：Agent 工作流和工作区工具在用户电脑运行。
2. 最小权限：Renderer、Preload、Main、Agent 和 Server 权限逐层收敛。
3. 明确审批：高风险或不可逆副作用必须在执行前由用户确认。
4. 可恢复：任务、checkpoint、审批与工具结果可以在应用重启后恢复。
5. 协议优先：跨进程消息先定义 Schema，再分别实现 TypeScript/Python 类型。
6. 云端克制：Aivra Server 提供平台能力，不接管本地 Agent 执行。

## 3. 仓库当前状态

开始任务前仍需重新检查；以下是当前基线：

| 路径 | 状态 | 已实现 | 未实现 |
|---|---|---|---|
| `apps/desktop/` | 首个可用闭环 | React Agent 工作台、Electron Agent 进程管理/业务 IPC/安全存储、Python LangGraph Agent、SQLite、受工作区限制的文件/Git 工具、macOS Seatbelt 命令沙箱与审批、模型 CRUD/角色模型绑定、PyInstaller/Electron Builder | 知识库、Windows/Linux 命令沙箱、签名/自动更新、多 Agent |
| `apps/website/` | 官网原型 | vinext/Vite 页面、Cloudflare Worker/Sites 配置、生产构建 | 正式下载地址、Aivra Server 集成；现有 lint/test 尚未全绿 |
| `apps/server/` | 边界占位 | README 说明 | Fastify Server、账号、市场和订阅全部能力 |
| `packages/protocol/` | v1 最小协议 | Envelope/消息目录 JSON Schema、TS 类型、协议测试 | 细化每种 payload Schema、自动类型生成和更完整兼容 fixtures |

注意：

- `apps/desktop/electron/preload.cjs` 暴露白名单化的窗口、Agent、工作区、运行、审批与设置 API；没有暴露通用 IPC、文件或 Shell 能力。
- `apps/desktop/src/pages/ChatPage.tsx` 已连接真实本地业务链路；团队、市场和文档页面仍包含演示/固定数据，不代表云端能力已经存在。
- `apps/website/db/` 是可选 D1 脚手架，当前 hosting 配置未绑定 D1；它不是目标云端 PostgreSQL 服务。
- 官网生产构建当前可通过，但已有 lint 错误，且 `tests/rendered-html.test.mjs` 仍依赖缺失的 starter preview 文件；不能把“存在测试脚本”写成“测试已通过”。
- `apps/desktop/release/`、`apps/desktop/dist/`、`apps/desktop/agent/dist/`、`apps/website/dist/` 和依赖目录是生成物，不是架构模块。

## 4. 已确定与未确定

### 已确定的架构决策

除非用户明确要求重新设计，否则保持以下决策：

1. 桌面端：Electron + React + TypeScript + Vite。
2. 本地 Agent：Python 3.12 + LangChain + LangGraph。
3. 本地业务数据：SQLite，由 Python Agent 单写入者管理。
4. 云端服务：Node.js + TypeScript + Fastify + PostgreSQL。
5. 模型请求由本地 Agent 直连模型服务，不经过 Aivra Server。
6. Electron Main 与 Python Agent 使用 JSON Lines over stdin/stdout，不启动 localhost API。
7. Python Agent 使用 PyInstaller `onedir` 打包，并随 Electron 安装。
8. Renderer 不直接访问 Node.js、Python、SQLite、文件系统、Shell 或密钥。
9. 项目文件、任务记录、知识库和模型密钥默认不上传 Aivra 云端。
10. 第一阶段只实现单 Agent；多 Agent 在单 Agent 闭环稳定后再加入。

### 仍需决策或验证

不要在无需求支撑时把下列事项写死：

- monorepo workspace 工具及迁移批次；
- 协议的完整消息目录、错误码、背压与兼容窗口；
- SQLite Schema、migration 工具与向量检索实现；
- 模型服务商抽象、Token 统计和费用策略；
- 登录协议、设备授权、自动更新与发布签名流程；
- Skill/Plugin 格式、签名、分发与隔离模型；
- Shell 的 OS 级沙箱方案；
- 日志、遥测、崩溃报告是否以及如何由用户选择上传。

需要固定其中一项时，应增加 ADR 或等价决策文档，记录背景、方案、取舍与迁移影响。

## 5. 目标组件与职责

### React Renderer

负责页面、交互、流式状态展示、审批界面和产物预览；只通过 Preload 暴露的类型化业务 API 与桌面能力交互。

禁止：

- 直接使用 Node.js API 或任意 IPC 通道；
- 直接启动 Python、访问 SQLite 或读写工作区；
- 直接执行 Shell/Git；
- 在 `localStorage`、源码或日志中保存长期凭证。

### Electron Preload

负责最小化的 `contextBridge` API。每个方法必须具有明确业务语义、参数校验和稳定返回类型。

禁止暴露通用的 `exec`、`send(channel, payload)`、`readFile(path)` 或原始 `ipcRenderer`。

### Electron Main

负责：

- 窗口、托盘、深链和应用生命周期；
- 启动、监控、重启和关闭 Python Agent；
- Renderer 与 Agent 之间的协议转发；
- 原生工作区选择和系统级权限；
- 通过操作系统安全存储保存 API Key 与登录凭证；
- 经过约束的外部 URL 打开与云端认证请求。

Main 不实现 Prompt、Tool 或 Agent 工作流，不直接写业务 SQLite。

### Python Agent

负责：

- 模型适配、Prompt、LangGraph 工作流与 checkpoint；
- 文件、Git、Shell、知识库等本地工具；
- SQLite migration、repository 和业务数据；
- 流式事件、审批中断、取消、恢复与错误报告；
- Skill/Plugin 的本地加载与执行。

Agent 只能接受 Main 建立的会话，并且只能操作用户授权范围。权限验证必须在 Tool 层执行，不能只依赖 Prompt。

### Aivra Server

负责账号、设备、市场、发布、签名元数据、订阅、订单和用户主动开启的设置同步。

禁止：

- 保存模型 API Key；
- 默认保存项目正文、知识库原文、任务日志或 Prompt；
- 代理模型请求或提供本地任务执行能力；
- 假设可以直接访问用户电脑。

### Website

只负责品牌、产品介绍、文档入口和可信下载入口。不得引用桌面端内部模块，也不得承载 Agent 或 Server 领域逻辑。

## 6. 目标目录

```text
Aivra/
├── apps/
│   ├── desktop/
│   │   ├── src/                    # React Renderer
│   │   ├── electron/
│   │   │   ├── main.ts             # Electron Main
│   │   │   └── preload.ts          # 安全桥接
│   │   ├── agent/
│   │   │   ├── aivra_agent/
│   │   │   │   ├── runtime/        # 生命周期与协议收发
│   │   │   │   ├── graphs/         # LangGraph 工作流
│   │   │   │   ├── tools/          # 文件、Git、Shell
│   │   │   │   ├── knowledge/      # 文档与检索
│   │   │   │   └── storage/        # SQLite repositories
│   │   │   ├── tests/
│   │   │   └── pyproject.toml
│   │   └── package.json
│   ├── server/
│   │   ├── src/
│   │   │   ├── auth/
│   │   │   ├── devices/
│   │   │   ├── marketplace/
│   │   │   ├── billing/
│   │   │   └── app.ts
│   │   └── package.json
│   └── website/
├── packages/
│   └── protocol/
│       ├── schemas/                 # 版本化 JSON Schema
│       ├── generated/               # 生成的 TS/Python 类型（如采用）
│       └── tests/                   # 双端兼容性 fixtures
├── docs/
│   └── adr/                         # 架构决策记录
├── README.md
└── AGENT.md
```

从现有目录迁移时必须拆成可审查的小步骤，并保持桌面端与官网在每一步都可独立构建。不要为了匹配目标树一次性移动全部代码。

## 7. 进程与信任边界

```text
React Renderer (不可信页面层)
    ↕ contextBridge：白名单业务方法
Electron Preload
    ↕ typed IPC：参数与返回值校验
Electron Main (桌面权限与凭证边界)
    ↕ JSON Lines：stdin/stdout
Python Agent (业务与工具边界)
    ↕
SQLite / 授权工作区 / 模型服务
```

启动流程：

1. Main 定位开发入口或打包后的 Agent 可执行文件。
2. Main 创建随机会话凭证并启动子进程。
3. 双方完成协议版本与 capability 握手。
4. Agent 打开 SQLite、执行 migration 并检查可恢复任务。
5. Agent 发送 `runtime.ready`，Main 才开放 Agent 相关 UI。
6. Renderer 订阅 runtime、run 和 approval 状态。

退出流程：

1. Main 停止接收新的运行请求并发送 `runtime.shutdown`。
2. Agent 取消模型流、完成可安全提交的写入并保存 checkpoint。
3. Agent 关闭 SQLite，返回 shutdown 结果后退出。
4. Main 在明确超时后才强制终止，并记录非正常退出状态供下次恢复。

崩溃重启必须限流，避免无限重启循环；正在执行且结果未知的副作用不得自动重放。

## 8. 通信协议

协议的唯一来源应是 `packages/protocol/schemas/` 中版本化的 JSON Schema。TypeScript 和 Python 类型应生成或通过共享 fixtures 验证，禁止两端各自维护易漂移的结构。

每行 stdout 只能包含一个 UTF-8 JSON 对象，例如：

```json
{
  "protocolVersion": 1,
  "id": "01J...",
  "kind": "request",
  "type": "run.create",
  "timestamp": "2026-07-14T00:00:00Z",
  "payload": {}
}
```

最小 envelope 应明确：

- `protocolVersion`：协议主版本；
- `id`：消息 ID；
- `kind`：`request`、`response` 或 `event`；
- `type`：稳定消息类型；
- `timestamp`：UTC ISO 8601；
- `payload`：由具体 Schema 校验的数据；
- 关联字段：请求响应、run、step 和 sequence 的关联方式；
- 错误结构：稳定 `code`、安全 `message`、可选可重试信息。

协议约束：

- stdout 仅输出协议消息，日志写 stderr；
- Main 和 Agent 两端都校验所有输入；
- 未知主版本、消息类型或非法 payload 返回明确错误；
- 长任务使用事件流，必须支持显式取消；
- 流式事件定义顺序、终止语义和丢失后的恢复方式；
- 规定单行大小上限、队列上限与背压策略；
- 大文件只传授权工作区内的受控引用，不通过 IPC 搬运正文；
- 不在协议、日志或错误对象中回显密钥。

首批消息建议控制在最小闭环：

```text
runtime.hello / runtime.ready / runtime.health / runtime.shutdown
workspace.select / workspace.selected
run.create / run.created / run.cancel
run.started / model.delta / run.completed / run.failed
tool.requested / approval.required / approval.resolve / tool.completed
```

消息名称在 Schema 落地前仍是设计建议；一旦发布则按版本兼容规则演进。

## 9. Agent 执行模型

### 对话模式

用于问答、分析和方案讨论。默认只允许模型与只读工具；任何写入或外部副作用都必须显式切换到任务执行语义并经过权限判断。

### 任务模式

用于修改代码、运行命令和多步骤工作。每个任务映射到一个 LangGraph thread，并把 checkpoint 保存到 SQLite。

```text
理解目标 → 收集上下文 → 规划步骤 → 调用模型/工具
→ 必要时 interrupt 等待审批 → 验证结果 → 保存产物与总结
```

单 Agent 必须先满足流式输出、工具审批、取消、崩溃恢复和端到端测试。多 Agent 后续由有界的 Team Leader 分解任务，必须限制深度、并发、预算和总运行时间，禁止递归无限委派。

## 10. 数据与凭证

### 本地 SQLite

计划保存 Workspace 配置引用、Thread、Message、Run、Step、checkpoint、事件、Tool Call、Approval、Knowledge metadata、索引和 Artifact metadata。

SQLite 由 Python Agent 单写入者管理。Renderer 和 Electron Main 通过协议读取业务数据，避免多进程直接访问。Schema 变更必须使用 migration，并测试旧版本升级与失败回滚/恢复。

### 操作系统安全存储

模型 API Key 和 Refresh Token 由 Electron Main 使用系统安全能力保护。只在发起模型会话所需的最短时间内把解密值传入 Agent 内存；禁止写入 SQLite、项目文件、事件、命令行参数或日志。

是否将密钥通过现有协议传给 Agent、使用额外匿名管道或 provider-scoped session token，需要在实现前做威胁建模。不得把明文密钥混入普通可持久化消息。

### 云端 PostgreSQL

仅保存账号、设备、会话、市场、发布、订阅和订单等平台数据。同步功能必须逐项 opt-in、可撤销，并说明上传字段与保留周期。

### 隐私表述

“本地优先”与“默认不上传 Aivra 云端”不能表述为“数据永不离开设备”。模型请求会把必要上下文发送到用户选择的模型服务商；外部 Tool/Plugin 也可能外发数据，必须在权限说明和审批中明确目的地。

## 11. 工具与安全

文件、Git、Shell 和外部集成必须通过统一 Tool Registry；Agent 工作流代码不得绕过 Registry 直接产生副作用。

每个 Tool 必须声明：

- 输入/输出 Schema；
- 所需能力与风险等级；
- 工作区和路径约束；
- 是否联网、外发到哪里；
- 是否需要审批；
- 超时、取消和输出大小上限；
- 幂等性与崩溃后恢复策略；
- 可脱敏的审计摘要。

文件工具必须使用真实路径规范化并防止 `..`、绝对路径和符号链接逃逸。审批至少覆盖删除/覆盖、高风险命令、工作区外访问、Git push、凭证使用和外部写入。

重要限制：把 Shell 的当前目录设为工作区并不能阻止命令访问其他路径或网络；Python 子进程也不是 OS 沙箱。在可靠沙箱落地前，只能把命令审批、环境变量最小化、超时与审计视为风险缓解，不能宣称已经完成强隔离。不可信 Plugin 同样不能仅靠 Prompt 或路径字符串检查获得安全保证。

## 12. 打包与发布

开发环境运行 Python 模块；发布环境使用 PyInstaller `onedir`，再由 Electron Builder 作为额外资源打包。

必须验证：

- macOS、Windows、Linux 分平台和 CPU 架构构建；
- Main 通过 `process.resourcesPath` 定位 Agent；
- Python 解释器、动态库、模型适配依赖和资源文件齐全；
- Agent 版本与协议版本可独立报告；
- 安装、升级、降级失败和数据 migration 行为；
- 代码签名、公证、更新包签名与下载来源校验；
- 打包后路径、空格、Unicode、只读安装目录和用户数据目录。

在 `onedir` 稳定前不优先改用启动更慢且排错更困难的 `onefile`。

## 13. 工程与测试约定

- TypeScript 和 Python 使用严格类型与边界校验。
- 跨进程数据必须可 JSON 序列化。
- 时间统一为 UTC ISO 8601；ID 使用可离线生成且确定实现可用的 UUIDv7 或 ULID。
- 领域错误使用稳定错误码，业务逻辑不匹配错误文本。
- 日志默认脱敏并区分用户可见错误与诊断信息。
- UI 组件不实现 Agent、权限或数据库逻辑。
- Website 不引入桌面端业务依赖。
- 新增工具必须同时提供权限声明、拒绝路径和测试。

测试优先级：

1. JSON Schema fixtures 与 TS/Python 协议兼容性；
2. Agent 启动、握手、心跳、关闭、崩溃与限流重启；
3. LangGraph checkpoint、interrupt、取消和恢复；
4. 路径逃逸、符号链接、权限拒绝和敏感信息脱敏；
5. 工具超时、幂等性及未知结果不重放；
6. SQLite migration、并发、损坏与备份恢复；
7. 模型流、背压、断线、取消和 provider 错误；
8. PyInstaller/Electron 打包后的跨平台端到端流程。

## 14. 实施顺序与验收

按最小闭环推进：

1. 创建协议包，完成 hello/ready、run 和 error 的 Schema 与双端 fixtures。
2. 创建 Python runtime，并能从终端完成握手与优雅退出。
3. Electron Main 启动 Agent，处理心跳、崩溃和双向消息。
4. Renderer 发送消息并展示真实的模拟流。
5. 接入一个 OpenAI-compatible provider，完成单 Agent 对话。
6. 建立 SQLite migration 与 LangGraph checkpoint。
7. 实现只读文件工具和路径逃逸测试。
8. 实现需要审批的文件写入，验证取消与恢复。
9. 完成安装包中的 Agent 定位和第一条端到端链路。
10. 再增加 Git、Shell、知识库、Server 和多 Agent。

第一条验收链路：

```text
启动应用 → Agent ready → 选择工作区 → 发送任务
→ 模型请求读取文件 → 返回内容 → 请求修改文件
→ 用户审批 → 修改成功 → 重启应用 → 完整任务记录可恢复
```

每一步的“完成”至少包括：代码可构建、关键测试通过、错误路径可见、文档与实际命令同步；只有界面或类型占位不算功能完成。

## 15. 修改前后检查清单

修改前：

1. 需求属于 Renderer、Preload、Main、Agent、Server 还是 Website？
2. 当前能力真的存在，还是只写在目标文档里？
3. 是否跨越数据、凭证或权限边界？
4. 是否需要先改协议 Schema 或数据库 migration？
5. 是否引入副作用、联网、审批、取消或恢复问题？
6. 是否影响跨平台路径、PyInstaller 或 Electron 打包？

修改后：

1. 运行与改动范围相称的类型检查、测试和构建。
2. 验证失败、拒绝、取消和重启路径，而不只验证成功路径。
3. 确认日志、错误和 fixtures 不包含密钥或用户正文。
4. 同步根 README、子项目 README、协议和 migration 说明。
5. 明确区分已完成、部分完成和后续计划。
