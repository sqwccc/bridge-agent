package com.bridgemind;

import com.bridgemind.bridge.mapper.BridgeMapper;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.model.resp.*;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.dashboard.service.DashboardService;
import com.bridgemind.monitoring.model.resp.ThresholdResponse;
import com.bridgemind.monitoring.service.MonitoringDictionary;
import com.bridgemind.report.model.entity.ReportRecord;
import com.bridgemind.report.service.*;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PhaseTwoRulesTest {
    private BridgeResponse bridge(String types, Integer special, Integer transferred) {
        return new BridgeResponse("a", "a", "桥梁", "320100", "南京市", 1, 2, null, null, 1.0, 1.0, 118.0, 32.0,
                "3", null, null, null, null, null, "3", "3", 3, 0, transferred, 0, 0, false, null, false, false, special, types, true);
    }

    @Test
    void specialTypesAreDistinctOverlappingRegistrationsWithoutInventingMissingFlags() {
        var b = bridge("1, 2,1", null, 0);
        assertEquals(List.of("1", "2"), b.specialTypeCodes());
        assertNull(b.specialBridge());
        assertTrue(b.hasRegisteredSpecialType());
        var mapper = mock(BridgeMapper.class);
        when(mapper.all(any())).thenReturn(List.of(b, bridge("0", null, 0)));
        var d = new DashboardService(new BridgeService(mapper)).summary(new BridgeFilter(null, null, null, null));
        assertEquals(1, d.specialTypesRegistered());
        assertEquals(0, d.specialFlagProvided());
        assertEquals(3, d.specialTypes().stream().mapToLong(g -> g.count()).sum());
        assertEquals(2, d.normalUse());
    }

    @Test
    void thresholdBoundsRemainRawAndSuspiciousIntervalsAreExplained() {
        var extreme = new ThresholdResponse("a", "p", "d", "QL1301", "QL13", 1, new BigDecimal("9"), new BigDecimal("-9999999.999"), null, null, null);
        assertTrue(extreme.extremePlaceholder());
        assertEquals(new BigDecimal("-9999999.999"), extreme.lower());
        assertEquals("UNSPECIFIED", extreme.boundaryConvention());
        assertEquals("με", extreme.unit());
        var reversed = new ThresholdResponse("b", "p", "d", "QL1301", "QL13", 2, new BigDecimal("1"), new BigDecimal("2"), null, null, null);
        assertTrue(reversed.dataIssues().stream().anyMatch(s -> s.contains("下限大于上限")));
        var legacy = new ThresholdResponse("c", "p", "d", null, null, null, null, null, "30", null, null);
        assertNull(legacy.lower());
        assertNull(legacy.upper());
        assertEquals(2, legacy.dataIssues().size());
        assertNull(MonitoringDictionary.unit("unknown"));
        assertEquals("UNAVAILABLE", MonitoringDictionary.basis(null));
        assertEquals("cm/s/s", MonitoringDictionary.unit("QL2501"));
    }

    @Test
    void reportListsExpandAttachmentsAndKeepCommaInAFileName() {
        var r = new ReportRecord("r", "报告", "定检", null, "a,b.pdf");
        assertEquals(1, ReportAttachments.expand(r).size());
        var json = r.attachment("", null, "[{\"name\":\"报告甲\",\"url\":\"/a.pdf\"},\"/b.pdf\"]");
        var files = ReportAttachments.expand(json);
        assertEquals(2, files.size());
        assertEquals("r~0", files.getFirst().id());
        assertEquals("报告甲", files.getFirst().name());
        var assets = new ReportRecord("asset", "图片", "附件", null, "[]", "BRIDGE_ATTACHMENT", null, null, null);
        assertTrue(ReportAttachments.expand(assets).isEmpty());
        assertEquals(1, ReportAttachments.expand(r.attachment("", null, "[]")).size());
        assertFalse(ReportAttachments.pathSyntax("提供照片"));
        assertFalse(ReportAttachments.pathSyntax("file:///private.pdf"));
        assertTrue(ReportAttachments.pathSyntax("/a.pdf"));
        assertTrue(ReportAttachments.pathSyntax("https://files.example.test/download/123"));
    }

    @Test
    void missingBaseReportsExplainExemptionsAndProvidedAddressesAreNotMarkedAsReadSuccessfully() {
        var bridges = mock(BridgeService.class);
        when(bridges.require("a")).thenReturn(bridge(null, null, 1));
        var service = new ReportService(id -> List.of(new ReportRecord("base", "报告", "底数", null, null, "BASE_INSPECTION", "a", null, null),
                new ReportRecord("file", "附件", "定检", null, "a.pdf", "PERIODIC_INSPECTION", "i", 2, null)), bridges, "", 1000);
        var rows = service.list("a");
        var base = rows.stream().filter(r -> r.id().equals("base")).findFirst().orElseThrow();
        assertEquals("ALLOWED_EMPTY", base.requirementStatus());
        assertEquals("MISSING_ATTACHMENT", base.status());
        var file = rows.stream().filter(r -> r.id().equals("file")).findFirst().orElseThrow();
        assertEquals("SOURCE_NOT_CONFIGURED", file.status());
        assertEquals("PRESENT", file.requirementStatus());
        assertEquals("结构定期检测", file.inspectionTypeName());
    }
}
