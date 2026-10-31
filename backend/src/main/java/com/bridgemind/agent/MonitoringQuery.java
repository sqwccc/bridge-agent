package com.bridgemind.agent;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;
import com.bridgemind.monitoring.service.MonitoringService;

/** Candidate names are resolved against this bridge's metadata, never treated as SQL. */
public record MonitoringQuery(String analysis, List<String> targets, String metric,
                              LocalDateTime from, LocalDateTime to) {
    public MonitoringQuery {
        analysis = analysis == null ? "summary" : analysis;
        if (!Set.of("summary", "trend", "compare", "correlation", "thresholds", "quality", "anomaly").contains(analysis))
            throw new IllegalArgumentException("监测分析类型无效");
        targets = targets == null ? List.of() : List.copyOf(targets);
        if (targets.size() > 4 || targets.stream().anyMatch(s -> s.isBlank() || s.length() > 100))
            throw new IllegalArgumentException("请明确最多四个测点或设备");
        metric = metric == null ? "" : metric.strip();
        if (metric.length() > 100) throw new IllegalArgumentException("指标过长");
        if ((from == null) != (to == null)) throw new IllegalArgumentException("请同时提供监测开始和结束时间");
        if (from != null) MonitoringService.validateRange(from, to);
    }
}
