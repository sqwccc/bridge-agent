package com.bridgemind.bridge.controller;

import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

/**
 * 已登录用户的桥梁底数查询入口。
 */
@RestController
@RequestMapping("/api/v1/bridges")
public class BridgeController {
    private final BridgeService service;

    public BridgeController(BridgeService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<?> page(@ModelAttribute BridgeFilter filter, @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(service.page(filter, page, size));
    }

    @GetMapping("/{id}")
    public ApiResponse<?> find(@PathVariable String id) {
        return ApiResponse.ok(service.detail(id));
    }
}
