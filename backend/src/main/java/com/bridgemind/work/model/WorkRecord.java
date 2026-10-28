package com.bridgemind.work.model;

import com.bridgemind.work.service.WorkDictionary;
import com.bridgemind.report.service.ReportAttachments;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.*;
import java.util.*;

/**
 * 一行表示一条最新有效来源记录；附件地址只在服务端解析。
 */
public record WorkRecord(String id, String kind, String cityCode, String bridgeId, String bridgeName,
                         String sourceBridgeKey,
                         LocalDateTime occurredAt, LocalDateTime sourceUpdatedAt, String syncStatus, String taskId,
                         String code, String unit, String itemText, String method, String content, String result,
                         String hazard,
                         Integer zone, Integer item, Integer damageType, Integer origin, Integer severity,
                         Integer status,
                         String description, String quantity, String location, Integer maintenanceType,
                         LocalDate rectifiedDate,
                         String note, @JsonIgnore String attachmentRaw, @JsonIgnore Long matchingTotal) {
    @JsonProperty
    public String zoneName() {
        return WorkDictionary.label(WorkDictionary.ZONES, zone);
    }

    @JsonProperty
    public String itemName() {
        return WorkDictionary.label(WorkDictionary.ITEMS, item);
    }

    @JsonProperty
    public String damageTypeName() {
        return WorkDictionary.label(WorkDictionary.DAMAGES, damageType);
    }

    @JsonProperty
    public String originName() {
        return WorkDictionary.label(WorkDictionary.ORIGINS, origin);
    }

    @JsonProperty
    public String severityName() {
        return WorkDictionary.label(WorkDictionary.SEVERITIES, severity);
    }

    @JsonProperty
    public String statusName() {
        return WorkDictionary.label(kind.equals("maintenance") ? WorkDictionary.REPAIR_STATUSES : WorkDictionary.DEFECT_STATUSES, status);
    }

    @JsonProperty
    public String maintenanceTypeName() {
        return WorkDictionary.label(WorkDictionary.MAINTENANCE_TYPES, maintenanceType);
    }

    @JsonProperty
    public boolean attachmentProvided() {
        return !ReportAttachments.empty(attachmentRaw) && !attachmentRaw.strip().equals("[]");
    }

    @JsonProperty
    public List<String> dataIssues() {
        var issues = new ArrayList<String>();
        if (occurredAt == null) issues.add("业务日期未提供");
        else if (occurredAt.toLocalDate().isAfter(LocalDate.now(ZoneId.of("Asia/Shanghai"))))
            issues.add("业务日期晚于当前日期");
        if (sourceUpdatedAt == null) issues.add("同步时间未提供");
        if (syncStatus != null && !syncStatus.isBlank() && !Set.of("I", "U").contains(syncStatus))
            issues.add("同步状态未识别：" + syncStatus);
        if (kind.equals("patrols")) {
            if (result == null || result.isBlank()) issues.add("检查结果未提供，不能据此判断正常");
        } else {
            if (code == null || code.isBlank()) issues.add("病害编号未提供，无法追溯关联");
            check(issues, "处理状态", status, WorkDictionary.DEFECT_STATUSES, false);
            if (kind.equals("defects")) {
                check(issues, "桥梁部位", zone, WorkDictionary.ZONES, false);
                check(issues, "损坏类型", damageType, WorkDictionary.DAMAGES, true);
                check(issues, "损坏程度", severity, WorkDictionary.SEVERITIES, false);
                check(issues, "病害来源", origin, WorkDictionary.ORIGINS, false);
                check(issues, "巡检项", item, WorkDictionary.ITEMS, true);
                if (description == null || description.isBlank()) issues.add("病害描述未提供");
            } else {
                check(issues, "养护类型", maintenanceType, WorkDictionary.MAINTENANCE_TYPES, false);
                if (occurredAt != null && rectifiedDate != null && rectifiedDate.isBefore(occurredAt.toLocalDate()))
                    issues.add("整改日期早于养护日期，需核查业务时间含义");
            }
        }
        return List.copyOf(issues);
    }

    private static void check(List<String> issues, String name, Integer code, Map<Integer, String> dict, boolean other) {
        if (code == null) issues.add(name + "未提供");
        else if (!dict.containsKey(code) && !(other && code == 99)) issues.add(name + "编码未识别：" + code);
    }
}
