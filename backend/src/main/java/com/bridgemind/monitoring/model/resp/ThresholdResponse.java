package com.bridgemind.monitoring.model.resp;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.bridgemind.monitoring.service.MonitoringDictionary;

/**
 * 每一行是来源独立区间，不合并同级区间；原始上下限和历史表达保留。
 */
public record ThresholdResponse(String id, String pointId, String deviceId, String metric, String deviceType,
                                Integer level,
                                BigDecimal upper, BigDecimal lower, String legacyThreshold, String note,
                                LocalDateTime sourceUpdatedAt) {
    private static final BigDecimal EXTREME = new BigDecimal("9999999.999");

    @JsonProperty
    public String metricName() {
        return MonitoringDictionary.name(metric);
    }

    @JsonProperty
    public String unit() {
        return MonitoringDictionary.unit(metric);
    }

    @JsonProperty
    public String unitBasis() {
        return MonitoringDictionary.basis(metric);
    }

    @JsonProperty
    public String levelName() {
        return level == null ? "级别未提供" : switch (level) {
            case 1 -> "一级报警";
            case 2 -> "二级报警";
            case 3 -> "三级报警";
            case 4 -> "正常";
            default -> "未识别级别（" + level + "）";
        };
    }

    @JsonProperty
    public String boundaryConvention() {
        return "UNSPECIFIED";
    }

    @JsonProperty
    public boolean extremePlaceholder() {
        return (upper != null && upper.compareTo(EXTREME) == 0) || (lower != null && lower.compareTo(EXTREME.negate()) == 0);
    }

    @JsonProperty
    public List<String> dataIssues() {
        var issues = new ArrayList<String>();
        if (level == null) issues.add("监测级别未提供");
        else if (level < 1 || level > 4) issues.add("监测级别未在对接字典中定义");
        if (lower == null || upper == null) issues.add("结构化上下限未完整提供，历史阈值保留供核对");
        else if (lower.compareTo(upper) > 0) issues.add("来源下限大于上限，未自动交换");
        if (extremePlaceholder()) issues.add("包含 FAQ 所述极值占位，保留原始数值，不自动解释为无穷");
        return List.copyOf(issues);
    }
}
