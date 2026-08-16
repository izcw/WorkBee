# WorkBee Desktop

Electron + React + TypeScript 桌面端，以及随应用安装的 Python 3.12 Agent。

## 首次启动

```bash
npm ci
npm run agent:setup
npm run desktop:dev
```

进入 `#/chat` 后：

1. 点击左下角头像，在“设置 → 模型”中添加或编辑模型；API Key 会进入系统安全存储，不会写入仓库。
   保存后界面只显示 Key 的前后缀与星号；“测试连接”会以最小 OpenAI-compatible 请求验证 Base URL、模型和 Key。
2. 在对话输入框上方选择当前文件夹。Agent 的文件工具会拒绝绝对路径、`..` 和符号链接逃逸。
3. 默认选中 BeeYo 角色；角色头像显示在“选择角色”右侧。对话框和团队页只能选择模型库中已经添加的模型。
   对话模式会从候选角色中选择一名回答者；任务模式由协调角色选择最多三个专家并行执行只读分析，再统一执行工具，并由独立质检 Agent 检查最终草稿。
4. “对话”模式只有只读工具；“任务”模式的写文件和命令操作逐次等待批准。macOS 命令使用 Seatbelt 沙箱，禁止网络和工作区外文件访问。
5. 工作区中的 UTF-8 文本和源码会在后台预热并增量写入 SQLite FTS5 索引；`.gitignore` 与 `.workbeeignore` 可控制范围。在设置中添加“知识库 Embedding”模型后，系统会融合向量与关键词检索；Embedding 会将待索引片段发送给所配置的模型服务商。
6. 工具过程、专家与质检状态、停止按钮、审批卡片和本地历史都在工作台显示。应用异常退出后，只允许安全重放尚未完成副作用工具的任务。

在“插件 → 我的 → 添加 MCP”中可添加兼容 Streamable HTTP 的 MCP 服务。保存前会执行初始化验证，Bearer Token 仅进入 Electron `safeStorage`；Agent 动态发现工具，以 `mcp_{serverId}_{toolName}` 注册，并依据 MCP annotations 决定审批风险。开发环境仍可用 `WORKBEE_MCP_SERVERS` 临时注入配置。

默认模型为 `deepseek-v4-flash`，OpenAI-compatible base URL 为 `https://api.deepseek.com`。

## 命令

```bash
npm test
npm run desktop:dist
```

发布时只需依次执行 `npm test` 和 `npm run desktop:dist`。`desktop:dist` 会先重新生成 Renderer 与 PyInstaller `onedir` Agent，再生成当前平台的发布包，因此无需额外执行 `build` 或 `agent:build`。Windows 构建会在 `release/` 生成安装程序和免安装 ZIP；`desktop:pack` 仅用于本地检查未安装应用目录。Electron Main 在开发环境使用 `agent/.venv`，在发布环境使用 `process.resourcesPath/agent/workbee-agent/`。

## 数据位置

SQLite 与加密后的 provider key 位于 Electron 的 `userData` 目录。SQLite 不存模型 Key。卸载应用前如需保留历史，请先备份该目录。
