package com.bridgemind.agent;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;

@Service
public class AgentClassifier {
    private final DifyClient client;
    private final JsonMapper json;
    public AgentClassifier(@Value("${bridgemind.dify.base-url:http://127.0.0.1:8090/v1}") String url,
                           @Value("${DIFY_CLASSIFIER_API_KEY:}") String key, JsonMapper json) {
        this.client = new DifyClient(url, key, json); this.json = json;
    }
    public boolean configured() { return client.configured(); }
    public AgentPlan classify(String question, String scope, Object filters, Object history, String user) {
        String context = json.writeValueAsString(Map.of("today", LocalDate.now(ZoneId.of("Asia/Shanghai")),
                "scope", scope, "pageFilters", filters, "previousValidatedPlans", history));
        String answer = client.ask(question, context, user).strip();
        if (answer.startsWith("```")) answer = answer.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
        try {
            var tree = json.readTree(answer);
            if (!tree.isObject()) throw new IllegalArgumentException();
            var plan = json.treeToValue(tree, AgentPlan.class);
            if (scope.equals("bridge") && (!plan.bridgeFilter().q().isEmpty() || !plan.bridgeFilter().city().isEmpty()))
                return new AgentPlan("clarification_required", "overview", null, null, null, null, "单桥问答固定查询当前桥梁；查询其他桥梁请从总体问答进入或切换桥梁。");
            return plan;
        } catch (Exception e) { throw new IllegalArgumentException("未能可靠识别查询条件，请说明桥梁范围、业务类型和日期"); }
    }
}
