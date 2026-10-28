package com.bridgemind.monitoring.service;

import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * 随版本保存的 FAQ「实时监测指标」桥梁编码和单位；不推断未知指标。
 */
public final class MonitoringDictionary {
    public record Metric(String code, String deviceType, String name, String unit) {
    }

    private static final Map<String, Metric> METRICS;

    static {
        var metrics = new LinkedHashMap<String, Metric>();
        try (var input = MonitoringDictionary.class.getResourceAsStream("/reference/bridge-metrics.tsv")) {
            if (input == null) throw new IllegalStateException("桥梁指标参考未找到");
            for (String line : new String(input.readAllBytes(), StandardCharsets.UTF_8).split("\\R")) {
                if (line.isBlank() || line.startsWith("#")) continue;
                var p = line.split("\t", -1);
                metrics.put(p[0], new Metric(p[0], p[1], p[2], p[3]));
            }
        } catch (java.io.IOException e) {
            throw new ExceptionInInitializerError(e);
        }
        METRICS = Collections.unmodifiableMap(metrics);
    }

    private MonitoringDictionary() {
    }

    public static String name(String code) {
        var m = METRICS.get(code);
        return m == null ? (code == null ? "指标未提供" : "未识别指标（" + code + "）") : m.name();
    }

    public static String unit(String code) {
        var m = METRICS.get(code);
        return m == null ? null : m.unit();
    }

    public static String basis(String code) {
        return METRICS.containsKey(code) ? "FAQ_2026" : "UNAVAILABLE";
    }
}
