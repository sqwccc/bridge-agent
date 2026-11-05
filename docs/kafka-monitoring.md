# Kafka 实时监测接入

## 当前实现与上线门槛

APP_DB 的 bridge_agent schema 新增三张表；只读来源库用于点位、设备、桥梁归属。
图中实际列出的业务字段是 12 个（此前方案的“13 个”为笔误），全部保留。
消费者默认关闭；曲线与问答实测值已经固定读取 APP_DB，不自动回退旧来源表。
因此部署新版 JAR 前必须先执行 `deploy/cce/sql/003-monitor-kafka.sql`，否则实测查询会报错。

目前没有现场消息样例、Kafka 认证材料或目标库验收结果。不得直接开启生产消费者。
暂定消息契约：单条平面 JSON，上下大小写字段名均接受，重复大小写键拒绝；必填字段按截图要求；
时间为北京时间本地 `yyyy-MM-dd HH:mm:ss[.fraction]` 或 ISO 本地时间，不接受无依据的 epoch/时区转换。
JCZ 精确存储 numeric(18,6)，溢出或需要舍入的值隔离。删除消息也须提供完整字段；稀疏删除先隔离。
暂定业务键为城市+BSM，版本为 TBSJ。必须由上游确认键稳定性、跨城规则及时间严格代表版本，
不符合时调整解析/版本实现后再开启 contract-verified。较旧版本不覆盖；同版本不同内容隔离。
D 保留墓碑，只有更新版本可覆盖。城市从有效点位+设备+指标关联唯一确定；无法唯一确认则隔离。
来源数据库故障和 SQL 故障触发事务回滚/重试，不按业务脏数据隔离。

## 配置

通过 Spring 配置文件或环境变量设置（环境变量使用大写下划线，例如 BRIDGEMIND_KAFKA_ENABLED）：

| 属性（前缀 bridgemind.kafka.） | 默认 |
| --- | --- |
| enabled | false |
| mode | consume（可选 probe） |
| probe-max-records | 3（1–10） |
| probe-timeout-seconds | 30（1–300） |
| contract-verified | false |
| bootstrap-servers | 172.27.9.16:21007,172.27.9.17:21007,172.27.9.18:21007 |
| topic | STD_QL_JC_SSJC |
| group-id | bridgemind-ql-ssjc-v1 |
| security-protocol | SASL_PLAINTEXT |
| sasl-mechanism | GSSAPI（须现场核实） |
| kerberos-service-name | kafka |
| max-poll-records | 500 |
| batch-size | 200（与 max-poll-records 均限 1–1000） |
| owner-cache-size | 10000 个通道 |
| owner-cache-ttl-seconds | 30 秒 |
| max-poll-interval-ms | 300000 |

固定 enable.auto.commit=false、auto.offset.reset=latest、isolation.level=read_committed。
首次分配无已提交位点的分区，先持久提交起始位置，再处理新消息，避免首条失败重连后跳过。
已有位点正常续传；位点过期或新分区仍执行 latest 策略，上线应监控保留期和积压，避免历史丢失。
每次 poll 按 batch-size 分批；整批 APP_DB 事务提交后，一次同步提交各分区该批最后成功处理的 offset+1。
允许 Kafka 位点有正常间隙，但同分区批内必须递增。任一落库失败整批回滚，不提交本批位点；位点提交失败重连后由唯一键去重。
不足一批立即提交，不等待凑满。此前成功批次不回滚；停止期间未处理的记录保持未提交。
Kafka 配置依据：https://kafka.apache.org/42/javadoc/org/apache/kafka/clients/consumer/KafkaConsumer.html

认证文件使用 CCE Secret 只读挂载。通过 JVM 参数指定 `java.security.auth.login.config` 和
`java.security.krb5.conf`；JAAS 内使用挂载 keytab 与已授权 principal。不得将凭据放入镜像或文档。
验证 broker 广播地址、DNS/KDC、时间同步、topic/group ACL 后启用。模块连接失败独立重试，不阻塞其他服务启动。

