package com.bridgemind.report.controller;
import com.bridgemind.report.service.MonitoringReportService;
import com.bridgemind.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDate;
@RestController
@RequestMapping("/api/v1/bridges/{id}/monitoring-report")
public class MonitoringReportController {
    private final MonitoringReportService service;
    public MonitoringReportController(MonitoringReportService service){this.service=service;}
    @GetMapping public ApiResponse<?> generate(@PathVariable String id,@RequestParam LocalDate from,@RequestParam LocalDate to) {
        return ApiResponse.ok(service.generate(id,from,to));
    }
}
