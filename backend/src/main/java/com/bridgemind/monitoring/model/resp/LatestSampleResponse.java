package com.bridgemind.monitoring.model.resp;

import java.time.LocalDateTime;

public record LatestSampleResponse(String pointId, String deviceId, String metric, LocalDateTime latestAt) {}
