package com.bridgemind.alarm.controller;

import com.bridgemind.alarm.service.AlarmService;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.common.ApiResponse;

import java.time.*;

import org.springframework.web.bind.annotation.*;

/**
 * 区域或单桥报警分页查询，未指定时间时返回最新来源记录。
 */
@RestController
@RequestMapping("/api/v1/alarms")
public class AlarmController {
    private final AlarmService service;

    public AlarmController(AlarmService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<?> list(@ModelAttribute BridgeFilter filter, @RequestParam(required = false) String bridgeId, @RequestParam(required = false) String level,
                               @RequestParam(required = false) LocalDateTime from, @RequestParam(required = false) LocalDateTime to, @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        if (from == null && to == null)
            return ApiResponse.ok(service.list(filter, bridgeId, level, null, null, page, size));
        var end = to == null ? LocalDateTime.now(ZoneId.of("Asia/Shanghai")) : to;
        return ApiResponse.ok(service.list(filter, bridgeId, level, from == null ? end.minusDays(7) : from, end, page, size));
    }
}
