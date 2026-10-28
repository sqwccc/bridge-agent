package com.bridgemind.monitoring.service;

import com.bridgemind.monitoring.mapper.MonitoringMapper;
import com.bridgemind.monitoring.model.resp.*;
import com.bridgemind.bridge.service.BridgeService;

import java.time.*;
import java.util.*;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import org.springframework.stereotype.Service;

/**
 * 限制单次历史查询范围和点数；截断标记要求用户缩小区间。
 */
@Service
public class MonitoringService {
    private final MonitoringMapper mapper;
    private final BridgeService bridges;
    record Scope(String bridgeId, String cityCode) {}
    private final Cache<Scope, List<MonitorPointResponse>> pointSnapshots;

    @org.springframework.beans.factory.annotation.Autowired
    public MonitoringService(MonitoringMapper mapper, BridgeService bridges) {
        this(mapper, bridges, Caffeine.newBuilder().maximumSize(256)
                .expireAfterWrite(Duration.ofSeconds(30)).build());
    }

    MonitoringService(MonitoringMapper mapper, BridgeService bridges,
                      Cache<Scope, List<MonitorPointResponse>> pointSnapshots) {
        this.mapper = mapper;
        this.bridges = bridges;
        this.pointSnapshots = pointSnapshots;
    }

    private List<MonitorPointResponse> points(Scope scope) {
        // Cache only validated metadata, not samples. Concurrent readers share one load;
        // failures are not cached. City is part of the key to prevent cross-city reuse.
        return pointSnapshots.get(scope, key -> mapper.points(key.bridgeId()).stream()
                .map(MonitorPointResponse::withReferenceUnit).toList());
    }

    private Scope scope(String id) {
        return new Scope(id, bridges.require(id).cityCode());
    }

    public List<MonitorPointResponse> points(String id) {
        return points(scope(id));
    }

    public List<ThresholdResponse> thresholds(String id, String point, String device, String metric) {
        var scope = scope(id);
        if (point != null && !point.isBlank() && (device == null || device.isBlank()))
            throw new IllegalArgumentException("筛选点位时需提供设备");
        var available = points(scope);
        if (device != null && !device.isBlank() && available.stream().noneMatch(p -> p.deviceId().equals(device)
                && (point == null || point.isBlank() || p.pointId().equals(point))
                && (metric == null || metric.isBlank() || Objects.equals(p.metric(), metric))))
            throw new IllegalArgumentException("设备不属于本桥或指标不匹配");
        var selected = available.stream().filter(p ->
                (device == null || device.isEmpty() || p.deviceId().equals(device))
                && (point == null || point.isEmpty() || p.pointId().equals(point))
                && (metric == null || metric.isEmpty() || Objects.equals(p.metric(), metric))).toList();
        return selected.isEmpty() ? List.of() : mapper.thresholdsForPoints(scope.cityCode(), selected);
    }

    public Map<String, Object> samples(String id, String point, String device, String metric, LocalDateTime from, LocalDateTime to) {
        validateRange(from, to);
        var scope = scope(id);
        if (points(scope).stream().noneMatch(p -> p.pointId().equals(point) && p.deviceId().equals(device) && Objects.equals(p.metric(), metric)))
            throw new IllegalArgumentException("设备不属于本桥或指标不匹配");
        var rows = mapper.samplesForPoint(scope.cityCode(), point, device, metric, from, to);
        var samples = rows.stream().limit(2000).map(s -> new SampleResponse(s.time(), s.rawValue(), numericValue(s.rawValue()))).toList();
        return Map.of("items", samples, "truncated", rows.size() > 2000, "timezone", "Asia/Shanghai");
    }

    /**
     * 支持科学计数法与小数；非数值、NaN、Infinity 保留断点，避免序列化非有限数。
     */
    public static Double numericValue(String raw) {
        if (raw == null || raw.length() > 128) return null;
        try {
            double value = Double.parseDouble(raw.strip());
            return Double.isFinite(value) ? value : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    public static void validateRange(LocalDateTime from, LocalDateTime to) {
        if (from == null || to == null || from.isAfter(to) || Duration.between(from, to).compareTo(Duration.ofDays(31)) > 0)
            throw new IllegalArgumentException("区间最多31日");
    }
}
