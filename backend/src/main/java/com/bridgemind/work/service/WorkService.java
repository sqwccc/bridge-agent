package com.bridgemind.work.service;

import com.bridgemind.work.mapper.WorkMapper;
import com.bridgemind.work.model.*;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.common.PageResponse;
import com.bridgemind.report.model.entity.ReportRecord;
import com.bridgemind.report.service.ReportService;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@Service
public class WorkService {
    private final WorkMapper mapper;
    private final BridgeService bridges;
    private final ReportService files;

    public WorkService(WorkMapper mapper, BridgeService bridges, ReportService files) {
        this.mapper = mapper;
        this.bridges = bridges;
        this.files = files;
    }

    public static void validate(WorkKind kind, WorkFilter filter, int page, int size) {
        if (page < 1 || page > 100000 || size < 1 || size > 100) throw new IllegalArgumentException("分页范围不正确");
        if (kind == WorkKind.patrols && (!filter.status().isEmpty() || !filter.zone().isEmpty() || !filter.damageType().isEmpty() || !filter.severity().isEmpty() || !filter.maintenanceType().isEmpty() || !filter.defectCode().isEmpty()))
            throw new IllegalArgumentException("巡检不支持此筛选条件");
        if (kind == WorkKind.defects && !filter.maintenanceType().isEmpty())
            throw new IllegalArgumentException("病害不支持养护类型筛选");
        if (kind == WorkKind.maintenance && (!filter.zone().isEmpty() || !filter.damageType().isEmpty() || !filter.severity().isEmpty()))
            throw new IllegalArgumentException("维修不支持病害属性筛选");
    }

    public PageResponse<WorkRecord> list(String bridgeId, String kind, WorkFilter filter, int page, int size) {
        validate(WorkKind.parse(kind), filter, page, size);
        bridges.requireExists(bridgeId);
        return page(bridgeId, kind, filter, page, size);
    }

    private PageResponse<WorkRecord> page(String bridgeId, String kind, WorkFilter filter, int page, int size) {
        var rows = mapper.list(bridgeId, kind, filter, size, (page - 1) * size);
        long total = rows.isEmpty() ? (page == 1 ? 0 : mapper.count(bridgeId, kind, filter)) : rows.getFirst().matchingTotal();
        return new PageResponse<>(rows, total, page, size);
    }

    private WorkRecord require(String bridgeId, String kind, String id) {
        WorkKind.parse(kind);
        bridges.requireExists(bridgeId);
        var record = mapper.find(bridgeId, kind, id);
        if (record == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "记录不存在、已删除或不属于本桥");
        return record;
    }

    public WorkDetail detail(String bridgeId, String kind, String id) {
        var record = require(bridgeId, kind, id);
        var related = new PageResponse<WorkRecord>(List.of(), 0, 1, 20);
        String state = "NOT_APPLICABLE", reason = "巡检记录保留日常巡查标识；来源未提供与定检或病害的可靠逐条关联";
        if (!kind.equals("patrols")) {
            if (record.code() == null || record.code().isBlank()) {
                state = "MISSING_KEY";
                reason = "未提供病害编号，无法追溯关联";
            } else {
                related = page(bridgeId, kind.equals("defects") ? "maintenance" : "defects", WorkFilter.all().forDefect(record.code()), 1, 20);
                if (kind.equals("maintenance")) {
                    state = related.total() == 1 ? "UNIQUE" : related.total() == 0 ? "UNMATCHED" : "AMBIGUOUS";
                    reason = related.total() == 1 ? "按同市、同桥和病害编号唯一关联" : related.total() == 0 ? "本桥未找到同编号的有效病害记录" : "本桥同一病害编号对应多条记录，仅列候选，不认定唯一病害";
                } else {
                    state = "SAME_BRIDGE_CODE";
                    reason = "按同市、同桥和病害编号列出维修记录；若病害编号重复，关联仍需人工核查";
                }
            }
        }
        return new WorkDetail(record, files.attachments(attachment(record)), related, state, reason);
    }

    public ReportService.FileContent file(String bridgeId, String kind, String id, String attachmentId) {
        return files.attachmentFile(attachment(require(bridgeId, kind, id)), attachmentId);
    }

    private ReportRecord attachment(WorkRecord r) {
        String name = switch (r.kind()) {
            case "patrols" -> "巡检附件";
            case "defects" -> "病害图片";
            default -> "维修后照片";
        };
        return new ReportRecord("attachment", name, name, r.occurredAt(), r.attachmentRaw(), r.kind().toUpperCase(Locale.ROOT), r.id(), null, r.sourceUpdatedAt());
    }
}
