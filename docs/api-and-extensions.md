# API 与后续接入

## 单桥部件配置（2026-10-27）

单桥页“编辑部件”管理上部结构、下部结构、桥面系。编辑为草稿，保存后统一生效；关闭未保存草稿需要确认。预览可直接编辑和保存，无需登录（2026-10-28调整）。

- `GET /api/v1/bridges/{id}/structure-config` 返回 `{version,shape,parts}`。未保存时版本为0，模板由后端按现有桥型生成，包含万福专用模板及未知桥型的通用部位。首次保存后按桥独立保存，不因来源桥型改变覆盖人工配置。
- `PUT /api/v1/bridges/{id}/structure-config` 提交完整配置及读取时的版本，使用现有Session和CSRF，允许匿名保存，匿名操作者记录为anonymous。版本过期返回409，前端保留草稿，重新加载需确认放弃草稿。缺少CSRF返回403。
- 部件字段为 `{id,zone,name,description,anchor,bindings}`。稳定UUID标识与名称分离；默认部件的图形关联anchor不可修改，自定义部件anchor为空。删除默认部件后图形保留为背景，不再作为部件选择入口。
- 绑定字段为 `{pointId,deviceId,metric}`，三个字段共同标识序列，metric的null、空字符串和非空值彼此区分。同一序列可以由多个部件共用；保存校验本桥归属，拒绝新增跨桥或失效绑定。已有失效绑定可原样保留以供修复，不能复制到其他部件。
- 允许绑定为空并显示“待绑定测点”。部件选择只展示其绑定序列，部位选择取其所有部件绑定的去重集合；整体、清除选择及“恢复全桥监测”恢复全桥范围。失效绑定明确提示，不以全桥数据替代。
- 自定义部件仅高亮所属部位，标注“部位范围示意”。模板和图形不是实际构件台账，不生成构件编号、精确位置或健康分。

业务库迁移 `V2__bridge_structure.sql` 新增配置版本、部件和绑定三张表。完整保存采用版本比较及事务，批量写入部件和绑定，失败整体回滚。来源数据库保持只读；绑定校验每次最多读取一次本桥测点集合。配置、档案、测点分别加载，前端复用测点查询缓存，配置慢响应不阻塞档案。

每桥最多200个部件，部件名称最多80字符、说明1000字符，每部件最多500个绑定、全桥最多2000个绑定；同部位名称不能重复。

## 总体／单桥流式问答（2026-10-27）

- `GET /api/v1/agent/status` 返回 configured（分类及回答两个应用均有配置）和 dataMode；配置存在不保证上游实时可用。
- `POST /api/v1/agent/ask` 使用Session与CSRF，请求字段 question、scope(network/bridge)、bridgeId、pageFilters(BridgeFilter)、from/to、conversationId。返回 `text/event-stream`，事件 meta/status/plan/evidence/delta/replace/ping/done/error。仅done表示回答成功完成。
- bridge范围由后端锁定ID；network继承页面条件，模型解析只能覆盖允许的字段。模型只输出分类和计划，不提供可执行SQL。Java校验后调用只读Service/Mapper，Dify无数据库连接。
- 当前前端使用新接口；原 `/bridges/{id}/agent/ask` blocking接口保留兼容旧调用。预览模式只有同时开启DIFY_PREVIEW_ACCESS才允许问答POST，CSRF继续生效。
- 分类、业务范围、上限与迁移方式见 [当前Dify接入说明](dify-local.md)。

## 接口约定

统一前缀 `/api/v1`，JSON 响应 `{code,message,data}`。成功 code 为 `OK`；401 表示未登录、403 表示 CSRF/访问校验失败、400 表示无效参数、404 表示不存在、503 表示数据服务不可用。

时间查询采用北京时间本地 ISO 格式，如 `2026-10-01T00:00:00`；服务端和前端均明确标注 `Asia/Shanghai`。不把来源同步时间当成采集时间。

### 当前统一展示范围与分组合并（2026-10-26）

以下规则覆盖下文历史版本中的全量底数和分类口径：

