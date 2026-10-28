package com.bridgemind.monitoring.controller;

import com.bridgemind.monitoring.service.MonitoringService;
import com.bridgemind.common.ApiResponse;

import java.time.LocalDateTime;

import org.springframework.web.bind.annotation.*;

/**
 * 登录后按桥梁、设备、指标读取历史监测值。
 */
@RestController
@RequestMapping("/api/v1/bridges/{id}/monitoring")
public class MonitoringController {
    private final MonitoringService service;

    public MonitoringController(MonitoringService service) {
        this.service = service;
    }

    @GetMapping("/points")
    public ApiResponse<?> points(@PathVariable String id) {
        return ApiResponse.ok(service.points(id));
    }

    @GetMapping("/thresholds")
    public ApiResponse<?> thresholds(@PathVariable String id, @RequestParam(required = false) String point,
                                     @RequestParam(required = false) String device, @RequestParam(required = false) String metric) {
        return ApiResponse.ok(service.thresholds(id, point, device, metric));
    }

    @GetMapping("/samples")
    public ApiResponse<?> samples(@PathVariable String id, @RequestParam String point, @RequestParam String device, @RequestParam(required = false) String metric, @RequestParam LocalDateTime from, @RequestParam LocalDateTime to) {
        return ApiResponse.ok(service.samples(id, point, device, metric, from, to));
    }
}
