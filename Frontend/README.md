# Aivra Frontend

基于 React、TypeScript 与 Vite 的 Aivra 智能体桌面端前端实现。

## 开发

```bash
npm install
npm run dev
```

## 生产构建

```bash
npm run build
npm run preview
```

页面通过 hash 路由访问：`#/home`、`#/chat`、`#/team`、`#/skills`、`#/plugins`、`#/docs`。

## 桌面应用

```bash
# Electron 开发模式
npm run desktop:dev

# 生成可直接运行的应用目录
npm run desktop:pack

# 生成安装包（macOS DMG/ZIP、Windows NSIS、Linux AppImage）
npm run desktop:dist
```

Electron 主进程位于 `electron/main.cjs`，渲染层仍是普通 React 应用，后续接入本地文件、Agent 或系统托盘时可继续通过 preload 暴露最小化 API。

### 应用图标

桌面应用统一使用 `electron/Aivra.png` 作为图标。`package.json` 的 `build.icon` 以及 `build.mac.icon`、`build.win.icon`、`build.linux.icon` 已固定指向该文件，因此执行 `npm run desktop:pack` 或 `npm run desktop:dist` 时会自动生成并写入各平台所需的图标格式，无需在每次打包前手工指定。Electron 开发窗口和 macOS Dock 也会使用同一文件。

以后替换图标时：

1. 用新图片覆盖 `electron/Aivra.png`，保持文件名和路径不变。
2. 图片必须是正方形 PNG，至少 `512 × 512`，推荐 `1024 × 1024` 并保留透明背景。尺寸过小会被 `electron-builder` 拒绝。
3. 删除旧的 `release/` 后重新运行打包命令，避免查看到系统或构建缓存中的旧图标。

```bash
rm -rf release
npm run desktop:dist
```

macOS 会生成 DMG 和 ZIP，Windows 会生成 NSIS 安装包，Linux 会生成 AppImage。通常应在目标操作系统上构建对应安装包；图标的 `.icns`、`.ico` 等平台格式由 `electron-builder` 从上述 PNG 自动转换。
