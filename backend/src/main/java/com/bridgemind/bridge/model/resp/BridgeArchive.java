package com.bridgemind.bridge.model.resp;

import com.bridgemind.bridge.service.BridgeDictionary;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;

/**
 * 仅详情加载的档案字段，尺寸单位 m、面积单位 m²；异常数值保留来源。
 */
public record BridgeArchive(String districtCode, Integer bridgeClass, Integer useClass, Integer roadGrade,
                            Integer maintenanceLevel,
                            Integer spanCount, String spanArrangement, Double maxSpan, Double deckArea, String material,
                            String mainGirder,
                            String loadGrade, String designLoad, String actualLoad, String loadLimit,
                            Boolean singleColumnPier, String singleColumnPierCount,
                            String constructionUnit, String designUnit, String supervisionUnit, String contractor,
                            String overview,
                            Integer ageBand, String reconstructionDate, Double costTenThousand, String archiveCode,
                            String drawingStatus, String electronicArchive,
                            LocalDateTime sourceUpdatedAt) {
    @JsonProperty
    public String bridgeClassName() {
        return BridgeDictionary.label("bridgeClasses", bridgeClass);
    }

    @JsonProperty
    public String useClassName() {
        return BridgeDictionary.label("useClasses", useClass);
    }

    @JsonProperty
    public String roadGradeName() {
        return BridgeDictionary.label("roadGrades", roadGrade);
    }

    @JsonProperty
    public String maintenanceLevelName() {
        return BridgeDictionary.label("maintenanceLevels", maintenanceLevel);
    }

    @JsonProperty
    public String mainGirderName() {
        return BridgeDictionary.label("mainGirders", mainGirder);
    }

    @JsonProperty
    public String materialName() {
        if (material == null || material.isBlank()) return "未提供";
        return java.util.Arrays.stream(material.split(",")).map(String::strip).filter(s -> !s.isEmpty()).map(c -> BridgeDictionary.label("materials", c)).collect(java.util.stream.Collectors.joining("、"));
    }

    @JsonProperty
    public String loadGradeName() {
        return sourceLabel("loadGrades", loadGrade);
    }

    @JsonProperty
    public String loadLimitName() {
        return sourceLabel("loadLimits", loadLimit);
    }

    private static String sourceLabel(String dictionary, String raw) {
        return raw != null && !raw.isBlank() && !raw.strip().matches("[0-9]+") ? "来源文本：" + raw : BridgeDictionary.label(dictionary, raw);
    }
}
