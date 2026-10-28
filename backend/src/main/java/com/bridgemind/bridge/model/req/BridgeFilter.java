package com.bridgemind.bridge.model.req;

import com.bridgemind.bridge.service.BridgeDictionary;

/**
 * 地市采用来源编码；桥型99和监测类型0表示归并后的其他组。空字符串代表全部。
 */
public record BridgeFilter(String q, String city, Integer type, String monitoringType,
                           String conditionGrade, String structureGrade, String bridgeStatus,
                           Integer transferred, Integer demolished, Integer demolitionStatus,
                           String spanType, String maintenanceCategory, String specialTypes, String population,
                           String assessmentCategory) {
    public BridgeFilter(String q, String city, Integer type, String monitoringType, String conditionGrade, String structureGrade,
                        String bridgeStatus, Integer transferred, Integer demolished, Integer demolitionStatus,
                        String spanType, String maintenanceCategory, String specialTypes, String population) {
        this(q, city, type, monitoringType, conditionGrade, structureGrade, bridgeStatus, transferred, demolished, demolitionStatus,
                spanType, maintenanceCategory, specialTypes, population, null);
    }
    public BridgeFilter(String q, String city, Integer type, String monitoringType) {
        this(q, city, type, monitoringType, null, null, null, null, null, null, null, null, null, null);
    }

    public BridgeFilter(String q, String city, Integer type, String monitoringType, String conditionGrade, String structureGrade,
                        Integer bridgeStatus, Integer transferred, Integer demolished, Integer demolitionStatus) {
        this(q, city, type, monitoringType, conditionGrade, structureGrade, bridgeStatus == null ? null : bridgeStatus.toString(), transferred, demolished, demolitionStatus, null, null, null, null);
    }

    public BridgeFilter {
        q = q == null ? "" : q.strip();
        city = city == null ? "" : city.strip();
        if (q.length() > 100 || (!city.isEmpty() && !city.matches("32[0-9]{4}"))) throw new IllegalArgumentException();
        monitoringType = normalizeCode(monitoringType);
        if (type != null) type = BridgeDictionary.typeGroup(type);
        if (!monitoringType.isEmpty()) {
            monitoringType = switch (monitoringType) {
                case "1", "2" -> monitoringType;
                default -> "0";
            };
        }
        conditionGrade = normalizeGrade(conditionGrade);
        structureGrade = normalizeGrade(structureGrade);
        assessmentCategory = assessmentCategory == null ? "" : assessmentCategory.strip();
        if (!java.util.Set.of("", "I", "II_V", "unknown").contains(assessmentCategory))
            throw new IllegalArgumentException("评价养护类别无效");
        bridgeStatus = normalizeCode(bridgeStatus);
        spanType = normalizeCode(spanType);
        maintenanceCategory = normalizeCode(maintenanceCategory);
        specialTypes = specialTypes == null ? "" : specialTypes.strip();
        if (!specialTypes.isEmpty() && !specialTypes.equals("missing") && !specialTypes.matches("[0-9]{1,3}(,[0-9]{1,3})*"))
            throw new IllegalArgumentException("三特类型无效");
        population = population == null || population.isBlank() ? "all" : population.strip();
        if (!population.equals("all") && !population.equals("normalUse"))
            throw new IllegalArgumentException("桥梁范围无效");
        if (transferred != null && transferred != 0 && transferred != 1)
            throw new IllegalArgumentException("移交状态无效");
        if (demolished != null && demolished != 0 && demolished != 1)
            throw new IllegalArgumentException("拆除状态无效");
        if (demolitionStatus != null && (demolitionStatus < 0 || demolitionStatus > 2))
            throw new IllegalArgumentException("拆除处理状态无效");
    }

    private static String normalizeCode(String raw) {
        if (raw == null || raw.isBlank()) return "";
        String value = raw.strip();
        if (!value.equals("missing") && !value.matches("-?[0-9]{1,8}"))
            throw new IllegalArgumentException("筛选编码无效");
        return value;
    }

    private static String normalizeGrade(String raw) {
        String value = raw == null ? "" : raw.strip();
        return java.util.Set.of("other", "conflict", "invalid", "unclassified").contains(value) ? value : normalizeCode(value);
    }
}
