# 智能问答增强

实现保留 Dify 分类和回答链路。Java 从现有数据库只读查询并计算，React/Recharts 展示图表；模型仅组织语言。没有导入对方 SQLite、示例数据、综合评分或固定工程处置时限。

## 使用

- 总体问答：地市桥梁数量、BCI/BSI按养护类别分布、病害部位分布，以及病害/维修/巡检月度记录数。
- 单桥问答选择“自动”或“规则回答”。模型未配置或不可用时，规则模式仍可查询；数据库不可用时显示错误，不拿示例数据顶替。
- 规则监测语法：`设备 编码，趋势`；`设备 编码1、编码2，峰值对比`；`设备 编码1、编码2，相关性`。分析词还支持“概况”“阈值”“数据质量”“异常点”。可用明确测点名称替代设备编码。
- 也支持`位移趋势`、`各测点应变峰值对比`、`温度数据质量`等常见指标问法；匹配超过四路时返回候选，不自动挑最不利通道冒充全桥。
- 指定时间：`设备 编码，趋势，2026-10-21T00:00至2026-10-23T00:00`。未指定为最近24小时，时区Asia/Shanghai；最多31天、每通道2000条、最多四路，相关性恰好两路。超过限制要求缩小范围，不静默截断。
- “为什么”“详细一点”“一句话”“有什么建议”复用上一轮证据；“那编码呢”重新查询另一对象。最近三轮完整回答摘要供模型理解上下文；未完成回答不入历史。切换桥梁/页面筛选或新对话清空范围。
- 规则解析是受限语法。无法完整识别复杂条件时明确询问，不丢弃未知条件后扩大查询。

## 计算口径

- 峰值为绝对峰值；保留带符号最小/最大值及各自时间。无效读数不参与统计，图上保留断点，重复时间在主图上显示断点。
- 趋势按真实时间小时数最小二乘拟合，至少三个不同时间点。MAD统计异常要求至少六个样本且MAD非零，稳健Z>3.5；只标记统计异常，不判断结构异常。
- 相关性按固定30分钟时间桶均值配对，至少六组且双方方差非零；Pearson相关系数不代表因果。
- 来源阈值为**当前最新有效快照中的独立区间**，不受读数日期筛选，未验证其在历史时段是否生效；边界包含约定未提供。分别报告低于下限、高于上限、恰在边界的样本数；它们不是报警数。缺失、倒置、零宽或极值占位区间不自动参与比较，不合并同级多区间，不用legacy字段补齐。
- 同指标同单位才能比较峰值；混合指标/单位的时程主图只绘首组，其他通道保留统计并说明。未知单位明确提示。
- 样本不足不等于正常；未配置预期采样频率，不计算缺测率。历史报警、来源评价和当前时段分析分开表达，不生成综合健康分。

## 接口与部署

`POST /api/v1/agent/ask` 增加可选 `answerMode: auto|rule`，默认auto。现有请求保持兼容。服务端计划增加可选 `monitoring: {analysis,targets,metric,from,to}`，模型给出候选，服务端校验对象归属、范围与数量。

SSE保留meta/plan/evidence/delta/replace/done/error，新增source（engine/message）和visualization（type/title/scope/period/source/truncated/series/rows/references）。图表只使用后端结果。模型失败使用replace完整替换半截回答；停止生成不触发降级。显式UTF-8编码，保留CSRF和Session隔离。

`GET /api/v1/agent/status` 保留configured/dataMode，增加ruleAvailable、enhanced、modelConfigured、classifierConfigured。configured表示密钥配置，不代表上游可达。

默认开启增强功能；设置 `BRIDGEMIND_AGENT_ENHANCED=false` 并重启后端可关闭增强、规则兜底和监测分析，恢复模型必需模式。无需数据库迁移。服务日志记录分类/回答降级、查询耗时和请求总耗时，不记录密钥或原始问题。

提示词源文件为 `dify-classifier-prompt.txt` 与 `dify-answer-prompt.txt`。

```powershell
# 仅同步导入用DSL中的提示词，保留其他配置
python scripts/sync-agent-prompts.py
# 本地Dify已运行时，仅更新既有应用提示词，不修改模型或凭据
python scripts/sync-agent-prompts.py --apply-local
```

本地更新前各应用配置备份至runtime/dify-before-qa-enhancement-*.json（忽略提交）。内网部署导入新的DSL或更新既有应用提示词，并保留环境的供应商/模型绑定。旧版0.3.0迁移包为已有独立交付资料，不自动覆盖。

## 验证

```powershell
cd backend
.\mvnw.cmd test
cd ..\frontend
pnpm lint
pnpm test
pnpm build
pnpm exec playwright test e2e/agent.spec.ts
cd ..
python scripts/verify-agent-enhancement.py
# Dify已更新后增加真实模型验证
python scripts/verify-agent-enhancement.py --model
```

