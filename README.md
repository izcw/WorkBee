# Aivra

> 本地优先的桌面 AI Agent 工作空间

Aivra 在本机运行 Python Agent，通过 Electron 桌面界面协助你完成开发、设计、研究、办公和内容工作。你选择工作区与模型服务；Agent 仅在授权范围内读取或修改文件，高风险操作会先请求审批。

## 功能概览

- **本地工作空间**：选择本地目录后，在对话或任务模式中处理项目；支持停止任务与查看历史记录。
- **可配置模型**：在“设置 → 模型”中添加、编辑、删除并测试 OpenAI-compatible 模型连接。模型密钥仅在本机加密保存，界面只显示掩码。
- **多角色协作**：内置 Aivra（统筹）、Nova（工程）、Mira（产品设计）、Sage（研究文档）与 Lyra（运营内容）五个角色；可创建、编辑或删除自定义角色，并为其分配已配置模型。
- **上下文选择**：输入 `@` 可选择插件、技能或内置知识文档，将需要的上下文加入当前任务。
- **工具审批**：支持受限的目录浏览、UTF-8 文件读取和 Git 状态查看；写文件与命令执行等高风险工具必须经过界面审批。
- **本地状态与安全边界**：工作区引用、线程、消息、运行记录、审批和 checkpoint 存在 SQLite 中；Python Agent 是唯一写入者。应用会校验真实路径、防止符号链接逃逸，并限制输入、输出与命令执行时间。

模型请求会将完成当前任务所需的上下文发送给所选角色配置的模型服务商。请勿在任务中提供不必要的敏感信息。

## 安全说明

- API Key 由 Electron `safeStorage` 加密保存在应用用户数据目录，不写入源码、项目目录、SQLite、协议消息或日志。
- 命令不经过 Shell 解析。macOS 使用 Seatbelt 沙箱禁止网络及工作区外的文件访问；在 Windows/Linux 具备对应沙箱实现前，命令执行会被拒绝。
- Agent 的文件操作受所选工作区约束；涉及写入或命令的操作会在执行前请求批准。

## 项目结构

```text
Aivra/
├── apps/
│   ├── desktop/
│   │   ├── src/                    # React 渲染进程
│   │   ├── electron/               # Main、Preload、Agent 进程与密钥边界
│   │   └── agent/
│   │       ├── aivra_agent/
│   │       │   ├── runtime/        # JSONL 生命周期与协议收发
│   │       │   ├── graphs/         # LangGraph Agent 工作流
│   │       │   ├── tools/          # 受工作区限制的文件与 Git 工具
│   │       │   └── storage/        # SQLite migration / repository
│   │       └── tests/
│   ├── server/                     # 云端边界说明，后续实现
│   └── website/                    # 独立官网
├── packages/protocol/              # v1 JSON Schema、类型与协议测试
├── docs/adr/                       # 架构决策记录
├── AGENT.md                        # 安全与架构约束
└── README.md
```

## 开发环境

需要 Node.js `>=22.13`、npm 与 Python `>=3.11`（推荐 3.12）。

```bash
cd apps/desktop
npm ci
npm run agent:setup
npm run desktop:dev
```

首次启动后，在左下角头像菜单中进入“设置 → 模型”，添加并测试模型连接，再选择工作区开始任务。开发或 CI 可通过 `AIVRA_DEEPSEEK_API_KEY` 临时提供默认 DeepSeek 模型的密钥；不要将真实 Key 写进 `.env` 或提交到 Git。

## 验证与打包

```bash
cd apps/desktop
npm test              # 桌面端、协议与 Python Agent 测试
npm run desktop:dist  # 当前平台发布包
```

`desktop:dist` 会先执行 TypeScript/Renderer 构建和 PyInstaller `onedir` Agent 构建，再生成当前平台的发布包；无需额外执行 `build` 或 `agent:build`。Windows 会生成安装程序和免安装 ZIP，产物位于 `apps/desktop/release/`。`desktop:pack` 仅用于本地检查未安装应用目录。正式分发仍需要完成相应平台的签名、公证与发布配置。

官网可独立构建：

```bash
cd apps/website
npm ci
npm run build
```

## 推荐体验路径

```text
启动应用 → 配置并测试模型 → 选择工作区 → 选择角色与审批模式 → 发送任务
→ 按需使用 @ 添加插件、技能或知识文档 → Agent 读取文件
→ 写入或命令操作请求审批 → 批准/拒绝 → 查看结果与历史记录
```

## 路线图

当前版本聚焦本地单 Agent 闭环。后续方向包括云端 Server、账号与设备、市场和订阅、Windows/Linux 命令沙箱、本地知识库、签名与自动更新，以及在核心流程稳定后的多 Agent 协作。

详细安全与架构约束见 [AGENT.md](./AGENT.md)，凭证交接决策见 [ADR 0001](./docs/adr/0001-local-agent-protocol.md)。
