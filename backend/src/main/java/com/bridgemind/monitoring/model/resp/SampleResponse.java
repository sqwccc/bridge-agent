package com.bridgemind.monitoring.model.resp;

import java.time.LocalDateTime;

/**
 * 保留原始值，非数值不转零；时间采用来源采集时间，不用同步时间冒充。
 */
public record SampleResponse(LocalDateTime time, String rawValue, Double value) {
}
