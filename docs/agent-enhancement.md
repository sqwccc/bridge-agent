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
- 来源阈值为**独立区间**，边界包含约定未提供。分别报告低于下限、高于上限、恰在边界的样本数；它们不是报警数。缺失、倒置、零宽或极值占位区间不自动参与比较，不合并同级多区间，不用legacy字段补齐。
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

本次验证：后端普通测试70例（55通过、15个需显式开启的来源集成例跳过），额外开启AgentSourceIntegrationTest核查来源聚合；前端单元测试、lint、构建、6例问答浏览器回归及1例真实监测浏览器验收。真实接口验证地市图表合计131座，万福大桥选定设备33个历史样本与数据库一致；同时验证空区间不画假曲线。页面截图保存在runtime/agent-enhancement-live-ui.png。

环境限制：本机Docker Desktop启动失败，日志为dockerInference文件无法访问，127.0.0.1:8090的Dify不可达。已生成并校验更新后的DSL；`--apply-local`未成功更新运行中Dify，真实模型联调尚未完成。恢复Docker/Dify后依次运行上述提示词同步和`verify-agent-enhancement.py --model`。规则链路、自动降级逻辑及模拟上游失败已验证，不能将这些结果表述为真实模型验收。