## 运维与重处理

`bm_monitor_inbox` 保留原文、key、Kafka 定位、状态和城市/桥梁；禁止将原文输出日志。
`bm_monitor_quarantine` 保留固定原因代码；`bm_monitor_sample` 保留最新业务版本及墓碑。
部署账号需上述表的 SELECT/INSERT/UPDATE/DELETE 权限；普通用户无原文查询权限。首版不自动清理。
内部 Spring 服务 `MonitorStore.reprocess(topic, partition, offset)` 在事务和行锁内重处理隔离记录，
无公共 HTTP 入口；修正元数据或解析器后由受控运维代码调用，不修改原文、不重置消费组。

Micrometer 指标：bridge.monitor.last.success.epoch、bridge.monitor.failures、bridge.monitor.quarantined、bridge.monitor.lag。
计数随进程重启重置，lag=-1 表示未知；跨副本需聚合。隔离存量以数据库为准。
根据实际采样频率测量日增量、保留容量，检查渠道时间索引计划与曲线/全网问答耗时后再放量。
聚合按 250 个有效通道分批查询，不跨库 JOIN；分批读取不保证全网同一瞬时快照。

## 验证和发布

本地单元测试涵盖解析/精度、重复消息、事务回滚、归属歧义、旧版本、确认顺序、初始位点及启用门槛，
并保留曲线权限/城市/缓存/返回值和问答并发回归。它们不替代真实 Kafka 与目标数据库验收。
目标库需核验建表、ON CONFLICT、JDBC 时间/数值映射、事务锁竞争与结果；不得按 PostgreSQL JDBC 推定兼容。
新增来源 SQL 复用现有 BridgeMapper.base，其中 DISTINCT ON、to_jsonb、:: 等扩展仍待生产 Vastbase 验证。
还需现场覆盖 I/U/D、同版本冲突、跨城市同编号、数据库断连、位点提交失败、rebalance、重启、
日期结束边界、NULL 通道、空结果、接口和问答 SSE 完整执行及真实规模性能。

构建：在 backend 运行 mvnw.cmd test package。重新装入新镜像，不用仅前端增量包冒充后端发布。
本次没有修改生产库、启动生产消费、推送或更新生产镜像。Docker 不可用时只能交付 JAR 和部署材料。
回退先关闭消费者；恢复旧查询行为须回滚到旧镜像。保留三张表和消费位点。


区域报警 LATERAL 兼容改写已在提交 6ae33ef 中完成，并通过本地 PostgreSQL 回归；当前分支已包含。仓库尚无生产 Vastbase 完整查询和接口验收通过记录，生产状态待确认。该修复不属于本次 Kafka 模块新增内容。

## 2026-11-04 秒级接入优化与诊断日志

消费者仍默认关闭，未配置 enabled=true，也未连接生产 Kafka。消息契约、分区数与业务键尚待现场确认。

- 接收表使用多行 INSERT ON CONFLICT DO NOTHING RETURNING 精确识别本事务新增消息；不依赖 JDBC 批更新返回值判断重复。
- 同批涉及业务键按固定顺序创建占位并加行锁，一次取出当前版本；内存依序计算 I/U/D、过期及冲突结果，JDBC batchUpdate 写入最终业务版本、隔离记录、接收状态。保留每条消息原文与处理结果；同业务键多个版本仅写最终有效业务行。
- 有效唯一归属缓存30秒、最多10000项，按点位+设备+指标匹配；并发同键加载合并。过期重新查询，查询失败不缓存；缺失/歧义仅在当前批次复用，不跨批缓存。元数据变化最多延迟一个TTL；重处理显式失效对应缓存。
- 本次未修改来源 Mapper SQL，未改变采样业务键或保留策略。新增 APP_DB RETURNING、多行写入及批处理仍需目标排水库验证。

