package com.bridgemind.work.service;

import com.bridgemind.common.PageResponse;
import com.bridgemind.work.mapper.QualityMapper;
import com.bridgemind.work.model.*;

import java.time.*;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.stereotype.Service;

/**
 * 来源只读质量核查；汇总缓存五分钟并公开核查时间。
 */
@Service
public class QualityService {
    public static final Map<String, String> ISSUES = Map.ofEntries(
            Map.entry("MISSING_IDENTIFIER", "记录标识或地市缺失"), Map.entry("MISSING_BRIDGE_KEY", "桥梁关联字段缺失"),
            Map.entry("UNMATCHED_BRIDGE", "无法关联有效桥梁"), Map.entry("AMBIGUOUS_BRIDGE", "桥梁归属有歧义"),
            Map.entry("MISSING_DATE", "业务日期缺失"), Map.entry("FUTURE_DATE", "业务日期晚于当前日期"),
            Map.entry("MISSING_SYNC_TIME", "同步时间缺失"), Map.entry("MISSING_DETAILS", "业务必需信息缺失"),
            Map.entry("UNKNOWN_CODE", "业务编码未识别"), Map.entry("UNKNOWN_SYNC_STATUS", "同步状态未识别"),
            Map.entry("RECTIFIED_BEFORE_MAINTENANCE", "整改日期早于养护日期"));

    public record Assessment(String kind, String city, String scope, String basis, OffsetDateTime checkedAt,
                             int cacheSeconds, QualityProfile profile, QualityRelations relations,
                             Map<String, String> issueLabels) {
    }

    private final QualityMapper mapper;
    private final Map<String, Assessment> cache = new ConcurrentHashMap<>();

    public QualityService(QualityMapper mapper) {
        this.mapper = mapper;
    }

    private static String city(String value) {
        value = value == null ? "" : value.strip();
        if (!value.isEmpty() && !value.matches("32[0-9]{4}")) throw new IllegalArgumentException("地市编码不正确");
        return value;
    }

    public Assessment profile(String kind, String city) {
        WorkKind.parse(kind);
        city = city(city);
        String key = kind + ":" + city;
        var existing = cache.get(key);
        if (existing != null && existing.checkedAt().plusMinutes(5).isAfter(OffsetDateTime.now())) return existing;
        var now = OffsetDateTime.now(ZoneId.of("Asia/Shanghai"));
        var result = new Assessment(kind, city, "RAW_IMPORT", "仅核查当前有有效关联监测设备的桥梁所关联原始行，包含其历史版本和删除行；歧义按完整有效底数判断。此处行数不等于单桥最新有效业务记录数。", now, 300, mapper.profile(kind, city), kind.equals("patrols") ? null : mapper.relations(city), ISSUES);
        cache.put(key, result);
        return result;
    }

    public PageResponse<QualityIssue> issues(String kind, String city, String issue, int page, int size) {
        WorkKind.parse(kind);
        city = city(city);
        issue = issue == null ? "" : issue;
        if (!issue.isEmpty() && !ISSUES.containsKey(issue)) throw new IllegalArgumentException("核查类型不支持");
        if (page < 1 || page > 100000 || size < 1 || size > 100) throw new IllegalArgumentException("分页范围不正确");
        var rows = mapper.issues(kind, city, issue, size, (page - 1) * size);
        long total = rows.isEmpty() ? (page == 1 ? 0 : mapper.issueCount(kind, city, issue)) : rows.getFirst().matchingTotal();
        return new PageResponse<>(rows, total, page, size);
    }
}
