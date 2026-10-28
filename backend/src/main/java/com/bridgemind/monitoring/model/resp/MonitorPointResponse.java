package com.bridgemind.monitoring.model.resp;

/**
 * 测点和设备形成一条可查询序列；unit 缺失表示来源未提供单位。
 */
public record MonitorPointResponse(String pointId, String pointName, String deviceId, String deviceName, String metric,
                                   String unit,
                                   String deviceType, String deviceModel, Integer sourceDeviceStatus,
                                   java.time.LocalDateTime sourceUpdatedAt) {
    public MonitorPointResponse(String pointId, String pointName, String deviceId, String deviceName, String metric, String unit) {
        this(pointId, pointName, deviceId, deviceName, metric, unit, null, null, null, null);
    }

    @com.fasterxml.jackson.annotation.JsonProperty
    public String metricName() {
        return com.bridgemind.monitoring.service.MonitoringDictionary.name(metric);
    }

    @com.fasterxml.jackson.annotation.JsonProperty
    public String unitBasis() {
        return unit == null ? "UNAVAILABLE" : com.bridgemind.monitoring.service.MonitoringDictionary.basis(metric);
    }

    public MonitorPointResponse withReferenceUnit() {
        return new MonitorPointResponse(pointId, pointName, deviceId, deviceName, metric,
                com.bridgemind.monitoring.service.MonitoringDictionary.unit(metric), deviceType, deviceModel, sourceDeviceStatus, sourceUpdatedAt);
    }
}
