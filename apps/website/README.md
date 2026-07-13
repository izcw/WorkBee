# AIvra 官方网站

AIvra 官方产品网站，用于介绍 AIvra Team 的核心能力、智能体协作方式以及 macOS、Windows 桌面端下载入口。

网站采用白色与品牌蓝 `#1313BA` 作为主要视觉语言，包含毛玻璃导航、产品界面展示、角色关系谱、知识库关系谱和交互式字符龙卷风等效果。

> 本项目仅包含官方网站代码，与桌面应用 `Frontend/` 相互独立。请勿将网站页面或依赖写入 `Frontend/`。

## 产品介绍

AIvra 是一个可自定义智能体团队的桌面工作空间。用户可以创建不同角色，为角色连接技能和知识库，并在对话、任务与项目中组织团队协作。

网站目前重点介绍以下能力：

- 在“对话”和“任务”两种模式之间切换
- 自定义智能体角色、职责、技能与专属知识库
- 使用公共知识库为多个角色提供统一资料
- 为工作步骤分别绑定角色、技能与知识来源
- 查看项目阶段、执行角色和任务状态
- 设置定时任务，让团队持续处理周期性工作
- 使用自己的 API 配置连接外部大模型服务
- 根据对话、角色、任务或工作步骤选择不同模型

AIvra 本身不内置大模型，模型服务、凭证和使用方式由用户自行配置和管理。

## 技术结构

项目基于以下技术构建：

- React 19
- Next.js 16
- TypeScript
- Tailwind CSS
- vinext / Vite
- Cloudflare Workers 兼容构建
- OpenAI Sites 托管配置

关系谱和字符龙卷风使用 Canvas 绘制，以减少大量动画 DOM 带来的性能开销。

## 环境要求

- Node.js `>= 22.13.0`
- npm

## 本地开发

在 `Website` 目录中执行：

```bash
npm install
npm run dev
```

开发服务器默认运行于：

```text
http://localhost:3000
```

## 构建与检查

```bash
# 生成生产构建
npm run build

# 执行项目测试
npm test

# 执行代码检查
npm run lint
```

## 目录说明

```text
Website/
├── app/                    # 页面、交互组件与全局样式
│   ├── page.tsx            # 官网首页内容
│   ├── globals.css         # 全站视觉与响应式样式
│   ├── InteractiveDigits.tsx
│   ├── NetworkGraph.tsx
│   └── KnowledgeGraph.tsx
├── public/
│   ├── icon/               # 平台、技能与知识库图标
│   ├── product/            # AIvra 产品界面图片
│   └── team/               # 默认角色头像
├── .openai/hosting.json    # Sites 托管项目配置
├── package.json
└── vite.config.ts
```

## 下载链接

macOS 和 Windows 下载按钮目前统一指向以下占位地址：

```text
https://github.com/izcw
```

正式发布安装包后，请在 `app/page.tsx` 中修改 `downloadUrl`，指向对应的 GitHub Releases 下载地址。

网站不会直接存放或上传桌面端安装包。

## Git 管理

AIvra 使用项目根目录的 Git 仓库统一管理代码。`Website/` 内不应存在独立的 `.git` 目录，否则根仓库无法逐文件显示网站改动。

推荐在项目根目录执行：

```bash
git status
git add Website
```

Sites 发布使用临时源码副本，不会在 `Website/` 中创建嵌套 Git 仓库，也不会影响根仓库当前的暂存状态。

## 托管配置

`.openai/hosting.json` 保存 Sites 项目标识以及可选的 D1、R2 逻辑绑定。运行时配置应通过 Sites 管理，不要将密钥或模型 API 凭证提交到仓库。

## 维护建议

- 产品功能变化后，同步更新官网文案和本 README
- 新增图片时优先使用 WebP 或经过压缩的 PNG
- 保持桌面端与移动端布局同步验证
- 避免在页面中硬编码模型密钥、下载令牌或其他敏感信息
- 修改下载链接时同时检查首屏按钮、下载区和页脚入口
