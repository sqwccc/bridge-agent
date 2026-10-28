# BridgeMind 桥梁智能体

一期提供独立账号登录、江苏路网大屏、单桥档案、来源监测查询、历史报警与报告列表。现已增加本地 Dify + DeepSeek 总体／单桥问答、问题分类、受控业务聚合和流式回答；Dify不直接连接数据库，使用说明见 [Dify 本地接入](docs/dify-local.md)。BIM、健康状态、风险排名和视频仍按实际来源条件接入。

## 本地运行

当前测试使用远程独立数据库 `bridgemind_test`：本系统表位于 `bridgemind_test` schema，SQL 包全部 238 张来源表单独位于 `qiaoliang` schema，使用已有 `.env.local` 直接启动即可，不必重新建库。连接范围和配置方式见 [部署文档](docs/deployment.md)。

环境：JDK 25、Node.js 24、pnpm 11.24、Python 3.12+、Docker Desktop。使用已有 `shared_postgres`，不新建或重置共享容器。

```powershell
# 在 D:\WorkProjects\bridge-agent 执行（首次配置可复制 .env.local.example 为 .env.local）
.\scripts\setup-local.ps1
.\scripts\init-account.ps1
```

初始化账号的用户名和随机密码写入 `runtime/local-account.json`，已加入 Git 忽略。初始化不会更改已有账号密码。数据库管理员账号不用于页面登录。

分别在两个终端启动：

```powershell
.\scripts\start-backend.ps1
.\scripts\start-frontend.ps1
```

打开 <http://127.0.0.1:5173>，后端默认 `8088`。不通过前端代码暴露数据库或附件服务凭据。

当前本地 dev 环境默认开启免登录预览，直接进入大屏，访问 `/login` 也会跳转到大屏；退出按钮暂时隐藏。需恢复登录时，在 `.env.local` 中设置 `PREVIEW_ENABLED=false` 后重启后端即可。生产环境默认仍要求登录。免登录仅开放大屏和桥梁的 GET 查询，保留 CSRF 和账号接口校验。

## 目录与架构

```text
backend/       Java 25 / Spring Boot 4.1 / Security / MyBatis / Flyway
frontend/      React 19 / TypeScript / Vite / Ant Design / Recharts
scripts/       本地双库初始化、账号初始化、启动、只读审计与验收
docs/          接口、字段映射、部署、后续接入与验收记录
runtime/       本地账号、审计报告、截图（不提交）
docs/历史资料/sql/ql/        用户提供的来源资料（原样保留）
docs/历史资料/ShengQiaoLiangZhiNengTi/  原型和既有 Python 系统（原样保留）
```

后端按 `auth/dashboard/bridge/monitoring/alarm/report` 业务模块分层，SQL 仅在 Mapper XML。前端按 `api/app/features/pages` 组织，路由为 `/login`、`/screen`、`/bridges/:bridgeId`。生产依赖版本以 Maven 配置和 pnpm 锁文件为准。

## 数据隔离

- 当前远程测试库为 `bridgemind_test`。本系统使用 `bridgemind_test` schema，Flyway 仅管理此 schema；SQL 包副本使用 `qiaoliang` schema。
- 来源连接池只读；当前提供的远程账号本身具备写权限，生产应另配仅 SELECT 权限的来源账号。
- `import-full-source.py` 全量导入包内 238 张表，逐表校验和事务回滚；已有表不重复追加，导入进度见 `runtime/full-source-import.json`。
- `init-local.py` 仅连本机，通过管理员建库及导入指定表。它解析 SQL 字面量，不执行来源文件中的任意语句；非空表跳过，不覆盖数据。
- 生产改用真实来源库只读账号，库结构需符合字段映射；不运行本地副本初始化脚本。

当前资料的桥梁监测值表和监测分析报告表为空，部分附件仅有路径。页面如实显示缺测与附件来源未配置，不生成演示曲线、健康评分或虚构报告。

## 验证

```powershell
cd backend
.\mvnw.cmd test
.\mvnw.cmd package
cd ..\frontend
pnpm lint
pnpm test
pnpm build
# 前后端已启动且 runtime/local-account.json 存在时执行
pnpm test:e2e
cd ..
python scripts/test_import.py
python scripts/verify-local.py
python scripts/source-audit.py
python scripts/audit-phase-one.py
python scripts/audit-phase-two.py
python scripts/audit-phase-three.py
# IDEA MCP 地址以 IDE 实际监听端口为准
python scripts/format-idea.py --url http://127.0.0.1:64343/stream
# 镜像构建完成后，隔离临时容器验证（结束后自动清理）
.\scripts\verify-images.ps1
```

首次运行 Playwright 如缺少 Chromium，执行 `pnpm exec playwright install chromium`。端到端测试针对本次提供的来源副本，包含底数一致性和指定历史数据用例；生产数据更新后需同步更新固定数据断言。

文档：[部署与环境](docs/deployment.md)、[数据映射与缺口](docs/data-mapping.md)、[API 与后续接入](docs/api-and-extensions.md)、[验收记录](docs/verification.md)。

2026-10-26 对接 FAQ 第一期已补充 BCI/BSI 独立等级、有效监测分类、生命周期与条件空值说明、统一字典及前端筛选。字段核查与数据基线见 [第一期核查](docs/phase-one-audit.md)。PostgreSQL 只读集成测试需显式启用：在 `backend` 执行 `.\mvnw.cmd -Dbridgemind.sourceIntegration=true test`；配置取自根目录 `.env.local`。浏览器回归 `pnpm test:e2e` 的完整登录用例要求测试进程设置 `PREVIEW_ENABLED=false`，验证结束后恢复原有预览配置；本次新增 `phase-one.spec.ts` 支持两种访问模式。

第二期已提供完整档案、跨径/养护/使用状态/三特多选筛选与分布、按 FAQ 标明单位的监测指标和独立阈值区间、按来源及单桥/共享任务范围区分的检测报告与图片附件。核查结果及数据条件见 [第二期核查](docs/phase-two-audit.md)。`phase-two.spec.ts` 覆盖接口、页面、文件失败提示、PDF 下载和图片预览；真实监测值与附件来源配置仍按实际数据状态展示。

第三期已增加单桥巡检、病害、维修分页与详情、业务条件筛选、病害和维修候选追溯、业务附件，以及 `/data-quality` 原始数据质量核查页。由桥梁档案的“巡检·病害·维修记录”或顶栏“数据质量”进入。核查证据见 [第三期核查](docs/phase-three-audit.md)，可执行说明见 [核查 Notebook](docs/phase-three-audit.ipynb)。巡检结果缺失、病害编号重复、未匹配关系和时间异常均保留说明。代码已通过 IDEA MCP 统一格式化，前端另通过同一 MCP 调用项目 Prettier；`pnpm format:check` 排除构建产物和生成锁文件。
