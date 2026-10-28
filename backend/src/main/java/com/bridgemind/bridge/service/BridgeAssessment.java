package com.bridgemind.bridge.service;

import java.util.List;

/** 先按养护类别分开评价体系，再判断来源等级是否适用；不推断或修正来源值。 */
public final class BridgeAssessment {
    private BridgeAssessment() {}

    public static String category(Integer value) {
        if (Integer.valueOf(1).equals(value)) return "I";
        return value != null && value >= 2 && value <= 5 ? "II_V" : "unknown";
    }

    public static String bucket(Integer maintenanceCategory, String raw) {
        String code = BridgeDictionary.normalize(raw);
        if (code == null) return "missing";
        if (!BridgeDictionary.validGrade(code)) return "invalid";
        String category = category(maintenanceCategory);
        if (category.equals("unknown")) return "unclassified";
        boolean classOneGrade = code.equals("1") || code.equals("2");
        if (category.equals("I") != classOneGrade) return "conflict";
        return code;
    }

    public static List<String> buckets(String category) {
        return switch (category) {
            case "I" -> List.of("1", "2", "other");
            case "II_V" -> List.of("3", "4", "5", "6", "7", "other");
            default -> List.of("other");
        };
    }

    public static String displayBucket(Integer maintenanceCategory, String raw) {
        String bucket = bucket(maintenanceCategory, raw);
        return List.of("missing", "conflict", "invalid", "unclassified").contains(bucket) ? "other" : bucket;
    }

    public static String categoryLabel(String category) {
        return switch (category) {
            case "I" -> "Ⅰ类养护";
            case "II_V" -> "Ⅱ～Ⅴ类养护";
            default -> "养护类别未明确";
        };
    }

    public static String label(String bucket) {
        return switch (bucket) {
            case "1" -> "合格";
            case "2" -> "不合格";
            case "3" -> "A级";
            case "4" -> "B级";
            case "5" -> "C级";
            case "6" -> "D级";
            case "7" -> "E级";
            case "other" -> "其他";
            case "missing" -> "未提供";
            case "conflict" -> "类别冲突";
            case "invalid" -> "异常编码";
            default -> "等级待核实";
        };
    }
}
