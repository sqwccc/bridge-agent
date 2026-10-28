package com.bridgemind.work.model;

import java.time.LocalDate;

/**
 * 日期为业务发生日期，未指定时查询全部历史；空日期保留在未筛选结果中。
 */
public record WorkFilter(LocalDate from, LocalDate to, String status, String zone, String damageType,
                         String severity, String maintenanceType, String q, String defectCode, Boolean issuesOnly) {
    public WorkFilter {
        if (from != null && to != null && from.isAfter(to))
            throw new IllegalArgumentException("开始日期不能晚于结束日期");
        status = code(status);
        zone = code(zone);
        damageType = code(damageType);
        severity = code(severity);
        maintenanceType = code(maintenanceType);
        q = q == null ? "" : q.strip();
        defectCode = defectCode == null ? "" : defectCode.strip();
        if (q.length() > 100 || defectCode.length() > 100) throw new IllegalArgumentException("筛选文字过长");
        issuesOnly = Boolean.TRUE.equals(issuesOnly);
    }

    private static String code(String value) {
        value = value == null ? "" : value.strip();
        if (!value.isEmpty() && !value.equals("missing") && !value.matches("-?[0-9]{1,6}"))
            throw new IllegalArgumentException("筛选编码不正确");
        return value;
    }

    public static WorkFilter all() {
        return new WorkFilter(null, null, null, null, null, null, null, null, null, false);
    }

    public WorkFilter forDefect(String code) {
        return new WorkFilter(null, null, null, null, null, null, null, null, code, false);
    }
}
