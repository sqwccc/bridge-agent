# Dify 问答诊断日志

本次改动增加故障定位日志，不代表生产 Dify 配置或连接问题已修复。需要重新构建并部署后端 JAR 才会生效；只更新前端无效。

在 CCE 容器日志中搜索 `agent failure`、`agent classifier failure` 或 `dify failure`。使用同一个 `requestId` 关联浏览器 SSE error 和后端日志。该编号沿用问答会话 ID，多轮问题需要结合日志时间区分。

| 字段或日志 | 含义 |
| --- | --- |
| `stage=classification` | 问题分类调用失败 |
| `stage=planning` | 分类结果转为查询计划时失败 |
| `stage=evidence` | 查询业务数据或准备证据失败 |
| `stage=generation` | 回答生成失败 |
| `classification-fallback` / `generation-fallback` | 对应阶段失败后进入规则降级 |
| `upstreamStatus` | Dify 实际返回的 HTTP 状态码 |
| `status` | 应用异常对应的 HTTP 状态码，可能与 Dify 状态码不同 |
| `type` | 异常类型，可区分超时、连接或解析异常 |
| `reason=invalid_plan` | 分类应用的答案不能解析为合法查询计划 |
| `reason=empty_answer` | Dify 未返回有效答案 |
| `reason=upstream_error_event` | Dify 在 HTTP 200 流内发送错误事件 |
| `reason=incomplete_stream` | 流结束时缺少完成事件 |

日志不输出 API Key、Cookie、问题正文、业务上下文、上游响应正文或异常原文。上游返回 200 仍可能生成失败；`agent/status` 的 `configured=true` 只说明密钥非空，不证明连通性和模型可用性。

验证命令：在 backend 目录执行 `mvn -B "-Dtest=DifyDiagnosticsTest,AgentFallbackTest,AgentIntegrationTest" test`。
