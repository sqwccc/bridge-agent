# 本地 Dify 与单桥问答

## 2026-10-27 总体／单桥流式问答（当前版本）

以下说明覆盖本文后面的旧版单桥 blocking 使用方式。大屏点击“打开总体问答”，单桥页点击“打开单桥问答”。支持问题分类、受控业务查询、全量业务统计、最近10条示例、会话追问、Markdown、来源入口、停止生成及错误时保留部分答案。

架构：前端 POST SSE → Java → Dify 分类应用（仅问题、页面条件、最近3次已验证计划及引用）→ Java 校验白名单 → 现有 Service/只读 Mapper → Dify 回答应用 streaming → Java SSE → 前端。Dify 两个应用均关闭 Agent 工具、外部数据工具和数据集，不持有业务数据库凭据；没有模型SQL执行接口。

配置：保持原 DIFY_API_KEY 为回答应用密钥，新增 DIFY_CLASSIFIER_API_KEY 为分类应用密钥。已有本地 Dify 执行 `python scripts/upgrade-dify-agent.py`，之后重启后端。脚本复用已有模型绑定，保存首次升级前配置到本地 runtime，不改变数据模式；模型提示词源文件为 docs/dify-classifier-prompt.txt 和 docs/dify-answer-prompt.txt。无密钥导出为 docs/dify-classifier-app.yml 和 docs/dify-bridge-app.yml。部署到其他 Dify 时分别导入、重新绑定模型、生成密钥。

分类：business_query、domain_knowledge、greeting_help、unsupported、out_of_scope、clarification_required。后四类直接返回简短答复，不加载业务资料；知识问答仅给固定术语与字典。分类失败不降级成自由查询。

业务范围：总体支持接入桥梁概览、地市及分类分布、桥梁检索、巡检/病害/维修全量分组统计、历史报警总数与最新记录、评价资料核查。单桥另支持完整档案、具体记录及关联候选、监测设备与阈值配置、报告目录。总体提供唯一桥名时可解析档案/监测/报告对象，多候选要求选择。不读取报告正文，不分析实时监测曲线，不推断风险排名、安全、寿命或预算。

口径：复用“江苏最新有效且关联有效设备”范围。业务按同市同桥唯一归属、最新有效版本查询；原始等级与按养护类别校验后的分组不能混用。模型输入剔除跨业务不适用字段，病害不发送维修类型和整改日期等空占位。聚合与样本分离；巡检结果未提供不能认为正常；记录数量变化不等于病害发展。监测分类1/2计数不是有设备数或在线数。

会话：Session 内最多8个会话，每个保留最近3次成功提问的计划与引用；不把旧模型答案作为业务证据。每问重新查询。更换桥梁、页面筛选或新对话时开启新会话；当前页面筛选继承，明确自然语言条件可覆盖对应项，界面详情显示最终执行条件。清空页面筛选需在页面操作。本版未提供永久会话保存和“应用问答条件到大屏”按钮。

时间：问答页面已移除日期控件，从问题中解析具体日期、“今年”“最近7天”等时间范围；追问沿用已确认的查询条件，独立问题未指定日期时查询全部历史。报警指定日期必须成对且最多31天。档案是当前快照，不支持历史档案版本对比。总体业务聚合为一次集合查询，不逐桥请求列表；样本最多10条，模型证据包上限60000字符。

流式协议：GET `/api/v1/agent/status`；POST `/api/v1/agent/ask`，请求为 question、scope(network/bridge)、bridgeId、pageFilters、from/to、conversationId。沿用Session/CSRF。事件为 meta、status、plan、evidence、delta、replace、ping、done、error。仅收到done算完成。最多2个并发请求，同会话不可并发；180秒连接上限、10秒心跳。断开后取消后端任务并关闭Dify输入流；不承诺供应商已立即停止计费。前端不自动重放失败POST。

验证命令：`python scripts/verify-agent-stream.py`（使用当前已配置数据模式和真实模型；含当前数据快照断言）；后端 `./mvnw.cmd test` 和 `./mvnw.cmd -Dbridgemind.sourceIntegration=true -Dtest=AgentSourceIntegrationTest,PhaseThreeSourceIntegrationTest test`；前端 `pnpm test`、`pnpm build`、`pnpm lint`、`pnpm exec playwright test e2e/agent.spec.ts`。浏览器替身测试不代替真实Dify验证；真实证据位于 runtime/agent-stream-live.json。

下文为升级前的部署背景及历史验收记录。

## 部署

- Dify 1.18.0，Docker Compose 项目名 `bridgemind-dify`。
- Windows Docker Desktop + Ubuntu WSL2；服务文件和持久化卷在 Ubuntu `/opt/bridgemind-dify-1.18.0`。
- 管理入口 `http://127.0.0.1:8090`；不向局域网开放管理端口。
- 独立 PostgreSQL、Redis、Weaviate、模型插件服务及存储，不复用业务数据库。
- 本次启用 Chatbot/Chatflow 所需服务；自主 Agent 运行环境通过 `autonomous-agent` profile 单独启用，默认不启动。
- 启动：在项目根目录执行 `./scripts/start-dify.ps1`。停止可用 WSL 的 `docker compose --project-directory /opt/bridgemind-dify-1.18.0 -p bridgemind-dify -f /opt/bridgemind-dify-1.18.0/docker-compose.yaml -f /opt/bridgemind-dify-1.18.0/compose.override.yaml stop`。
- 备份需保留 WSL 目录的 `.env`、配置及 `volumes`，数据库应先正常停止或通过 pg_dump 导出。不要使用 `down -v` 清理数据。

