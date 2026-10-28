package com.bridgemind.report.controller;

import com.bridgemind.report.service.ReportService;
import com.bridgemind.common.ApiResponse;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;

/**
 * 报告按桥梁授权上下文查询，附件接口不接受任意 URL 参数。
 */
@RestController
@RequestMapping("/api/v1/bridges/{id}/reports")
public class ReportController {
    private final ReportService service;

    public ReportController(ReportService service) {
        this.service = service;
    }

    @GetMapping
    public ApiResponse<?> list(@PathVariable String id) {
        return ApiResponse.ok(service.list(id));
    }

    @GetMapping("/{reportId}/file")
    public ResponseEntity<byte[]> file(@PathVariable String id, @PathVariable String reportId, @RequestParam(defaultValue = "false") boolean download) {
        var file = service.file(id, reportId);
        return response(file, download);
    }

    public static ResponseEntity<byte[]> response(ReportService.FileContent file, boolean download) {
        var disposition = ((file.pdf() || file.mediaType().startsWith("image/")) && !download ? ContentDisposition.inline() : ContentDisposition.attachment()).filename(file.name(), StandardCharsets.UTF_8).build();
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(file.mediaType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString()).header("X-Content-Type-Options", "nosniff").cacheControl(CacheControl.noStore()).body(file.bytes());
    }
}
