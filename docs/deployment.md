# 环境与部署

## 本地开发

`dev` 是默认 Spring Profile。开发脚本读取根目录 `.env.local`；直接运行 Maven 时，可使用系统环境变量覆盖配置。前端 `BACKEND_URL` 控制开发代理，默认 `http://localhost:8088`；`VITE_API_BASE_URL` 默认 `/api/v1/`。

业务库与来源库各有 URL、用户名和密码，互不复用连接池。来源连接只读且查询超时 15 秒。账号初始化需显式 `init-account` Profile，初始化完成自动退出。普通启动不会生成账号。

`.mvn/settings.xml` 将本地 Maven 仓库设为 `${user.home}/.m2/repository`，避免继承本机旧配置中的失效盘符。没有复制参考项目的业务凭据。

## 生产准备

### 当前测试环境（2026-10-23）

业务连接已切换至 `47.116.37.130:5432/bridgemind_test` 独立数据库，库内使用 `bridgemind_test` schema，账号为 `bid_agent_user`。连接口令仅保存于被 Git 忽略的 `.env.local`。本系统的 `bm_user`、`flyway_schema_history` 两张表位于 `bridgemind_test` schema；SQL 包全部 238 张来源表单独位于 `qiaoliang` schema。两条连接使用同一数据库、不同 schema，来源连接池仍启用只读事务，不依赖本机数据库。

`APP_DB_URL` 的 `currentSchema=bridgemind_test` 限定业务 SQL 的搜索路径；`APP_DB_SCHEMA=bridgemind_test` 同时限定 Flyway 默认 schema 与迁移历史表位置。来源 URL 设置 `currentSchema=qiaoliang`，`SOURCE_DB_SCHEMA=qiaoliang` 同步控制来源连接池的搜索路径。Flyway 仍只管理本系统 schema，不迁移来源表。来源和业务使用同一提供的数据库账号；来源只读由连接池事务保证，该账号本身拥有此 schema 的写权限。新 schema 已初始化，原 `bid_agent` 数据库中的 `bridgemind_test` schema 已按要求删除；删除前已逐表核对 15 张表内容一致，独立 `bridgemind_test` 数据库保留，其他 schema 未修改。日常仅执行 `scripts/start-backend.ps1`，不要重新运行本地建库或导入脚本。页面免登录预览保持开启，原 admin 登录信息可继续使用。

新环境需要独立 schema 时，可配置上述两个参数后运行 `python scripts/create-app-schema.py`；脚本遇到已有 schema 会拒绝创建，不覆盖已有对象。Flyway 不自动创建 schema。生产使用自定义 schema 时同样必须预先创建，并同步设置 JDBC `currentSchema` 和 `APP_DB_SCHEMA`。

1. 单独准备业务数据库及其读写账号；来源库使用只读账号，至少授予所需表的 SELECT 和 schema USAGE。来源库不需要本系统建表权限。
2. 将 `.env.production.example` 复制为 `.env` 并填写真实地址和密码。容器中的 `localhost` 指容器自身，宿主机数据库使用 `host.docker.internal` 或实际内网地址。
3. 生产不使用 `setup-local.ps1`，不导入本地资料。业务库初始结构由后端 Flyway 创建。
4. 外层 HTTPS 网关反向代理到同机 `127.0.0.1:8089`，必须覆盖 `X-Forwarded-Proto: https`。生产 Session Cookie 固定 Secure，纯 HTTP 地址不能作为生产登录入口。

```powershell
docker compose --env-file .env build
# 首次账号创建：通过当前进程环境变量传入，避免把密码写到命令行参数。
$env:INIT_USERNAME = 'admin'
# INIT_PASSWORD 从部署密钥管理或终端安全输入注入；至少12字符，不超过72 UTF-8字节。
docker compose --env-file .env run --rm --no-deps -e INIT_USERNAME -e INIT_PASSWORD -e SPRING_PROFILES_ACTIVE=prod,init-account backend
docker compose --env-file .env up -d
```

Compose 只定义前后端服务，不声明 PostgreSQL 容器或数据卷。后端不映射宿主机端口；前端仅绑定回环，由外层网关提供 HTTPS。本期单实例，重启后需要重新登录。数据库口令、来源附件令牌不得放入 Vite 环境变量。

## 附件地址

`REPORT_BASE_URL` 指允许访问的 HTTP(S) 来源前缀，例如 `https://files.internal/qiaoliang/`。来源附件路径必须在该地址范围内。未配置时列表仍显示来源报告，操作标记“附件来源未配置”。

后端禁止跨域地址、路径回退、自动重定向和 URL 参数代理；默认最大文件 20 MiB，可用 `REPORT_MAX_BYTES` 调整。PDF 校验文件头并允许同源预览；其他附件使用下载响应。实际源库若使用 FTP、临时签名地址或特殊鉴权，需要增加专用附件适配器，不直接开放任意 URL 转发。

## 运维

- `/actuator/health` 是匿名最小健康检查，不公开连接细节。数据库故障时业务接口返回 503，前端显示错误与重试按钮。
- 定期备份业务库；来源库由其维护方负责。本地导入报告位于 `runtime/import-report.json`。
- `prod` 必须提供全部数据库环境变量；不继承本地凭据或自动生成样例。
- 先验证新镜像及迁移再切换服务；业务库迁移需向后兼容。第一版只有账号表迁移。