- 全系统仅展示有有效关联监测设备的江苏最新有效桥梁。设备和监测点均先取最新版本并排除删除，同地市下设备 `dwbsm`（点位标识码）匹配监测点 `bsm`（标识码）；监测点 `ssbm`（设施编码）唯一匹配桥梁 `qlid`（桥梁id）或 `qlbh`（桥梁编号）。歧义在完整有效底数上判断，之后才限定有设备范围；有监测点或已建系统标记不等于有设备，不要求设备在线。
- 地图、统计、分页、地市选项、详情、监测、报警、报告、巡检/病害/维修及智能体上下文使用同一范围。无设备桥梁的详情及子资源返回404。质量核查仅包含该范围桥梁关联的原始行，保留其历史版本及删除记录，不再核查全库孤立行。
- 监测分布 `monitoringTypes` 仅返回有效分类1（标准化）、2（轻量化）、0（其他）。来源类型为空且有设备时，仍默认轻量化；其他原始编码合并为其他。`monitoringType=0` 筛选整个其他组；历史 missing 及其他数字筛选值也归并为0。
- 桥型分布 `types` 保留1～6的已知结构类型，空值、98、99及其他异常值合并为99（其他）。`type=99` 筛选整个其他组，历史未知及异常筛选值也归并为99。
- 桥梁响应中的 `type`、`monitoringType`、`reportedMonitoringType` 和 `effectiveMonitoringType` 保留来源/有效原值，展示名称与分布按归并规则显示；数据问题仍保留原始编码依据。BCI/BSI采用下方按养护类别分开的评价分组。

### BCI/BSI按养护类别分组（2026-10-26）

来源为 `dwd_ql_js_ql_inc`（桥梁属性结构表）的 `yhlb`（养护类别）、`qlwhzk`（桥梁完好状况/BCI）、`qljgzk`（桥梁结构状况/BSI）。

- `dashboard` 新增 `conditionGradeCategories`、`structureGradeCategories`，每项为 `{code,label,total,grades:[{code,label,count}]}`。三组固定为 `I`（养护类别1）、`II_V`（养护类别2～5）、`unknown`（养护类别为空或不属于1～5）。组内固定等级顺序并保留零计数。
- Ⅰ类显示1合格/2不合格/other其他；Ⅱ～Ⅴ类显示3～7对应A～E及other其他。未提供、类别冲突、异常编码、类别未明确时的待核实评价统一合并为other，不计入正常等级；养护类别未明确组在页面只显示总数，不显示柱状图或分类按钮，API分组保留用于兼容。内部仍保留缺失/冲突/异常原因及原始值，不反推或修正来源数据。
- `assessmentCategory=I|II_V|unknown` 在统计、地图、列表、报警中共用；与 `maintenanceCategory` 精确筛选独立叠加。`conditionGrade=other`、`structureGrade=other` 匹配对应评价的全部非正常分类；旧数字及missing/conflict/invalid/unclassified细分查询在后端兼容，页面旧状态链接统一按其他查询。图中点击会同时设置评价养护分组和该项等级/状态，再次点击取消两项，并重置分页；URL保存筛选状态。
- 例：`GET /api/v1/dashboard?assessmentCategory=II_V&conditionGrade=other` 查询Ⅱ～Ⅴ类养护桥梁中BCI的其他评价记录。对应桥梁清单使用相同参数调用 `/bridges`。
- 旧 `conditionGrades`、`structureGrades`、`technicalGrades` 数组继续保留来源编码分布供兼容使用；主图使用新的类别分组。
- 城市桥梁健康度统计复用上述分组，与整体技术状况分布同步切换BCI/BSI。Ⅰ类按安全评估结论、Ⅱ～Ⅴ类按A～E等级分别显示环图；环内为本组桥梁座数，悬停占比以本组总数为分母，不折算综合健康分，也不把Ⅰ类合格等同于C级。其他单独计数，养护类别未明确仅显示座数；图例点击采用相同筛选参数，联动地图、列表和统计。接口失败显示错误与重试入口，不作为零座展示。

