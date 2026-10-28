package com.bridgemind.dashboard.controller;

import com.bridgemind.dashboard.service.DashboardService;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

/**
 * 省级大屏统计和点位使用完全相同的过滤条件。
 */
@RestController
@RequestMapping("/api/v1/dashboard")
public class DashboardController {
    private final DashboardService service;

    public DashboardController(DashboardService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<?> summary(@ModelAttribute BridgeFilter filter) {
        return ApiResponse.ok(service.summary(filter));
    }

    @GetMapping("/options")
    public ApiResponse<?> options() {
        return ApiResponse.ok(service.cities());
    }
}
