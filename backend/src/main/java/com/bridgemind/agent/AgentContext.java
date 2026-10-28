package com.bridgemind.agent;

import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.work.service.WorkService;
import com.bridgemind.work.model.WorkFilter;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;

/** Only existing, read-only business projections are supplied to the model. */
@Service
public class AgentContext {
    private final BridgeService bridges;
    private final WorkService work;
    private final JsonMapper json;
    public AgentContext(BridgeService bridges, WorkService work, JsonMapper json) {
        this.bridges = bridges; this.work = work; this.json = json;
    }

    public String build(String bridgeId, boolean demo, LocalDate from, LocalDate to) {
        if (from != null && to != null && from.isAfter(to)) throw new IllegalArgumentException();
        bridges.requireExists(bridgeId);
        var context = new LinkedHashMap<String, Object>();
        context.put("数据模式", demo ? "合成联调样例，与当前真实桥梁无关" : "业务数据库只读查询");
        context.put("查询时间", ZonedDateTime.now(ZoneId.of("Asia/Shanghai")).toString());
        context.put("时间范围", (from == null ? "不限起始日期" : from) + " 至 " + (to == null ? "不限结束日期" : to));
        context.put("口径", "档案为当前快照；日期筛选仅作用于病害和维修。每类最多最新30条，total为该时间范围匹配总数；缺失不等于正常或零。未读取附件。尺寸m、面积m²。不得从样本计算全量比例，不得推断病害已修复，不生成健康评分。不同记录同编号不代表唯一关联。");
        context.put("字段解释", "档案conditionGrade及conditionGradeName是BCI完好状况等级；structureGrade及structureGradeName是BSI结构状况等级。等级已提供不等于分数已提供，不能声称BCI/BSI全部缺失。未提供的是数值分数和综合健康评分。technicalGrade为兼容原始编码，不是独立评分。病害记录不设整改日期或维修类型，不能把不适用字段说成缺失；维修记录不设病害属性，不能据此宣称其病害属性缺失。仅按每种记录实际提供的字段和dataIssues说明缺口。");
        if (demo) {
            context.put("档案", Map.of("来源", "合成档案 DEMO-BRIDGE", "桥名", "联调样例桥（非真实桥梁）", "全长m", 120, "全宽m", 18, "建成年份", "2012", "结构状况BSI", "未提供"));
            var date = LocalDate.of(2026, 10, 1);
            boolean include = (from == null || !date.isBefore(from)) && (to == null || !date.isAfter(to));
            context.put("病害", Map.of("total", include ? 1 : 0, "items", include ? List.of(Map.of("来源", "合成病害 DEMO-D1", "日期", date.toString(), "描述", "伸缩缝局部破损", "严重程度", "未提供")) : List.of()));
            context.put("维修", Map.of("total", 0, "items", List.of()));
        } else {
            // JSON annotations omit internal attachment URLs. Remove archive link fields as well.
            var archive = json.valueToTree(bridges.detail(bridgeId));
            if (archive.get("archive") instanceof tools.jackson.databind.node.ObjectNode node) {
                node.remove("electronicArchive"); node.remove("drawingStatus");
            }
            context.put("档案", archive);
            var filter = new WorkFilter(from, to, null, null, null, null, null, null, null, false);
            for (String kind : List.of("defects", "maintenance")) {
                var page = work.list(bridgeId, kind, filter, 1, 30);
                var fields = kind.equals("defects")
                        ? List.of("id", "code", "occurredAt", "sourceUpdatedAt", "description", "quantity", "location", "zoneName", "itemName", "damageTypeName", "originName", "severityName", "statusName", "note", "attachmentProvided", "dataIssues")
                        : List.of("id", "code", "occurredAt", "sourceUpdatedAt", "unit", "maintenanceTypeName", "statusName", "rectifiedDate", "note", "attachmentProvided", "dataIssues");
                var items = page.items().stream().map(record -> {
                    var tree = json.valueToTree(record);
                    var selected = new LinkedHashMap<String, Object>();
                    for (String field : fields) selected.put(field, tree.get(field));
                    return selected;
                }).toList();
                context.put(kind, Map.of("total", page.total(), "included", items.size(), "truncated", page.total() > items.size(), "items", items));
            }
            context.put("档案来源", "/api/v1/bridges/" + bridgeId);
            context.put("记录来源", "/api/v1/bridges/" + bridgeId + "/records/{defects|maintenance}；按记录id回查");
        }
        String result = json.writeValueAsString(context);
        if (result.length() > 60000) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.PAYLOAD_TOO_LARGE, "资料超过模型上下文限制，请缩小日期范围");
        return result;
    }
}
