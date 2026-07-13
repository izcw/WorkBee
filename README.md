# Aivra

> 本地优先的桌面 AI Agent 工作空间

Aivra 在用户电脑上运行 Python Agent，直接连接用户选择的模型服务，读取或修改授权工作区，并通过 Electron 界面展示流式过程、工具审批和结果。云端账号、设备、市场和订阅暂不在本阶段实现。

## 当前可用能力

- Electron + React 桌面工作台，支持选择本地工作区、对话/任务模式、停止任务和历史查看。
- Electron Main 以 JSON Lines over stdin/stdout 启动和管理随包 Python Agent，包含握手、健康状态、限流重启和优雅退出。
- Python 3.12 + LangChain + LangGraph 单 Agent，默认使用 DeepSeek OpenAI-compatible API：
  - `model`: `deepseek-v4-flash`
  - `base_url`: `https://api.deepseek.com`
- SQLite 本地保存工作区引用、Thread、Message、Run、Approval 和 checkpoint；Python Agent 是唯一写入者。
- 只读工具：列目录、读 UTF-8 文件、Git status。
- 高风险工具：写文件、沙箱命令；每次执行前在界面请求批准。macOS 命令工具使用 Seatbelt 禁止网络和工作区外文件访问。
- 工作区真实路径检查、符号链接逃逸防护、输入/输出上限、命令超时和敏感日志脱敏。
- 默认角色为 Aivra；模型在头像菜单的“设置 → 模型”中统一增删改查，对话框和团队角色只能引用已添加模型。
- 模型 Key 保存后仅显示掩码，并支持 OpenAI-compatible 连接测试；对话可以多选角色，由各角色模型分析后交给主角色汇总。
- API Key 由 Electron `safeStorage` 按模型加密保存在应用用户数据目录，不进入源码、项目、SQLite、协议消息或日志。
- Python Agent 使用 PyInstaller `onedir`，并作为 Electron Builder `extraResources` 随应用打包。

命令工具不经过 Shell 解析；macOS 使用操作系统 Seatbelt 沙箱且不提供不安全回退，Windows/Linux 在对应沙箱实现前拒绝命令执行。模型请求会把完成任务所需的上下文发送给当前角色配置的模型服务商。

## 目录

```text
Aivra/
├── apps/
│   ├── desktop/
│   │   ├── src/                    # React Renderer
│   │   ├── electron/               # Main、Preload、Agent 进程与密钥边界
│   │   └── agent/
│   │       ├── aivra_agent/
│   │       │   ├── runtime/        # JSONL 生命周期与协议收发
│   │       │   ├── graphs/         # LangGraph 单 Agent 工作流
│   │       │   ├── tools/          # 受工作区限制的文件与 Git Tool Registry
│   │       │   └── storage/        # SQLite migration/repository
│   │       └── tests/
│   ├── server/                     # 云端边界说明，后续实现
│   └── website/                    # 独立官网
├── packages/protocol/              # v1 JSON Schema、类型和协议测试
├── docs/adr/                        # 架构决策记录
├── AGENT.md
└── README.md
```

## 开发

要求 Node.js `>=22.13`、npm、Python 3.12（最低 3.11）。

```bash
cd apps/desktop
npm ci
npm run agent:setup
npm run desktop:dev
```

应用启动后点击左下角头像，在“设置 → 模型”中录入 DeepSeek API Key。开发或 CI 也可以通过 `AIVRA_DEEPSEEK_API_KEY` 环境变量临时提供；不要把真实 Key 写入 `.env` 或提交到 Git。

## 验证与打包

```bash
cd apps/desktop
npm test              # 协议 + Python Agent 测试
npm run build         # TypeScript + Renderer 生产构建
npm run agent:build   # PyInstaller onedir
npm run desktop:pack  # 当前平台未安装应用目录
npm run desktop:dist  # 当前平台安装包
```

macOS ARM64 的本地构建结果位于 `apps/desktop/release/`。未签名开发包可用于本机验证；正式分发仍需 Apple 签名、公证以及 Windows/Linux 对应平台构建。

官网仍可独立构建：

```bash
cd apps/website
npm ci
npm run build
```

## 本阶段验收路径

```text
启动应用 → Agent ready → 保存模型 Key → 选择工作区 → 发送任务
→ 模型读取文件 → 写入请求审批 → 用户批准/拒绝
→ 完成或取消 → 重启应用并重新选择工作区 → 查看历史记录
```

后续工作包括云端 Server、账号/设备、市场与订阅、Windows/Linux 命令沙箱、本地知识库、签名/自动更新，以及在单 Agent 闭环稳定后的多 Agent。

详细安全和架构约束见 [AGENT.md](./AGENT.md)，凭证交接决策见 [ADR 0001](./docs/adr/0001-local-agent-protocol.md)。
