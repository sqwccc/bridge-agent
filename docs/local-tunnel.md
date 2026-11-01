# 本地启动与内网穿透

当前外部地址：<https://82mmnq755926.vicp.fun>。

穿透目标保持 **HTTP → 127.0.0.1:5173**，外部 HTTPS 由穿透服务提供。
浏览器通过同一域名访问页面和 `/api`；Vite 将 `/api` 转发到 `127.0.0.1:8088`。
无需额外穿透后端、Dify 或数据库端口。

在仓库根目录，分别启动：

```powershell
./scripts/start-backend.ps1
./scripts/start-frontend.ps1
```

已有进程运行时无需重复启动。前端固定5173端口，端口被占用时会报错，不再自动切换到5174。
原有 `.env.local`、分支 Dify 选择及登录/预览设置继续生效。本次不更改访问权限。

更换穿透域名后重启前端：

```powershell
./scripts/start-frontend.ps1 -PublicUrl 'https://新的域名'
```

直接运行 `pnpm dev` 时默认允许当前域名；也可以通过进程环境变量 `BRIDGEMIND_PUBLIC_URL` 指定新的完整HTTP(S)地址。仅允许指定主机名，不放开所有域名。
后端继续本地监听，前端 API 地址保持相对路径 `/api/v1/`；不要将 `VITE_API_BASE_URL` 设置成访问者电脑上的 localhost。

可访问：总体大屏 `/screen`、万福大桥 `/bridges/10905200071`、分析页 `/bridges/10905200071/analysis`。

验证结果：公网首页、深层分析路由、静态分析资源、登录配置和总体统计接口均返回200；HTTPS会话、CSRF及规则问答SSE通过。浏览器实际打开振动分析页，Vite热更新WebSocket连接正常，无页面脚本异常；未允许的Host仍返回403。截图保存在本地忽略目录 `runtime/tunnel-analysis.png`。
