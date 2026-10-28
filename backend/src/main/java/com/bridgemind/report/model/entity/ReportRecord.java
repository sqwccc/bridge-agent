package com.bridgemind.report.model.entity;

import java.time.LocalDateTime;

/**
 * 来源报告元数据；path 仅供服务端取件，禁止暴露数据库原始地址。
 */
public record ReportRecord(String id, String name, String type, LocalDateTime time, String path,
                           String source, String inspectionId, Integer inspectionType, LocalDateTime sourceUpdatedAt,
                           String taskId, Integer relatedBridgeCount) {
    public ReportRecord(String id, String name, String type, LocalDateTime time, String path, String source, String inspectionId, Integer inspectionType, LocalDateTime sourceUpdatedAt) {
        this(id, name, type, time, path, source, inspectionId, inspectionType, sourceUpdatedAt, null, null);
    }

    public ReportRecord(String id, String name, String type, LocalDateTime time, String path) {
        this(id, name, type, time, path, "UNSPECIFIED", null, null, null);
    }

    public ReportRecord attachment(String suffix, String fileName, String filePath) {
        return new ReportRecord(id + suffix, fileName == null || fileName.isBlank() ? name : fileName, type, time, filePath, source, inspectionId, inspectionType, sourceUpdatedAt, taskId, relatedBridgeCount);
    }
}
