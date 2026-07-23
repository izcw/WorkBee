# Aivra Desktop

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
3. 默认选中 Aivra 角色；角色头像显示在“选择角色”右侧。对话框和团队页只能选择模型库中已经添加的模型。
   对话可同时选择多个角色；附加角色分别用自己的模型分析，主角色汇总并执行工具。
4. “对话”模式只有只读工具；“任务”模式的写文件和命令操作逐次等待批准。macOS 命令使用 Seatbelt 沙箱，禁止网络和工作区外文件访问。
5. 工具过程、停止按钮、审批卡片和本地历史都在工作台显示。

默认模型为 `deepseek-v4-flash`，OpenAI-compatible base URL 为 `https://api.deepseek.com`。

## 命令

```bash
npm test
npm run desktop:dist
```

发布时只需依次执行 `npm test` 和 `npm run desktop:dist`。`desktop:dist` 会先重新生成 Renderer 与 PyInstaller `onedir` Agent，再生成当前平台的发布包，因此无需额外执行 `build` 或 `agent:build`。Windows 构建会在 `release/` 生成安装程序和免安装 ZIP；`desktop:pack` 仅用于本地检查未安装应用目录。Electron Main 在开发环境使用 `agent/.venv`，在发布环境使用 `process.resourcesPath/agent/aivra-agent/`。

## 数据位置

SQLite 与加密后的 provider key 位于 Electron 的 `userData` 目录。SQLite 不存模型 Key。卸载应用前如需保留历史，请先备份该目录。