管理员账号保存在 Git 忽略目录 `runtime/dify-account.json`；包含敏感信息，不提交或复制到聊天。
DeepSeek 密钥保存在 Dify 模型供应商配置中。项目 `.env.local` 中的 `DIFY_API_KEY` 是 Dify 应用密钥，二者不同。

## 使用

2026-10-26 已完成部署及 DeepSeek 实际调用验证；用户授权当前测试库资料用于公网模型联调后，本机 `.env.local` 已切换为 `DIFY_DATA_MODE=source`。配置模板仍默认 demo。

单桥页面点击“打开单桥问答”，可以查询档案、设置病害与维修日期范围，或点击两个快捷总结按钮。
每次提问独立查询当前资料，不承接前一问；最长等待约两分钟。完成后可展开查看提供给模型的资料。
本版采用 Dify Chatbot 的 blocking 接口，整段返回，不逐字流式输出。

默认 `DIFY_DATA_MODE=demo`：仅传合成档案、合成病害和空维修记录，绝不代表当前选中的真实桥梁。
业务后端仍检查当前桥梁是否存在，但不会读取真实详细档案、病害和维修作为模型上下文。

确认资料允许发送到指定模型后，将 `.env.local` 的 `DIFY_DATA_MODE` 改为 `source` 并重启后端，即使用本桥业务数据。
生产内网应配置甲方 Dify 地址与应用 Key，并确认内网模型绑定正确。
DeepSeek 公网模式下 source 上下文会发送到 DeepSeek；切换前按项目的数据使用要求确认。

## 配置和迁移

`python scripts/configure-dify.py bootstrap` 初始化本地账号和聊天应用。
`python scripts/configure-dify.py plugin` 安装官方 DeepSeek 插件。
将 DeepSeek Key 单独一行放入 `runtime/deepseek-api-key.txt`，执行 `python scripts/configure-dify.py configure`。
配置成功后脚本清空临时 Key 文件，并将应用 API Key 写入 `.env.local`。
脚本针对 Dify 1.18.0 的 console API；升级 Dify 后应核对 console API。项目业务调用使用公开的 Service API。

业务应用约定：

- `POST {DIFY_BASE_URL}/chat-messages`，Bearer 应用 Key。
- `inputs.bridge_context` 为服务端查询的 JSON 字符串，最大 60000 字符。
- `query` 为当前问题，最大 2000 字符，`response_mode=blocking`。
- 后端生成每 Session 的随机 `user`，不接受客户端 conversation_id，不跨桥复用会话。
- Dify 输出使用标准 `answer` 字段；应用系统提示词约束来源引用、空值说明及禁止编造评分。
- 配置备份 `runtime/dify-app-config.json` 不含密钥；已通过 Dify 导出无密钥 DSL 到 `docs/dify-bridge-app.yml`。导入甲方 Dify 后需要重新绑定模型供应商、模型名称和凭据，并创建新的应用 API Key。

本地演示配置 `DIFY_PREVIEW_ACCESS=true` 仅在项目 preview 模式开启时允许问答 POST，并继续校验 CSRF。
本地配置将后端绑定到 `127.0.0.1`。生产关闭 preview，问答沿用登录 Session 和 CSRF。
后端最多同时处理两个模型调用；上游失败返回经过过滤的错误，不把密钥或上游原始错误暴露给前端。

## 数据范围与限制

- 档案为当前快照；所选日期只筛选病害和维修。
- 每类按现有业务接口读取最新 30 条，保留筛选总数、纳入数和是否截断。超过上下文大小要求缩小日期范围，不静默裁剪。
- 复用最新有效来源记录口径和字典。内部附件地址不发送，电子档案地址字段移除；不读取附件内容。
- 未查询到记录不等于从未发生；缺失字段不等于正常；重复病害编号不能作为维修闭环证据。
- 真实数据模式总结的是所选样本。全量统计、按自然语言自动改变筛选条件、自由 SQL、报告知识库和跨问追问暂未实现。

## 验证

后端 `AgentIntegrationTest` 验证样例隔离、日期范围、截断标记、Dify 请求格式及错误过滤。
前端 `e2e/agent.spec.ts` 使用明确的接口替身验证抽屉、日期提交、上下文展示和缺配置禁用状态。
真实 DeepSeek 冒烟验证先使用合成样例；用户授权后增加真实数据验证，不能以接口替身测试代替模型验证。

2026-10-26 验证结果：

- 原有后端测试通过（6个来源库集成测试按默认配置跳过）；新增3个问答测试通过。
- 前端构建、单元测试及2个问答浏览器用例通过。
- 真实模型浏览器测试在合成模式、真实数据模式分别通过；未携带 CSRF 的问答请求返回403。
- 古平岗立交 SGQX009A：病害7条、维修7条，模型上下文及回答数量与业务查询一致。记录均有来源id；未将同编号自动认定为修复闭环。BCI和BSI等级与数值分数分别说明。
- 真实数据证据 `runtime/agent-live-source-evidence.json`，页面截图 `runtime/agent-live-source.png`，均留在本地忽略目录。
- 模型使用 `deepseek-flash`，关闭思考模式，输出上限2048 tokens。DeepSeek实际调用正常；Dify插件的费用统计不能替代供应商账单。