| 方法 / 路径 | 参数 / 行为 |
|---|---|
| GET `/auth/csrf` | 建立会话并返回 `token/headerName` |
| POST `/auth/login` | `{username,password}`；需先取得并回传 CSRF；成功后更换 Session ID |
| GET `/auth/me` | 当前账号的公开资料 |
| POST `/auth/logout` | 校验 CSRF，销毁会话 |
| GET `/dashboard` | `q/city/type/monitoringType`；同一快照的统计、分组和地图点位 |
| GET `/dashboard/options` | 全省地市选项 |
| GET `/dictionaries/bridges` | 桥型、监测类型、养护类别、跨径、评价等级及生命周期统一字典；`{字典名:[{code,label}]}` |
| GET `/bridges` | 同上筛选；`page` 从1开始，`size` 默认20、最大100 |
| GET `/bridges/{id}` | 桥梁资料；ID 不存在、已删除或无有效关联设备返回404 |
| GET `/bridges/{id}/monitoring/points` | 可明确关联的设备/测点/指标 |
| GET `/bridges/{id}/monitoring/thresholds` | 本桥独立阈值区间，可按 point/device/metric 筛选 |
| GET `/bridges/{id}/monitoring/samples` | `point/device/metric/from/to`；最多31天，最多2000条，额外数据以 `truncated` 提示缩小范围 |
| GET `/alarms` | 同底数筛选及 `bridgeId/level/from/to/page/size`；不传时间时按发生时间倒序返回最新记录；指定历史区间最多31天 |
| GET `/bridges/{id}/reports` | 明确归属的报告及附件状态 |
| GET `/bridges/{id}/reports/{reportId}/file` | 同源 PDF 预览；`download=true` 下载。不存在/未配置返回404，源服务错误返回502 |

报告状态：`AVAILABLE`、`MISSING_ATTACHMENT`、`SOURCE_NOT_CONFIGURED`、`UNSUPPORTED_SOURCE`。`AVAILABLE` 表示地址已具备配置条件，文件打开时仍要校验响应内容。

## FAQ 第一期接口扩展（2026-10-26）

桥梁新增字段：`conditionGrade/conditionGradeName`（BCI 等级编码及名称）、`structureGrade/structureGradeName`（BSI 等级编码及名称）、`maintenanceCategory/maintenanceCategoryName`、`bridgeStatus/bridgeStatusName`、`transferred/transferredName`、`demolished/demolishedName`、`demolitionStatus/demolitionStatusName`、`typeName`。

两个评价编码均为 nullable string，与实际源库 varchar 一致；不转换为数值评分。`technicalGrade` 继续返回原始 BSI 编码。来源非法编码原样返回，名称为未识别编码，`dataIssues[{field,code,message}]` 提供异常编码和类别不匹配等说明。

监测新增 `reportedMonitoringType`、`effectiveMonitoringType`、`effectiveMonitoringTypeName`、`monitoringTypeBasis`、`monitoringSystemBuilt`、`hasMonitoringDevices`。旧 `monitoringType` 保持原值，reportedMonitoringType 是其显式别名。basis 取值 REPORTED / DEVICE_DEFAULT / UNRECOGNIZED / MISSING。只有类型为 NULL 且关联有效设备才默认轻量化；原值 0 不应用空值规则。设备存在和系统建成均不代表设备在线。

条件字段增加 `conditionGradeStatus`、`structureGradeStatus`、`inspectionDateStatus`、`inspectionReportStatus`，均为 `{status,reason}`。status 取值 PRESENT / ALLOWED_EMPTY / MISSING / UNDETERMINED。`inspectionReportPresent` 仅表示底数 JCBG 有地址；其他检测表的附件不替代这一字段的完整性判断。

大屏保留 `technicalGrades` 原响应，新增 `conditionGrades` 和 `structureGrades` 两套分布、`monitoringDefaulted` 和 `withMonitoringDevices`。`monitored` 按有效监测类型 1/2 计数，不表示当前在线。评价缺失分组 code 为 `missing`；监测分布按有效类型1/2分组，其余合并为0（其他）。

