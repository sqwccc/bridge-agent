# 项目对话交接

涉及华为云 CCE、p18089 单镜像、门户前缀、离线打包或部署排障时，先阅读 `docs/cce-p18089-handoff.txt`。该文档记录 2026-11-02 成功产物和验证边界，2026-11-03 整理。

注意：成功打包不代表生产全部业务通过；区域报警接口的 BadSqlGrammarException 仍待定位。不得将它记为已修复。

继续工作前检查实际分支和工作区状态；本次交付涉及尚未提交的文件，不能只根据 main 分支推断镜像内容。不要覆盖用户已有修改。持久交接文档不记录密码、令牌或私钥。

# 来源数据库 SQL 规范

涉及智能问答、报警、监测、巡查、病害、养护、报告及共用 Mapper 的来源查询时，必须遵守以下要求。修改前阅读 `docs/agent-vastbase-compatibility.md`，能力检查脚本见 `docs/agent-vastbase-capability-check.sql`。

## 数据库与连接边界

- 生产桥梁来源库为 **Vastbase G100 V2.2（Build 10）**，不得按原生 PostgreSQL 推定全部语法兼容。PostgreSQL JDBC 仅代表连接驱动。
- 已确认来源库为 `3.141.179.64:5432/qiaoliang_db`，schema 为 `qiaoliang`；与系统自身应用数据库区分。连接由 `SOURCE_DB_URL` 配置，CCE 环境变量优先于镜像默认值；排障以运行实例实际配置为准。
- DBeaver 和应用须使用一致的数据库、账号及 schema；现场检查可显式使用 `qiaoliang.表名`。不得在规范、日志或交接文件中记录密码、令牌、私钥。

## SQL 编写要求

- 来源查询不引入 `LATERAL`（包括相关 VALUES）或 `AS MATERIALIZED / AS NOT MATERIALIZED`。现场已确认特定 `LEFT JOIN LATERAL (SELECT ...)` 返回 SQLState `42601`；其他形式也按项目兼容性约束规避，不将其描述为全部已现场证伪。
- 使用普通 CTE、普通关联和分组查询；多维汇总采用各维度 `GROUP BY` 后 `UNION ALL`，保证空结果仍有总数 0、仅总数或空维度集合生成合法 SQL。
- 多列去重计数采用 `SELECT count(*) FROM (SELECT DISTINCT 多列 ...) 别名`，保留 NULL 通道的去重语义。
- 每组最新记录优先采用 `row_number() OVER (PARTITION BY ... ORDER BY ...)` 后普通关联。必须保留业务键、城市隔离、确定性排序和空时间顺序，不能随意删除现有排序条件。
- 报警处置记录按 **报警编号＋行政区划前四位** 分组；先排除 `sjtbzt='D'`，再按 `gxsj DESC NULLS LAST, bsm` 排名；`handling_rank=1` 必须放在 `LEFT JOIN` 的 `ON` 条件中，保留没有处置记录的报警。
- 删除标记处理按各业务既定语义执行。不得将报警处置的“先排除删除再排名”直接套用到其他最新版本查询，以免使已删除记录重新出现。
- 保留城市归属、NULL 匹配、过滤条件、字段别名及返回类型契约。日期结束边界、示例排序、处置优先级和统计总数不得因兼容改写而变化。
- 对保留或新增的 `DISTINCT ON`、`to_jsonb`、`json_agg`（含聚合内排序）、数组比较、`IS NOT DISTINCT FROM`、`::` 转换等扩展写法，必须明确现场验证状态。不能仅凭 JDBC 驱动或本地 PostgreSQL 测试判断兼容，也不能未经语义核对就批量替换。

## 排障、测试与发布要求

- `BadSqlGrammarException` 不能直接归因于 Dify；获取对应 Mapper statement、最内层 SQLException、SQLState 和错误位置，区分语法、表字段、权限及类型映射问题。日志不得泄露凭据、用户问题或敏感业务数据。
- 修改 SQL 后检查实际 MyBatis 动态 SQL，覆盖全网/单桥/空范围、日期筛选、空值、无数据、跨城市同编号和最新记录删除等相关场景；对聚合改写执行结果语义回归。
- 本地 PostgreSQL 测试只用于回归，不能替代生产 Vastbase 验收；能力探针通过、EXPLAIN 成功、HTTP 200 或成功打包均不代表业务成功。须验证完整查询执行、JDBC 类型映射、接口返回及问答 SSE 完成且无 error。
- 改写关联、聚合或 CTE 后检查真实数据量下的执行计划和耗时，不能假定去掉物化提示后仍只扫描一次。不得吞掉查询异常并以空列表冒充成功，不得通过修改生产表结构试错。
- Mapper SQL 属于后端产物。发布必须重新构建 Java JAR 并装入新镜像，仅更新前端的 p18089 增量打包不会包含 SQL 修复。
- 交付时分别说明当前分支、是否同步 main、本地验证、生产验收和镜像更新状态。生产未验收的报警或问答故障不得标为已修复。
