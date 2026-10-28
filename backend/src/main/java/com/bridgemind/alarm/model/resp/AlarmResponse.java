package com.bridgemind.alarm.model.resp;

import java.time.LocalDateTime;

/**
 * 来源报警事件；处置状态不等同于测点恢复，未知持续时间不推算。
 */
public record AlarmResponse(String id, String bridgeId, String bridgeName, String cityCode, LocalDateTime time,
                            String name, String metric, String level, Double value, String threshold,
                            String handlingStatus, LocalDateTime handledAt,
                            @com.fasterxml.jackson.annotation.JsonIgnore long matchingTotal) {
}
