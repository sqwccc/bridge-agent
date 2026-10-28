package com.bridgemind.report.model.resp;

import java.time.LocalDateTime;

/**
 * 报告可用状态不是附件已经下载成功的保证；打开时继续校验实际文件。
 */
public record ReportResponse(String id, String name, String type, LocalDateTime time, String status, boolean pdf,
                             String source, String sourceLabel, String inspectionId, Integer inspectionType,
                             String inspectionTypeName,
                             LocalDateTime sourceUpdatedAt, String requirementStatus, String statusReason,
                             String attachmentKind,
                             String attachmentScope, String taskId, Integer relatedBridgeCount) {
    @com.fasterxml.jackson.annotation.JsonProperty
    public LocalDateTime inspectionDate() {
        return time;
    }
}
