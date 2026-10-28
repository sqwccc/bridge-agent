package com.bridgemind.work.controller;

import com.bridgemind.common.ApiResponse;
import com.bridgemind.work.service.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/data-quality/records")
public class QualityController {
    private final QualityService service;

    public QualityController(QualityService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<?> profile(@RequestParam(defaultValue = "patrols") String kind, @RequestParam(defaultValue = "") String city) {
        return ApiResponse.ok(service.profile(kind, city));
    }

    @GetMapping("/issues")
    public ApiResponse<?> issues(@RequestParam(defaultValue = "patrols") String kind, @RequestParam(defaultValue = "") String city,
                                 @RequestParam(defaultValue = "") String issue, @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(service.issues(kind, city, issue, page, size));
    }

    @GetMapping("/dictionaries")
    public ApiResponse<?> dictionaries() {
        return ApiResponse.ok(WorkDictionary.all());
    }
}
