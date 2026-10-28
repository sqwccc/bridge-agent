package com.bridgemind;

import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.model.resp.BridgeResponse;
import com.bridgemind.bridge.service.BridgeDictionary;
import com.bridgemind.bridge.service.BridgeAssessment;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.bridge.mapper.BridgeMapper;
import com.bridgemind.dashboard.service.DashboardService;

import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BridgeRulesTest {
    private BridgeResponse bridge(String condition, String structure, Integer category, Integer transferred,
                                  Integer demolished, Integer demolitionStatus, Integer raw, Integer effective, boolean devices) {
        return new BridgeResponse("a", "a", "桥梁", "320100", "南京市", 6, 1, raw, null, 1.0, 1.0, 118.0, 32.0,
                structure, null, null, null, null, null, condition, structure, category, 0, transferred, demolished, demolitionStatus,
                false, effective, devices, false);
    }

    @Test
    void gradesAreIndependentAndNeverTurnUnknownCodesIntoScores() {
        var b = bridge("4", "5", 3, 0, 0, 0, null, null, false);
        assertEquals("Ⅱ～Ⅴ类：B级", b.conditionGradeName());
        assertEquals("Ⅱ～Ⅴ类：C级", b.structureGradeName());
        assertTrue(b.dataIssues().isEmpty());
        assertEquals("其他特殊结构桥梁", b.typeName());
        var invalid = bridge("98", "-9999", 3, 0, 0, 0, 0, 0, false);
        assertEquals("98", invalid.conditionGrade());
        assertEquals("-9999", invalid.structureGrade());
        assertEquals(3, invalid.dataIssues().size());
        assertFalse(BridgeDictionary.validGrade("-9999"));
        assertEquals(2, bridge("3", "7", 1, 0, 0, 0, null, null, false).dataIssues().size());
        assertEquals(2, bridge("1", "2", 3, 0, 0, 0, null, null, false).dataIssues().size());
    }

    @Test
    void missingFieldsExplainConditionalExemptionsAndIncompleteLifecycle() {
        assertEquals("MISSING", bridge(null, null, 3, 0, 0, 0, null, null, false).conditionGradeStatus().status());
        for (Integer[] lifecycle : List.of(new Integer[]{1, 0, 0}, new Integer[]{0, 1, 0}, new Integer[]{0, 0, 1}, new Integer[]{1, null, null})) {
            var b = bridge(null, null, 3, lifecycle[0], lifecycle[1], lifecycle[2], null, null, false);
            assertEquals("ALLOWED_EMPTY", b.conditionGradeStatus().status());
            assertEquals("ALLOWED_EMPTY", b.structureGradeStatus().status());
            assertEquals("ALLOWED_EMPTY", b.inspectionDateStatus().status());
            assertEquals("ALLOWED_EMPTY", b.inspectionReportStatus().status());
        }
        assertEquals("UNDETERMINED", bridge(null, null, 3, null, 0, 0, null, null, false).conditionGradeStatus().status());
        assertEquals("UNDETERMINED", bridge(null, null, 3, 0, 0, 99, null, null, false).inspectionReportStatus().status());
        assertEquals("MISSING", bridge(null, null, 3, 0, 0, 2, null, null, false).inspectionReportStatus().status());
        assertEquals("PRESENT", bridge("4", "5", 3, 1, 1, 1, null, null, false).conditionGradeStatus().status());
    }

    @Test
    void dashboardUsesEffectiveClassificationAndPreservesLegacyFields() {
        var source = mock(BridgeMapper.class);
        var defaulted = bridge("4", "5", 3, 0, 0, 0, null, 2, true);
        var missing = bridge(null, null, 3, 0, 0, 0, null, null, false);
        var zero = bridge("1", "1", 1, 0, 0, 0, 0, 0, true);
        when(source.all(any())).thenReturn(List.of(defaulted, missing, zero));
        var result = new DashboardService(new BridgeService(source)).summary(new BridgeFilter(null, null, null, null));
        assertEquals(3, result.total());
        assertEquals(1, result.monitored());
        assertEquals(1, result.monitoringDefaulted());
        assertEquals(2, result.withMonitoringDevices());
        assertNull(defaulted.monitoringType());
        assertEquals("DEVICE_DEFAULT", defaulted.monitoringTypeBasis());
        assertEquals("UNRECOGNIZED", zero.monitoringTypeBasis());
        assertEquals("5", defaulted.technicalGrade());
        assertEquals(3, result.conditionGrades().stream().mapToLong(g -> g.count()).sum());
        assertEquals(3, result.structureGrades().stream().mapToLong(g -> g.count()).sum());
        assertEquals(2, result.monitoringTypes().size());
        assertEquals(2, result.monitoringTypes().stream().filter(g -> g.code().equals("0") && g.label().equals("其他")).findFirst().orElseThrow().count());
    }

    @Test
    void filtersAcceptMissingAndNegativeSourceCodesAndRejectInvalidInput() {
        assertEquals("0", new BridgeFilter(null, null, null, "missing").monitoringType());
        assertEquals("0", new BridgeFilter(null, null, null, "99").monitoringType());
        assertEquals(99, new BridgeFilter(null, null, 98, null).type());
        assertDoesNotThrow(() -> new BridgeFilter(null, null, null, "0", "98", "-9999", 0, 0, 1, 2));
        assertThrows(IllegalArgumentException.class, () -> new BridgeFilter(null, null, null, "bad"));
        assertThrows(IllegalArgumentException.class, () -> new BridgeFilter(null, null, null, null, null, null, 0, 2, 0, 0));
    }

    @Test
    void distributionMergesUnknownTypesButKeepsRecognizedTypesAndSourceCodes() {
        var source = mock(BridgeMapper.class);
        var rows = new java.util.ArrayList<BridgeResponse>();
        for (Integer type : new Integer[]{null, 0, 98, 99, -9999, 1, 6}) {
            var b = bridge("3", "3", 3, 0, 0, 0, 99, 99, true);
            rows.add(new BridgeResponse(b.id(), b.code(), b.name(), b.cityCode(), b.city(), type, b.spanType(), b.monitoringType(),
                    b.road(), b.length(), b.width(), b.longitude(), b.latitude(), b.technicalGrade(), b.inspectionDate(), b.completedDate(),
                    b.manager(), b.maintainer(), b.sourceUpdatedAt(), b.conditionGrade(), b.structureGrade(), b.maintenanceCategory(),
                    b.bridgeStatus(), b.transferred(), b.demolished(), b.demolitionStatus(), b.monitoringSystemBuilt(),
                    b.effectiveMonitoringType(), true, b.inspectionReportPresent()));
        }
        when(source.all(any())).thenReturn(rows);
        var result = new DashboardService(new BridgeService(source)).summary(new BridgeFilter(null, null, null, null));
        assertEquals(3, result.types().size());
        assertEquals(5, result.types().stream().filter(g -> g.code().equals("99") && g.label().equals("其他")).findFirst().orElseThrow().count());
        assertEquals(7, result.monitoringTypes().getFirst().count());
        assertEquals("其他", result.monitoringTypes().getFirst().label());
        assertEquals(99, rows.getFirst().monitoringType());
        assertNull(rows.getFirst().type());
    }

    @Test
    void assessmentsSeparateCategorySystemsAndDoNotTreatConflictsAsValidGrades() {
        var source = mock(BridgeMapper.class);
        var rows = List.of(
                bridge("1", "3", 1, 0, 0, 0, 1, 1, true),
                bridge("3", "2", 1, 0, 0, 0, 1, 1, true),
                bridge("4", "1", 3, 0, 0, 0, 1, 1, true),
                bridge("1", "5", 5, 0, 0, 0, 1, 1, true),
                bridge("  ", "98", 2, 0, 0, 0, 1, 1, true),
                bridge("99", null, 1, 0, 0, 0, 1, 1, true),
                bridge("3", "1", null, 0, 0, 0, 1, 1, true),
                bridge(null, "99", 98, 0, 0, 0, 1, 1, true));
        when(source.all(any())).thenReturn(rows);
        var d = new DashboardService(new BridgeService(source)).summary(new BridgeFilter(null, null, null, null));
        for (var categories : List.of(d.conditionGradeCategories(), d.structureGradeCategories())) {
            assertEquals(8, categories.stream().mapToLong(c -> c.total()).sum());
            for (var category : categories) assertEquals(category.total(), category.grades().stream().mapToLong(g -> g.count()).sum());
            assertEquals(List.of("I", "II_V", "unknown"), categories.stream().map(c -> c.code()).toList());
        }
        var classOne = d.conditionGradeCategories().getFirst();
        assertEquals(3, classOne.total());
        assertEquals(1, classOne.grades().stream().filter(g -> g.code().equals("1")).findFirst().orElseThrow().count());
        assertEquals(2, classOne.grades().stream().filter(g -> g.code().equals("other") && g.label().equals("其他")).findFirst().orElseThrow().count());
        assertEquals(List.of("1", "2", "other"), classOne.grades().stream().map(g -> g.code()).toList());
        assertEquals(List.of("3", "4", "5", "6", "7", "other"), d.conditionGradeCategories().get(1).grades().stream().map(g -> g.code()).toList());
        for (var row : rows) {
            for (var raw : new String[]{row.conditionGrade(), row.structureGrade()}) {
                String detailed = BridgeAssessment.bucket(row.maintenanceCategory(), raw);
                assertEquals(List.of("1", "2", "3", "4", "5", "6", "7").contains(detailed) ? detailed : "other", BridgeAssessment.displayBucket(row.maintenanceCategory(), raw));
            }
        }
        assertFalse(classOne.grades().stream().anyMatch(g -> g.code().equals("3")));
        assertEquals("unclassified", BridgeAssessment.bucket(0, "3"));
        assertEquals("unclassified", BridgeAssessment.bucket(99, "1"));
        assertEquals("invalid", BridgeAssessment.bucket(null, "98"));
        assertEquals("missing", BridgeAssessment.bucket(null, "  "));
        assertEquals("3", BridgeAssessment.bucket(2, " 3 "));
        assertDoesNotThrow(() -> new BridgeFilter(null, null, null, null, "conflict", "invalid", null, null, null, null, null, null, null, null, "I"));
        assertThrows(IllegalArgumentException.class, () -> new BridgeFilter(null, null, null, null, null, null, null, null, null, null, null, null, null, null, "invalid"));
    }
}
