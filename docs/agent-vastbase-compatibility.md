# 智能问答来源 SQL 兼容性检查（2026-11-03）

目标数据库是 **Vastbase G100 V2.2（Build 10）**，不是 PostgreSQL。PostgreSQL JDBC 仅是连接驱动。使用应用实际的 SOURCE_DB_URL、账号和 qiaoliang schema 验收；不要误用系统自身的应用数据库。

## 本次修改

| 查询路径 | 检查结果与处理 |
| --- | --- |
| AgentMapper.summary / focusSnapshot | 将相关 VALUES 的 CROSS JOIN LATERAL 改成各维度普通 GROUP BY 后 UNION ALL；保留字段、分组、排序、空结果 total=0 和优先级规则；只请求 total 或空维度集合也能生成完整 SQL |
| AgentMapper.monitoringCoverage | 多列 count(DISTINCT (…)) 改成 SELECT DISTINCT 多列后 count(*)，保留 NULL 指标通道的去重语义 |
| AgentMapper / WorkMapper / BridgeMapper 共用 CTE | 移除 AS MATERIALIZED，改用普通 AS；不要假定 Vastbase 接受 PostgreSQL 新版本的物化提示 |
| QualityMapper | 一并移除 AS NOT MATERIALIZED；该文件不是当前问答 quality 分支的直接查询入口 |
| 报警、监测、报告 Mapper | 检查了共用依赖；没有新增 LATERAL/物化提示。保留已有最新版本、删除标记和归属处理，避免改变业务结果 |

现场已证明特定 LEFT JOIN LATERAL 子查询失败；CROSS JOIN LATERAL 和物化提示的移除是兼容性加固，不能据此认定截图中每次 BadSqlGrammarException 都已经定位。

## 保留的语义与待验证项

- 桥梁/点位/设备/巡查/病害/养护的最新记录选择、删除标记规则、城市隔离及排序未变。报警处置继续按报警编号和行政区划前四位分组，先排除删除处置，再排名，排名条件留在 LEFT JOIN ON 中。
- 仍使用 DISTINCT ON、to_jsonb、json_agg（含聚合内排序）、IS NOT DISTINCT FROM、数组相等、:: 类型转换等。不能仅因驱动是 PostgreSQL 就认定这些全部兼容，也不能没有现场证据就删除确定性排序或 NULL 匹配规则。
- `agent-vastbase-capability-check.sql` 提供不读取业务表的基础能力探针；成功也不能代替完整 SQL、实际类型映射和接口验收。
- 去掉物化提示和更换汇总结构可能改变执行计划，需测全网范围、单桥及日期筛选的实际耗时，确认不超过现有查询超时。

## 本地验证与现场验收

新增 AgentSqlCompatibilityTest：渲染三种业务、空/多桥范围、空/总数/完整维度集合下六类问答查询；隔离 PostgreSQL 夹具执行真实 summaryRows，检查总数、空值、城市分组、处置优先级和维度选择。这验证统计语义，不构成 Vastbase 认证。

本次执行 Maven test 共 88 项，70 项通过、18 项外部环境测试跳过；隔离 PostgreSQL 15 夹具测试已启用并通过，六条能力探针也在该隔离库执行通过。没有使用生产来源库连接。

现场需要：

1. 用应用同库同账号执行能力探针，记录失败语句、SQLState 和错误位置。
2. 执行完整问答链路：全网和单桥的病害、养护、巡查、监测、报警、报告，以及处置优先级问题；包含日期范围、无数据条件和连续追问。
3. 核对结果总数、没有处置的报警、跨城市相同编号、空指标通道、示例记录排序和实际耗时；不能只检查 EXPLAIN 或 HTTP 200，需确认 SSE 没有 error 且回答完成。
4. 如仍失败，获取最内层 SQLException 的 SQLState、错误位置及对应 Mapper statement，区分语法、表字段、权限和类型映射问题。

本次修改尚未在生产 Vastbase 执行，未更新生产镜像，未同步 main。发布需要重新构建 Java JAR 并装入新镜像，旧的仅前端增量包不会包含这些 SQL。
