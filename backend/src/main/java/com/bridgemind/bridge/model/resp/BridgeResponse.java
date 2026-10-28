package com.bridgemind.bridge.model.resp;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

import com.bridgemind.bridge.service.BridgeDictionary;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * 来源桥梁只读投影；长度/宽度单位米，坐标保留来源经纬度，技术状况为原始编码。
 */
public record BridgeResponse(String id, String code, String name, String cityCode, String city,
                             Integer type, Integer spanType, Integer monitoringType, String road, Double length,
                             Double width,
                             Double longitude, Double latitude, String technicalGrade, String inspectionDate,
                             String completedDate, String manager, String maintainer, LocalDateTime sourceUpdatedAt,
                             String conditionGrade, String structureGrade, Integer maintenanceCategory,
                             Integer bridgeStatus,
                             Integer transferred, Integer demolished, Integer demolitionStatus,
                             Boolean monitoringSystemBuilt,
                             Integer effectiveMonitoringType, boolean hasMonitoringDevices,
                             boolean inspectionReportPresent,
                             Integer specialBridge, String specialTypesRaw, Boolean singleColumnPier) {
    public BridgeResponse(String id, String code, String name, String cityCode, String city, Integer type, Integer spanType, Integer monitoringType,
                          String road, Double length, Double width, Double longitude, Double latitude, String technicalGrade, String inspectionDate, String completedDate,
                          String manager, String maintainer, LocalDateTime sourceUpdatedAt, String conditionGrade, String structureGrade, Integer maintenanceCategory,
                          Integer bridgeStatus, Integer transferred, Integer demolished, Integer demolitionStatus, Boolean monitoringSystemBuilt, Integer effectiveMonitoringType,
                          boolean hasMonitoringDevices, boolean inspectionReportPresent) {
        this(id, code, name, cityCode, city, type, spanType, monitoringType, road, length, width, longitude, latitude, technicalGrade, inspectionDate, completedDate,
                manager, maintainer, sourceUpdatedAt, conditionGrade, structureGrade, maintenanceCategory, bridgeStatus, transferred, demolished, demolitionStatus,
                monitoringSystemBuilt, effectiveMonitoringType, hasMonitoringDevices, inspectionReportPresent, null, null, null);
    }

    @JsonProperty
    public List<String> specialTypeCodes() {
        return specialTypesRaw == null ? List.of() : java.util.Arrays.stream(specialTypesRaw.split(",")).map(String::strip).filter(s -> !s.isEmpty()).distinct().toList();
    }

    @JsonProperty
    public List<String> specialTypeNames() {
        return specialTypeCodes().stream().map(c -> BridgeDictionary.label("specialTypes", c)).toList();
    }

    @JsonProperty
    public String spanTypeName() {
        return BridgeDictionary.label("spanTypes", spanType);
    }

    @JsonProperty
    public boolean normalUse() {
        return Integer.valueOf(0).equals(bridgeStatus) && Integer.valueOf(0).equals(demolished);
    }

    public boolean hasRegisteredSpecialType() {
        return specialTypeCodes().stream().anyMatch(c -> List.of("1", "2", "3").contains(c));
    }

    @JsonProperty
    public Integer reportedMonitoringType() {
        return monitoringType;
    }

    @JsonProperty
    public String monitoringTypeBasis() {
        if (monitoringType != null) return monitoringType == 1 || monitoringType == 2 ? "REPORTED" : "UNRECOGNIZED";
        return hasMonitoringDevices ? "DEVICE_DEFAULT" : "MISSING";
    }

    @JsonProperty
    public String typeName() {
        return BridgeDictionary.label("types", BridgeDictionary.typeGroup(type));
    }

    @JsonProperty
    public String conditionGradeName() {
        return BridgeDictionary.label("grades", conditionGrade);
    }

    @JsonProperty
    public String structureGradeName() {
        return BridgeDictionary.label("grades", structureGrade);
    }

    @JsonProperty
    public String maintenanceCategoryName() {
        return BridgeDictionary.label("maintenanceCategories", maintenanceCategory);
    }

    @JsonProperty
    public String bridgeStatusName() {
        return BridgeDictionary.label("bridgeStatuses", bridgeStatus);
    }

    @JsonProperty
    public String effectiveMonitoringTypeName() {
        return BridgeDictionary.label("monitoringTypes", BridgeDictionary.monitoringGroup(effectiveMonitoringType));
    }

    @JsonProperty
    public String transferredName() {
        return BridgeDictionary.label("transferred", transferred);
    }

    @JsonProperty
    public String demolishedName() {
        return BridgeDictionary.label("demolished", demolished);
    }

    @JsonProperty
    public String demolitionStatusName() {
        return BridgeDictionary.label("demolitionStatuses", demolitionStatus);
    }

    public record FieldStatus(String status, String reason) {
    }

    private FieldStatus requirement(boolean present) {
        if (present) return new FieldStatus("PRESENT", "来源已提供");
        var reasons = new ArrayList<String>();
        if (Integer.valueOf(1).equals(transferred)) reasons.add("已移交");
        if (Integer.valueOf(1).equals(demolished)) reasons.add("已拆除");
        if (Integer.valueOf(1).equals(demolitionStatus)) reasons.add("拆除处理中");
        if (!reasons.isEmpty())
            return new FieldStatus("ALLOWED_EMPTY", String.join("、", reasons) + "，按对接备注允许为空");
        if (!List.of(0, 1).contains(transferred == null ? -1 : transferred)
                || !List.of(0, 1).contains(demolished == null ? -1 : demolished)
                || !List.of(0, 1, 2).contains(demolitionStatus == null ? -1 : demolitionStatus))
            return new FieldStatus("UNDETERMINED", "生命周期状态未提供或无法识别，无法确定是否必填");
        return new FieldStatus("MISSING", "当前条件应提供，来源未提供");
    }

    @JsonProperty
    public FieldStatus conditionGradeStatus() {
        return requirement(BridgeDictionary.normalize(conditionGrade) != null);
    }

    @JsonProperty
    public FieldStatus structureGradeStatus() {
        return requirement(BridgeDictionary.normalize(structureGrade) != null);
    }

    @JsonProperty
    public FieldStatus inspectionDateStatus() {
        return requirement(BridgeDictionary.normalize(inspectionDate) != null);
    }

    @JsonProperty
    public FieldStatus inspectionReportStatus() {
        return requirement(inspectionReportPresent);
    }

    public FieldStatus missingInspectionReportStatus() {
        return requirement(false);
    }

    public record DataIssue(String field, String code, String message) {
    }

    private void gradeIssues(List<DataIssue> issues, String field, String raw) {
        String code = BridgeDictionary.normalize(raw);
        if (code == null) return;
        if (!BridgeDictionary.validGrade(code)) {
            issues.add(new DataIssue(field, "UNRECOGNIZED_CODE", "评价编码未在当前对接字典中定义：" + code));
            return;
        }
        int grade = Integer.parseInt(code);
        if (maintenanceCategory != null && ((maintenanceCategory == 1 && grade >= 3)
                || (maintenanceCategory >= 2 && maintenanceCategory <= 5 && grade <= 2)))
            issues.add(new DataIssue(field, "CATEGORY_GRADE_CONFLICT", "评价等级与养护类别不匹配，保留来源编码"));
    }

    @JsonProperty
    public List<DataIssue> dataIssues() {
        var issues = new ArrayList<DataIssue>();
        gradeIssues(issues, "conditionGrade", conditionGrade);
        gradeIssues(issues, "structureGrade", structureGrade);
        if ("UNRECOGNIZED".equals(monitoringTypeBasis()))
            issues.add(new DataIssue("reportedMonitoringType", "UNRECOGNIZED_CODE", "监测类型未在对接字典中定义，未应用空值默认规则"));
        if (Boolean.FALSE.equals(monitoringSystemBuilt) && hasMonitoringDevices)
            issues.add(new DataIssue("monitoringSystemBuilt", "MONITORING_EVIDENCE_CONFLICT", "来源标记未建监测系统，但存在有效关联设备"));
        if (Boolean.TRUE.equals(monitoringSystemBuilt) && monitoringType == null && !hasMonitoringDevices)
            issues.add(new DataIssue("reportedMonitoringType", "MISSING_MONITORING_TYPE", "来源标记已建监测系统，但类型为空且无有效设备作为默认依据"));
        return List.copyOf(issues);
    }
}
