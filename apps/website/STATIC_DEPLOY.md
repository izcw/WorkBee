# 静态部署（宝塔）

在本目录执行：

```powershell
npm ci
npm run build
```

将生成的 `dist` **目录内全部文件**上传到宝塔网站的根目录（不要再套一层 `dist`）。网站运行模式选择“静态网站”，无需 Node.js、PM2 或数据库。

若需要单页路由兜底，可在 Nginx 配置中加入：

```nginx
try_files $uri $uri/ /index.html;
```

当前页面使用锚点导航；该规则保留后续增加前端路由时的兼容性。