`dashboard`、`bridges`、`alarms` 共用新增筛选参数：

| 参数 | 语义 |
|---|---|
| monitoringType | 按有效监测分类筛选；1/2 为标准化/轻量化；0 匹配其他；历史 missing 及其他数字归并为0 |
| conditionGrade / structureGrade | 来源编码字符串，支持 -9999、98 等异常原值；missing 为空或空白 |
| bridgeStatus | 使用状态编码，0 为正常使用 |
| transferred / demolished | 0/1，明确状态；未传表示不筛选 |
| demolitionStatus | 0/1/2，拆除处理状态 |

监测筛选 `0` 匹配所有非1/2的有效分类；来源类型为空且有设备的桥梁仍按已有默认规则归入2。同一条件同步用于列表、统计、地图与告警归属。`dashboard/options` 保持地市数组兼容，仅返回有设备桥梁所在的地市。dict 接口与业务查询使用相同登录/免登录配置。

## FAQ 第二期接口扩展（2026-10-26）

`GET /bridges/{id}` 保留原有根字段，增加嵌套 `archive` 完整档案。分页桥梁仍保持精简投影，不携带 archive。三特原始标志 `specialBridge`、原始类型文本 `specialTypesRaw`、去重后的 `specialTypeCodes/specialTypeNames` 分开返回；`singleColumnPier`、`spanTypeName` 供列表与详情展示。

所有桥梁相关查询新增参数：`spanType`、`maintenanceCategory`（来源编码或 missing）、`specialTypes`（逗号分隔、任一匹配；missing 表示未登记）、`population=all|normalUse`。原有 bridgeStatus 参数仍接受数值编码，并新增 missing。normalUse 精确定义为正常使用且明确未拆除。大屏增加 `spanTypes/maintenanceCategories/bridgeStatuses/specialTypes`、`normalUse/specialTypesRegistered/specialFlagProvided/singleColumnPiers`；多选三特分组会重叠，不相加为总数。

新增 `GET /bridges/{id}/monitoring/thresholds`，可选 `point/device/metric`。指定点位时必须提供设备；指定设备时验证本桥归属和指标。响应是独立区间数组：`id/pointId/deviceId/metric/metricName/deviceType/level/levelName/lower/upper/unit/unitBasis/legacyThreshold/note/sourceUpdatedAt/boundaryConvention/extremePlaceholder/dataIssues`。缺失上下限为 null，保留倒置值；边界包含方式为 UNSPECIFIED，不计算新的报警等级。

监测 points 新增 `metricName/unitBasis/deviceType/deviceModel/sourceDeviceStatus/sourceUpdatedAt`，unit 由随版本的 FAQ 指标字典提供，未知指标为 null。samples 保留原始值、数值、2000 条截断标识和 31 天限制，无新增插值或聚合。

reports 保留原数组和旧字段，新增 `source/sourceLabel/inspectionId/inspectionType/inspectionTypeName/inspectionDate/sourceUpdatedAt/requirementStatus/statusReason/attachmentKind/attachmentScope/taskId/relatedBridgeCount`。

| source | 含义 |
|---|---|
| BASE_INSPECTION | 底数检测报告提供情况，缺附件也可返回条件说明 |
| PERIODIC_INSPECTION | 定期检测记录，检测类型 1 常规定期 / 2 结构定期 |
| REGULAR_INSPECTION | 本桥常规定检及独立附件索引 |
| BRIDGE_ATTACHMENT | 桥梁图片及其他附件 |
| TASK_ATTACHMENT / TASK_FILE | 共享定检任务附件；scope=TASK，带任务 ID 和涉及桥梁数 |

共享任务文件不会伪装成本桥独立报告。列表只描述提供及配置状态，不预先承诺文件已读取成功。文件接口保持原路径，可预览校验过类型的 PDF 和支持的图片；读取失败沿用 502 等状态，由前端逐条提示。下载和预览都经过同源受保护接口，附件原始 URL 不在 JSON 中返回。

