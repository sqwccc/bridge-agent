package com.bridgemind.dashboard.service;

import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.bridge.service.BridgeDictionary;
import com.bridgemind.bridge.service.BridgeAssessment;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.model.resp.BridgeResponse;
import com.bridgemind.dashboard.model.resp.DashboardResponse;
import com.bridgemind.dashboard.model.resp.DashboardResponse.*;

import java.util.*;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.stereotype.Service;

/**
 * 在单次底数快照上聚合，避免多个 SQL 时间差或关联倍增导致计数不一致。
 */
@Service
public class DashboardService {
    private final BridgeService bridges;

    public DashboardService(BridgeService bridges) {
        this.bridges = bridges;
    }

    public List<Group> cities() {
        return bridges.cities();
    }

    public DashboardResponse summary(BridgeFilter filter) {
        var rows = bridges.all(filter);
        var points = rows.stream().filter(DashboardService::validCoordinate).map(b -> new Point(b.id(), b.name(), b.cityCode(), b.longitude(), b.latitude(),
                BridgeAssessment.displayBucket(b.maintenanceCategory(), b.conditionGrade()),
                BridgeAssessment.displayBucket(b.maintenanceCategory(), b.structureGrade()))).toList();
        return new DashboardResponse(rows.size(), points.size(), rows.stream().filter(b -> Objects.equals(b.effectiveMonitoringType(), 1) || Objects.equals(b.effectiveMonitoringType(), 2)).count(),
                rows.stream().map(BridgeResponse::sourceUpdatedAt).filter(Objects::nonNull).max(Comparator.naturalOrder()).orElse(null),
                group(rows, BridgeResponse::cityCode, b -> b.city()), group(rows, b -> Integer.toString(BridgeDictionary.typeGroup(b.type())), BridgeResponse::typeName),
                group(rows, b -> Integer.toString(BridgeDictionary.monitoringGroup(b.effectiveMonitoringType())), BridgeResponse::effectiveMonitoringTypeName),
                group(rows, b -> b.technicalGrade() == null ? "unknown" : b.technicalGrade(), b -> b.technicalGrade() == null ? "未提供" : "来源编码 " + b.technicalGrade()), points,
                group(rows, b -> gradeCode(b.conditionGrade()), BridgeResponse::conditionGradeName),
                group(rows, b -> gradeCode(b.structureGrade()), BridgeResponse::structureGradeName),
                rows.stream().filter(b -> b.monitoringTypeBasis().equals("DEVICE_DEFAULT")).count(),
                rows.stream().filter(BridgeResponse::hasMonitoringDevices).count(),
                group(rows, b -> nullableCode(b.spanType()), BridgeResponse::spanTypeName),
                group(rows, b -> nullableCode(b.maintenanceCategory()), BridgeResponse::maintenanceCategoryName),
                group(rows, b -> nullableCode(b.bridgeStatus()), BridgeResponse::bridgeStatusName), specialGroups(rows),
                rows.stream().filter(BridgeResponse::normalUse).count(), rows.stream().filter(BridgeResponse::hasRegisteredSpecialType).count(),
                rows.stream().filter(b -> b.specialBridge() != null).count(), rows.stream().filter(b -> Boolean.TRUE.equals(b.singleColumnPier())).count(),
                gradeCategories(rows, BridgeResponse::conditionGrade), gradeCategories(rows, BridgeResponse::structureGrade));
    }

    private List<GradeCategory> gradeCategories(List<BridgeResponse> rows, Function<BridgeResponse, String> grade) {
        return List.of("I", "II_V", "unknown").stream().map(category -> {
            var selected = rows.stream().filter(b -> BridgeAssessment.category(b.maintenanceCategory()).equals(category)).toList();
            var counts = selected.stream().collect(Collectors.groupingBy(b -> BridgeAssessment.displayBucket(b.maintenanceCategory(), grade.apply(b)), Collectors.counting()));
            var groups = BridgeAssessment.buckets(category).stream().map(code -> new Group(code, BridgeAssessment.label(code), counts.getOrDefault(code, 0L))).toList();
            return new GradeCategory(category, BridgeAssessment.categoryLabel(category), selected.size(), groups);
        }).toList();
    }

    private static String nullableCode(Integer value) {
        return value == null ? "missing" : value.toString();
    }

    private List<Group> specialGroups(List<BridgeResponse> rows) {
        var counts = new TreeMap<String, Long>();
        for (var b : rows) for (var code : b.specialTypeCodes()) counts.merge(code, 1L, Long::sum);
        return counts.entrySet().stream().map(e -> new Group(e.getKey(), BridgeDictionary.label("specialTypes", e.getKey()), e.getValue())).toList();
    }

    private static String gradeCode(String value) {
        String code = BridgeDictionary.normalize(value);
        return code == null ? "missing" : code;
    }

    public static boolean validCoordinate(BridgeResponse b) {
        return b.longitude() != null && b.latitude() != null && Double.isFinite(b.longitude()) && Double.isFinite(b.latitude()) && b.longitude() >= -180 && b.longitude() <= 180 && b.latitude() >= -90 && b.latitude() <= 90 && !(b.longitude() == 0 && b.latitude() == 0);
    }

    private List<Group> group(List<BridgeResponse> rows, Function<BridgeResponse, String> key, Function<BridgeResponse, String> label) {
        return rows.stream().collect(Collectors.groupingBy(key)).entrySet().stream()
                .map(e -> new Group(e.getKey(), label.apply(e.getValue().getFirst()), e.getValue().size()))
                .sorted(Comparator.comparingLong(Group::count).reversed().thenComparing(Group::code)).toList();
    }
}
