package com.bridgemind;

import com.bridgemind.work.mapper.WorkMapper;
import com.bridgemind.work.model.*;
import com.bridgemind.work.service.WorkService;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.report.model.entity.ReportRecord;
import com.bridgemind.report.service.ReportService;

import java.time.*;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PhaseThreeRulesTest {
    static WorkRecord row(String kind, Long total) {
        return new WorkRecord("R", kind, "320100", "B", "测试桥", "CODE", LocalDateTime.of(2025, 2, 1, 0, 0), LocalDateTime.of(2025, 2, 2, 0, 0), "U", null,
                "BH", null, null, null, null, null, "无", 1, 1, 18, 1, 2, 1, "裂缝", null, null, 1, LocalDate.of(2025, 1, 1), null, "/files/private.jpg", total);
    }

    @Test
    void datesPagingKindsAndFiltersRejectInvalidInput() {
        assertThrows(IllegalArgumentException.class, () -> WorkKind.parse("ql_sys_file"));
        assertThrows(IllegalArgumentException.class, () -> new WorkFilter(LocalDate.of(2025, 2, 1), LocalDate.of(2025, 1, 1), null, null, null, null, null, null, null, false));
        assertThrows(IllegalArgumentException.class, () -> new WorkFilter(null, null, "1 OR 1=1", null, null, null, null, null, null, false));
        assertThrows(IllegalArgumentException.class, () -> WorkService.validate(WorkKind.defects, WorkFilter.all(), 1, 101));
        assertThrows(IllegalArgumentException.class, () -> WorkService.validate(WorkKind.patrols, new WorkFilter(null, null, "1", null, null, null, null, null, null, false), 1, 20));
        assertDoesNotThrow(() -> WorkService.validate(WorkKind.defects, new WorkFilter(null, null, "99", null, null, null, null, null, null, true), 1, 20));
    }

    @Test
    void emptyResultsRemainUnknownAndPrivateAddressesAreNotSerialized() {
        var patrol = row("patrols", 12L);
        assertTrue(patrol.dataIssues().stream().anyMatch(s -> s.contains("检查结果")));
        assertTrue(row("maintenance", 1L).dataIssues().stream().anyMatch(s -> s.contains("整改日期")));
        String json = JsonMapper.builder().build().writeValueAsString(patrol);
        assertFalse(json.contains("attachmentRaw"));
        assertFalse(json.contains("/files/private"));
        assertFalse(json.contains("matchingTotal"));
        assertTrue(json.contains("attachmentProvided"));
    }

    @Test
    void maintenanceRelationRetainsAmbiguityAndUnknownRecordIsNotReadable() {
        var mapper = mock(WorkMapper.class);
        var bridges = mock(BridgeService.class);
        var files = mock(ReportService.class);
        when(mapper.find("B", "maintenance", "R")).thenReturn(row("maintenance", null));
        when(files.attachments(any())).thenReturn(List.of());
        var service = new WorkService(mapper, bridges, files);
        for (long count : new long[]{0, 1, 2}) {
            when(mapper.list(eq("B"), eq("defects"), any(), eq(20), eq(0))).thenReturn(count == 0 ? List.of() : List.of(row("defects", count)));
            var d = service.detail("B", "maintenance", "R");
            assertEquals(count, d.relatedRecords().total());
            assertEquals(count == 0 ? "UNMATCHED" : count == 1 ? "UNIQUE" : "AMBIGUOUS", d.relationStatus());
        }
        assertThrows(ResponseStatusException.class, () -> service.file("OTHER", "maintenance", "R", "attachment"));
        verify(files, never()).attachmentFile(any(), any());
        when(mapper.list(eq("B"), eq("patrols"), any(), eq(20), eq(20))).thenReturn(List.of());
        when(mapper.count(eq("B"), eq("patrols"), any())).thenReturn(7L);
        assertEquals(7, service.list("B", "patrols", WorkFilter.all(), 2, 20).total());
    }

    @Test
    void recordAttachmentMetadataUsesConfiguredOriginAndEmptyJsonArraysStayEmpty() {
        var files = new ReportService(null, null, "", 1024);
        var source = new ReportRecord("attachment", "病害图片", "病害图片", null, "[]", "DEFECTS", "R", null, null);
        assertTrue(files.attachments(source).isEmpty());
        source = source.attachment("", null, "[{\"url\":\"/files/a.jpg\",\"name\":\"病害照片\"}]");
        var response = files.attachments(source).getFirst();
        assertEquals("SOURCE_NOT_CONFIGURED", response.status());
        assertEquals("IMAGE", response.attachmentKind());
        var finalSource = source;
        assertThrows(ResponseStatusException.class, () -> files.attachmentFile(finalSource, "foreign-record"));
    }
}