字段类型、数据基线和关联依据见 [第二期核查](phase-two-audit.md)。

## 第三期巡检、病害、维修与质量接口（2026-10-26）

统一响应封装及认证沿用既有接口；免登录预览只开放 GET，关闭 preview 后仍需登录。kind 固定为 `patrols`、`defects`、`maintenance`。

| GET 路径 | 参数 / 响应 |
|---|---|
| `/bridges/{bridgeId}/records/{kind}` | 最新有效来源记录分页，`{items,total,page,size}`，size 默认20、最大100，page 从1起、最大100000 |
| `/bridges/{bridgeId}/records/{kind}/{recordId}` | `{record,attachments,relatedRecords,relationStatus,relationReason}`；不属于本桥、删除或不存在返回404 |
| `/bridges/{bridgeId}/records/{kind}/{recordId}/attachments/{attachmentId}/file` | 可选 `download=true`；来源未配置或附件不存在404，实际读取失败502；沿用报告文件的受保护同源读取规则 |
| `/data-quality/records` | `kind` 默认patrols、可选city；返回scope、basis、checkedAt、cacheSeconds、profile、relations、issueLabels |
| `/data-quality/records/issues` | `kind/city/issue/page/size`；导入原始问题行分页，不将故障转换为空结果 |
| `/data-quality/records/dictionaries` | zones/items/damages/severities/origins/defectStatuses/repairStatuses/maintenanceTypes；各字典为编码到名称的对象 |

单桥列表共同支持：`from/to`（北京时间业务日期 YYYY-MM-DD，结束日期包含整日）、`q`（最长100字，字面量检索编号、描述、内容、隐患等）、`issuesOnly=true`。未指定日期时查询全部历史。病害支持 `status/zone/damageType/severity/defectCode`，维修支持 `status/maintenanceType/defectCode`；defectCode 为同编号精确筛选，最长100字。分类参数接受原始数字编码或 `missing`，未知编码不伪装成默认状态；不适用于所选业务的筛选返回400。开始日期晚于结束日期、无效kind、越界分页返回400。

record 共同字段为 `id/kind/cityCode/bridgeId/bridgeName/sourceBridgeKey/occurredAt/sourceUpdatedAt/syncStatus/note/attachmentProvided/dataIssues`，业务字段见 [三期核查](phase-three-audit.md)。result、hazard、status 等均保留来源空值，接口补充分类名称。内部附件地址和窗口计数字段不进入 JSON。

relatedRecords 是关联候选的前20条及其真实总数，页面可按 defectCode 查看全部。维修关联状态为 UNIQUE / UNMATCHED / AMBIGUOUS / MISSING_KEY；病害列同市同桥同编号的维修候选，状态 SAME_BRIDGE_CODE；巡检为 NOT_APPLICABLE，保留日常巡查标识，不猜测关联的定检或病害。

质量 profile 的 scope 固定为 RAW_IMPORT，仅核查有设备桥梁关联的原始行，包含这些桥梁的重复、历史版本和删除行；归属歧义仍按完整有效底数判断，不包含全库孤立行。profile 汇总缓存300秒，checkedAt 表示核查时间，latestSync 表示来源同步时间。relations 在病害/维修类型下另按最新有效、同市同桥及有设备桥梁范围统计重复病害编号、唯一/多候选/未匹配维修及缺少关联编号的维修；巡检为null。

issue 允许 MISSING_IDENTIFIER、MISSING_BRIDGE_KEY、UNMATCHED_BRIDGE、AMBIGUOUS_BRIDGE、MISSING_DATE、FUTURE_DATE、MISSING_SYNC_TIME、MISSING_DETAILS、UNKNOWN_CODE、UNKNOWN_SYNC_STATUS、RECTIFIED_BEFORE_MAINTENANCE，未指定表示任一已定义问题。地市仅接受江苏6位编码，未指定表示全省。各问题可重叠，不能相加为问题记录总数。

