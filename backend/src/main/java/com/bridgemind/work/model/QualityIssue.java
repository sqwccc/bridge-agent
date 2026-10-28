package com.bridgemind.work.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonIgnore;

import java.time.LocalDateTime;
import java.util.List;

public record QualityIssue(String id, String cityCode, String sourceBridgeKey, String bridgeId,
                           LocalDateTime occurredAt, LocalDateTime sourceUpdatedAt, String syncStatus,
                           String issueCodes, @JsonIgnore Long matchingTotal) {
    @JsonProperty
    public List<String> issues() {
        return issueCodes == null || issueCodes.isBlank() ? List.of() : List.of(issueCodes.split(","));
    }
}
