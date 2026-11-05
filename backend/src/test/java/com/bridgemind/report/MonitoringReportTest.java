package com.bridgemind.report;
import com.bridgemind.report.service.MonitoringReportService;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.bridge.model.resp.BridgeResponse;
import com.bridgemind.monitoring.service.MonitoringService;
import com.bridgemind.monitoring.model.resp.MonitorPointResponse;
import com.bridgemind.ingest.MonitorReadings;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.time.*;
import java.math.BigDecimal;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class MonitoringReportTest {
    final BridgeService bridges=mock(BridgeService.class);
    final MonitoringService monitoring=mock(MonitoringService.class);
    final MonitorReadings readings=mock(MonitorReadings.class);
    final MonitoringReportService service=new MonitoringReportService(bridges,monitoring,readings);
    final LocalDate day=LocalDate.of(2026,11,4);
    @Test void rangeAndVisibility() {
        assertThrows(IllegalArgumentException.class,()->service.generate("a",day,day.plusDays(31)));
        assertThrows(IllegalArgumentException.class,()->service.generate("a",day,day.minusDays(1)));verifyNoInteractions(bridges,monitoring,readings);
        when(bridges.require("hidden")).thenThrow(new IllegalArgumentException());
        assertThrows(IllegalArgumentException.class,()->service.generate("hidden",day,day));verifyNoInteractions(readings);
    }
    @Test void completeAggregatesCityIsolationAndExclusiveEnd() {
        var bridge=mock(BridgeResponse.class);when(bridge.cityCode()).thenReturn("321000");when(bridges.require("a")).thenReturn(bridge);
        var p=new MonitorPointResponse("p","point","d","device",null,null);when(monitoring.points("a")).thenReturn(List.of(p,p));
        when(monitoring.thresholds("a",null,null,null)).thenReturn(List.of());
        var row=new HashMap<String,Object>();row.put("point","p");row.put("device","d");row.put("samples",5001L);row.put("valid_samples",5000L);row.put("minimum",BigDecimal.ONE);row.put("maximum",BigDecimal.TEN);row.put("average",new BigDecimal("5.123456"));
        when(readings.reportStats("321000",List.of(p),day.atStartOfDay(),day.plusDays(1).atStartOfDay())).thenReturn(List.of(row));
        var report=service.generate("a",day,day);assertEquals(5001,report.samples());assertEquals(5000,report.validSamples());assertEquals(1,report.channels().size());assertNull(report.channels().getFirst().firstTime());
        verify(readings).reportStats("321000",List.of(p),day.atStartOfDay(),day.plusDays(1).atStartOfDay());verify(readings,never()).samples(any(),any(),any(),any(),any(),any());
    }
    @Test void emptyScopeAndFailures() {
        var bridge=mock(BridgeResponse.class);when(bridges.require("a")).thenReturn(bridge);when(bridge.cityCode()).thenReturn("x");
        when(monitoring.points("a")).thenReturn(List.of());when(monitoring.thresholds("a",null,null,null)).thenReturn(List.of());
        assertEquals(0,service.generate("a",day,day).samples());
        when(readings.reportStats(any(),any(),any(),any())).thenThrow(new IllegalStateException("database unavailable"));
        assertThrows(IllegalStateException.class,()->service.generate("a",day,day));
    }
}
