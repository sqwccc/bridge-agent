# 区域报警查询兼容修复（2026-11-03）

现场来源数据库为 Vastbase G100 V2.2 (Build 10)。用户执行独立的
`LEFT JOIN LATERAL (SELECT ...)` 测试返回 SQLState 42601，Position 72。

AlarmMapper.list 改为普通 LEFT JOIN：先过滤处置删除记录，再按报警编号和
行政区划前四位分组，用 row_number() 按 gxsj DESC NULLS LAST、bsm 选择一条。
排名条件放在 ON 中，保留无处置记录的报警，避免重复关联导致分页计数增加。
报警去重、桥梁归属、筛选条件和返回字段保持不变。

SourceMapperIntegrationTest.alarmHandlingKeepsLatestValidCityScopedRowAndPagination
使用只读 CTE 夹具验证城市隔离、最新记录、同时间排序、空时间、删除标记、
无处置记录、分页及总数；本地 PostgreSQL 验证通过。

生产 Vastbase 完整查询和接口仍待验证，不代表生产故障已解决。
现场可执行 alarm-list-vastbase-explain.sql（无筛选、第一页，仅 EXPLAIN）。
如果规划成功，仍需验证实际查询和页面接口。

发布必须重新构建后端 Java JAR 并更新镜像。旧 p18089 前端增量打包脚本
沿用基础镜像 JAR，单独执行该脚本不会包含这次后端修复。
本次未重新打包、推送或部署镜像。