INFO 日志：关闭状态/启动配置、分区分配与撤销、批次UUID与条数、各分区下次提交位点、成功/重复/过期/隔离数量、数据库及位点提交耗时、归属缓存命中/未命中，以及每30秒运行状态和lag。
隔离按固定原因代码汇总；单条定位使用批次位点范围查询受控接收表，不在日志中打印消息内容。
WARN 日志：批次UUID、失败阶段(database或offsetCommit)、耗时、异常因果链类型、SQLState、数据库错误码、应用代码位置、重连间隔。归属查询错误额外标注 MonitoringMapper.resolveChannel。
不打印异常原文或完整 Throwable 堆栈，因为驱动错误可能携带SQL参数、业务原文或认证信息；日志不记录消息key、设备标识、原始JSON、密码、令牌或keytab内容。
Kafka客户端自身日志仍受运行环境日志配置管理；不要开启其认证/网络载荷 DEBUG。批次INFO当前为排障保留，长期上线按流量评估日志留存。

验证：本机独立 PostgreSQL18（仅127.0.0.1:55439/bridge_batch_test）执行真实建表和事务测试，覆盖1000条采样、重复重放、同批版本冲突、墓碑、数据库写失败整批回滚、来源失败回滚及并发版本更新。
1000条独立样本单批本地耗时369ms，归属由测试替身提供、同通道只调用一次；此数值不是端到端Kafka性能指标，也不构成生产秒级吞吐承诺。
集成测试显式开关：在隔离库准备好后运行 `mvnw.cmd -Dbridgemind.batchIntegration=true test`；测试只使用固定本地测试库，不能改指生产库。
未完成真实Kafka重分配/认证/负载、Vastbase兼容及生产压测；未更新生产镜像。仍须验证长期增长与保留策略。

## 服务器只读探测模式（完整消息日志）

此模式已接入应用启动流程，配置后部署/重启即可尝试连接，无需运行本机独立脚本：

```text
BRIDGEMIND_KAFKA_ENABLED=true
BRIDGEMIND_KAFKA_MODE=probe
BRIDGEMIND_KAFKA_PROBE_MAX_RECORDS=3
BRIDGEMIND_KAFKA_PROBE_TIMEOUT_SECONDS=30
BRIDGEMIND_KAFKA_CONTRACT_VERIFIED=false
```

Kafka地址和认证配置沿用上表。probe 模式不要求消息契约已验证，也不调用归属查询或入库服务。
使用 assign + 显式 seek 到当前末尾，只接新消息；不设置 group.id、不订阅消费组、不提交位点、不自动创建topic。
默认最多打印3条，30秒取样窗口包括metadata读取和轮询；认证初始化及关闭连接另有客户端超时。
成功、超时、认证/网络失败后均停止本次探测，不重试、不转入正式消费；每次应用重启/每个副本各探测一次。
无新消息时可能打印0条；需要重试时重启应用。关闭探测设置 ENABLED=false。

日志搜索 `Kafka probe start`、`Kafka probe message`、`Kafka probe complete`、`Kafka probe failed`。
按用户要求，只有该显式模式打印完整消息，不做字段脱敏、不截断。每条输出包含topic、partition、offset、timestamp、
完整keyUtf8/valueUtf8及keyBase64/valueBase64、所有headers（字节值用Base64），可还原非UTF8消息。
消息中的换行和控制字符通过JSON转义，保持单条日志结构；认证配置和凭据不另外打印。
这里是此前“不记录原始消息”规则的显式探测例外，正式consume模式仍不打印消息原文。
应用端不截断，但CCE日志平台可能限制单条大小，应同时核对容器原始日志；日志含完整业务内容，探测完成后关闭模式。

此改动只构建并测试，未部署服务器。保持仓库默认 ENABLED=false，未开启本机或生产消费者。