示例：`GET /api/v1/bridges/SGQX009A/records/defects?status=5&size=12`；`GET /api/v1/data-quality/records/issues?kind=patrols&city=320100&issue=UNMATCHED_BRIDGE`。

## 大屏查询性能与缓存

- 桥梁快照按完整规范化筛选条件缓存30秒，最多64组；同条件并发请求合并加载，查询失败不缓存。统计、地市选项和桥梁分页复用快照，分页顺序仍由来源SQL决定，越界空页保留真实总数。
- 报警分页按筛选、桥梁、等级、时间范围、页码和页大小缓存30秒，最多128组。列表使用窗口计数同时返回总数；只有非首页空页补查总数，内部计数字段不进入JSON。
- 缓存从成功加载完成起计算有效期；过期后的请求重新读取来源，不以过期数据掩盖查询错误。前端原有查询缓存及报警60秒轮询仍生效，页面不保证实时展示刚写入的数据。
- 桥梁清单仅在侧栏打开时请求。地图搜索保留全范围点位，因此带搜索条件首次打开会同时读取全范围和匹配范围快照；无搜索条件时前端共用同一个查询。
- 此策略适用于当前大屏需要完整地图点位的规模；扩大到大量桥梁时应评估快照内存、点位传输和独立数据库分页。来源数据库未新增表、索引或写入操作，最新版本选择和设备唯一归属规则保持不变。

## 后续接入边界

- **Dify**：已增加后端集成和单桥问答抽屉，密钥由服务端持有。`GET /api/v1/bridges/{bridgeId}/agent/status` 返回 configured/dataMode；`POST /api/v1/bridges/{bridgeId}/agent/ask` 接收 question/from/to，返回 answer/dataMode/context。每问独立查询并调用 Dify，不跨桥复用会话。细节见 [本地接入说明](dify-local.md)。
- **健康状态**：由外部服务提供桥梁/部位/构件标识、评分、等级、时间和解释依据；与来源技术状况字段分开保存/展示。接入后再启用健康环图、重点关注排名及地图健康色标。
- **BIM**：通过明确桥梁 ID 关联模型，模型服务确定构件唯一 ID；当前未生成假构件、假模型和模拟传感器位置。
- **监测实时性**：现阶段按查询窗口读数据库，不宣称实时推送。需要实时数据时先补充来源采集时间、单位、数据质量标志，再决定轮询或消息流。
- **报告服务**：若来源采用 FTP、签名下载或独立身份认证，增加服务端适配器；不要允许浏览器传任意 URL 给下载代理。

一期没有账号管理后台、报警处置写入、健康评分算法、报告生成或数据同步调度。


### 单桥与地图悬停性能（2026-10-27）

- 单桥存在性校验复用 `BridgeService` 的无筛选30秒快照，监测、报告、报警和档案请求共享加载；到期重新核验，失败不缓存。保持全量底数判歧义后再筛选有效监测设备的规则。
- 档案扩展在服务完成可见性校验后调用内部 `archiveForVisible`，仅读取当前 `qlid`，保留与全量查询一致的最新记录排序及删除/地市规则；原 `archive` 保留作为只读核对依据。该内部查询不可绕过服务直接对外提供。
- 悬停档案与单桥页面统一使用 `bridgeQuery`，共享30秒新鲜期及在途请求；标点停留150ms后才触发查询，无观察者的请求通过 AbortSignal 取消。
- 本地实测：修复前档案接口约3.3～3.9秒；修复后冷加载2090ms、已有快照时57～62ms。两座桥梁响应与修复前逐字段相同。浏览器悬停至档案可见361ms，点击进入单桥142ms，档案请求共1次。监测点/报告/报警独立接口分别1737/2016/1502ms，不阻塞主档案显示。
- 证据：`runtime/bridge-perf-before.json`、`runtime/bridge-perf-after.json`、`runtime/bridge-browser-performance.json`。后端单元测试、真实库只读档案核对及 `e2e/bridge-performance.spec.ts` 通过；性能数字为本机样本，不作为生产环境SLA。
