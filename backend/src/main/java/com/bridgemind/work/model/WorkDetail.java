package com.bridgemind.work.model;

import com.bridgemind.common.PageResponse;
import com.bridgemind.report.model.resp.ReportResponse;

import java.util.List;

public record WorkDetail(WorkRecord record, List<ReportResponse> attachments,
                         PageResponse<WorkRecord> relatedRecords, String relationStatus, String relationReason) {
}
