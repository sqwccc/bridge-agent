package com.bridgemind.agent;

import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.work.model.WorkFilter;
import java.util.*;

/** Model output is a proposal, never SQL or an executable instruction. */
public record AgentPlan(String route, String topic, BridgeFilter bridgeFilter, WorkFilter workFilter,
                        String recordId, String level, String clarification) {
    public AgentPlan {
        if (!Set.of("business_query", "domain_knowledge", "greeting_help", "unsupported", "out_of_scope", "clarification_required").contains(route))
            throw new IllegalArgumentException("问题分类无效，请明确问题后重试");
        topic = topic == null ? "overview" : topic;
        if (!Set.of("overview", "bridges", "archive", "patrols", "defects", "maintenance", "alarms", "monitoring", "reports", "quality").contains(topic))
            throw new IllegalArgumentException("暂不支持此查询类型");
        bridgeFilter = bridgeFilter == null ? new BridgeFilter(null, null, null, null) : bridgeFilter;
        workFilter = workFilter == null ? WorkFilter.all() : workFilter;
        recordId = recordId == null ? "" : recordId.strip();
        level = level == null ? "" : level;
        if (recordId.length() > 100 || !Set.of("", "1", "2", "3").contains(level)) throw new IllegalArgumentException("查询参数无效");
        if (clarification != null && clarification.length() > 500) throw new IllegalArgumentException("澄清文本过长");
    }
}
