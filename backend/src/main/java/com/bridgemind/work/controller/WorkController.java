package com.bridgemind.work.controller;

import com.bridgemind.common.ApiResponse;
import com.bridgemind.report.controller.ReportController;
import com.bridgemind.work.model.WorkFilter;
import com.bridgemind.work.service.WorkDictionary;
import com.bridgemind.work.service.WorkService;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;

@RestController
@RequestMapping("/api/v1/bridges/{bridgeId}/records")
public class WorkController {
    private final WorkService service;

    public WorkController(WorkService service) {
        this.service = service;
    }

    @GetMapping("/{kind}")
    public ApiResponse<?> list(@PathVariable String bridgeId, @PathVariable String kind, @ModelAttribute WorkFilter filter,
                               @RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(service.list(bridgeId, kind, filter, page, size));
    }

    @GetMapping("/{kind}/{recordId}")
    public ApiResponse<?> detail(@PathVariable String bridgeId, @PathVariable String kind, @PathVariable String recordId) {
        return ApiResponse.ok(service.detail(bridgeId, kind, recordId));
    }

    @GetMapping("/{kind}/{recordId}/attachments/{attachmentId}/file")
    public ResponseEntity<byte[]> file(@PathVariable String bridgeId, @PathVariable String kind, @PathVariable String recordId, @PathVariable String attachmentId,
                                       @RequestParam(defaultValue = "false") boolean download) {
        return ReportController.response(service.file(bridgeId, kind, recordId, attachmentId), download);
    }
}