验证脚本使用只读源连接及带CSRF的应用接口，选择实际存在的监测读数与桥梁，核对源样本数、图表、缺数和追问；结果保存在runtime/agent-enhancement-evidence.json。2026-11-01已核验来源读数3000条、181个设备，时间2026-10-21至2026-10-22；不能再沿用旧README“读数表为空”的历史描述。不修改来源数据。

2026-11-01完成验证：

- 后端普通测试55例通过；显式开启AgentSourceIntegrationTest与PhaseTwoSourceIntegrationTest，额外3例通过。合计58例通过、0失败，其他12个与本次范围无关的来源集成例未开启。后端package成功。
- 前端5例单元测试、lint与build通过；构建仍有既存的大包体积提示。
- 浏览器8例通过：6例问答回归、1例真实数据库监测曲线/规则追问、1例真实Dify逐段显示。真实模型浏览器测试明确断言来源为Dify模型，不能用降级回答冒充成功。
- `verify-agent-stream.py`验证非业务问题分流、全网131座桥梁、追问扬州43座及单桥病害汇总。总体与扬州追问实测首段约1.4～1.6秒，环境和模型负载变化时不作为性能承诺。
- `verify-agent-enhancement.py --model`验证真实趋势及7个追加场景：解释追问复用证据、无读数、阈值表、数据质量、异常点、同指标峰值对比、相关性；全部要求模型回答，不接受规则降级。选定设备33个样本与数据库一致；双通道相关性为19组配对、r约0.784256，散点图与回答引用同一后端结果。阈值只作当前快照参考，不能声称历史时段生效。

证据保存在runtime/agent-enhancement-evidence.json、runtime/agent-stream-live.json、runtime/dify-model-verification.json；截图为runtime/agent-enhancement-live-ui.png和runtime/agent-stream-live-browser.png。文件均留在本地忽略目录。

此前Docker启动的dockerInference文件访问错误已不再阻塞：本轮开始检查时Docker已经恢复，Server为29.5.3，Dify项目12个容器中11个正常运行，初始化权限容器以0退出；有健康检查的API、数据库、Redis、sandbox均正常。没有重建或重置数据卷。已成功执行`sync-agent-prompts.py --apply-local`，分类和回答应用均保留既有deepseek-flash模型与凭据，提示词与仓库源文件一致；真实模型联调已完成。


## 重点问答：整体数据情况与养护方案

总体和单桥面板新增两个快捷问题，自动模型和规则模式均可使用，并保留页面桥梁筛选。分类主题分别为 `data_overview` 与 `maintenance_plan`。可使用“2026-01-01至2026-10-31整体数据情况”，随后追问“养护方案”；业务日期仅约束巡检、病害、维修和读数，档案、评价及设备配置仍为当前快照。综合主题拒绝混用单业务状态、部位、程度、记录详情或报警等级，避免不同业务套用同一条件。

- 整体数据情况：桥梁及评价底数、巡检/病害/维修全量及实际时间、监测配置和历史读数覆盖、资料缺口、后续建议；后端生成四类数据汇总表，各业务全量统计具有独立引用。
- 养护方案：按同一病害记录的程度与状态交叉生成互斥核查组，给出任务、建议负责角色、完成凭证和最多5条候选。严重/紧急且未完成的历史记录先核实现状，其余按待办、完成验收复核、暂缓复核、状态补齐处理。不是风险评分、批准工单或施工设计，不虚构预算、工法和固定工期。
- 监测覆盖读取当前有效关联通道中的历史记录，包含非数值记录；不能等同在线率或有效分析样本。未查询报警明细、报告正文，不将其当成零。

复验：`python scripts/verify-agent-focus.py`（规则）或追加 `--model`（强制断言Dify实际回答），覆盖总体/单桥各两个问题，并核对任务分组合计。结果保存至 `runtime/agent-focus-evidence.json`。浏览器 `pnpm exec playwright test e2e/agent-focus.spec.ts` 回放真实联调证据，检查两个快捷入口和表格。源库边界测试为 `AgentSourceIntegrationTest#focusGroupsAndCoverageRespectScopeAndDates`，需显式设置 `-Dbridgemind.sourceIntegration=true`，核验空范围、未来日期、当前配置保留及分组数量。所有来源访问只读。

本次重点问答验证：后端56例普通测试通过，另1例只读源库边界测试通过；前端5例单元测试、lint和build通过。总体/单桥各2个真实Dify模型场景共4例全部通过（无规则降级），规则模式同样4例通过。浏览器6例原问答回归加2例重点问答证据回放通过；回放用于页面检查，不冒充浏览器实时模型调用。真实数据底数为131座桥、23345条巡检、722条病害、484条维修、3000条读数；养护互斥组为81/183/458条，合计722。查询源库多次聚合，响应耗时受源库和模型负载影响。超过6项的来源列表折叠展示，可展开追溯。单桥重点问答移除原始评价编码，仅向模型提供明确的BCI/BSI等级名称，避免将编码7误写成“技术等级7”。
