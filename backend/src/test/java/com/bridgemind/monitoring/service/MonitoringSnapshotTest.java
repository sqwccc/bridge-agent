package com.bridgemind.monitoring.service;

import com.bridgemind.bridge.model.resp.BridgeResponse;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.monitoring.mapper.MonitoringMapper;
import com.bridgemind.monitoring.model.resp.*;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MonitoringSnapshotTest {
    final MonitoringMapper mapper = mock(MonitoringMapper.class);
    final BridgeService bridges = mock(BridgeService.class);
    final AtomicLong ticks = new AtomicLong();
    final LocalDateTime from = LocalDateTime.of(2026,10,21,0,0), to = from.plusDays(2);
    final MonitorPointResponse point = new MonitorPointResponse("P","point","D","device","QL0301",null);

    MonitoringService service() {
        var bridge = mock(BridgeResponse.class);
        when(bridge.cityCode()).thenReturn("321000");
        when(bridges.require("A")).thenReturn(bridge);
        when(mapper.points("A")).thenReturn(List.of(point));
        when(mapper.samplesForPoint(any(),any(),any(),any(),any(),any())).thenReturn(List.of());
        return new MonitoringService(mapper, bridges, Caffeine.newBuilder().maximumSize(256)
                .ticker(ticks::get).expireAfterWrite(Duration.ofSeconds(30)).build());
    }

    @Test void repeatedReadsReuseScopeButSamplesStayLiveAndExpiryRevokesDevice() {
        var service = service();
        assertThrows(UnsupportedOperationException.class, () -> service.points("A").clear());
        service.samples("A","P","D","QL0301",from,to);
        service.samples("A","P","D","QL0301",from,to);
        verify(mapper,times(1)).points("A");
        verify(mapper,times(2)).samplesForPoint("321000","P","D","QL0301",from,to);
        when(mapper.points("A")).thenReturn(List.of());
        ticks.set(Duration.ofSeconds(31).toNanos());
        assertThrows(IllegalArgumentException.class, () -> service.samples("A","P","D","QL0301",from,to));
        verify(mapper,times(2)).points("A");
        verify(mapper,times(2)).samplesForPoint(any(),any(),any(),any(),any(),any());
    }

    @Test void rejectsForeignBridgeWrongPointDeviceMetricAndInvalidRangeBeforeReadingSamples() {
        var service = service();
        for (String[] ids : List.of(new String[]{"OTHER","D","QL0301"}, new String[]{"P","OTHER","QL0301"},new String[]{"P","D","QL1301"}))
            assertThrows(IllegalArgumentException.class, () -> service.samples("A",ids[0],ids[1],ids[2],from,to));
        var bridge = bridges.require("A");
        when(bridges.require("B")).thenReturn(bridge);
        when(mapper.points("B")).thenReturn(List.of());
        assertThrows(IllegalArgumentException.class, () -> service.samples("B","P","D","QL0301",from,to));
        assertThrows(IllegalArgumentException.class, () -> service.samples("A","P","D","QL0301",from,from.plusDays(32)));
        verify(mapper,never()).samplesForPoint(any(),any(),any(),any(),any(),any());
    }

    @Test void bridgeVisibilityIsCheckedEvenWithWarmPointsAndCityChangeReloads() {
        var service = service();
        service.points("A");
        var moved = mock(BridgeResponse.class);
        when(moved.cityCode()).thenReturn("320100");
        when(bridges.require("A")).thenReturn(moved);
        service.samples("A","P","D","QL0301",from,to);
        verify(mapper,times(2)).points("A");
        verify(mapper).samplesForPoint("320100","P","D","QL0301",from,to);
        when(bridges.require("A")).thenThrow(new IllegalArgumentException("hidden"));
        assertThrows(IllegalArgumentException.class, () -> service.points("A"));
    }

    @Test void failedLoadRetriesAndConcurrentReadersShareOneSuccessfulLoad() throws Exception {
        var service = service();
        when(mapper.points("A")).thenThrow(new IllegalStateException("unavailable"));
        assertThrows(IllegalStateException.class, () -> service.points("A"));
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        doAnswer(call -> {
            started.countDown();
            assertTrue(release.await(5, TimeUnit.SECONDS));
            return List.of(point);
        }).when(mapper).points("A");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var a = executor.submit(() -> service.points("A"));
            assertTrue(started.await(5,TimeUnit.SECONDS));
            var b = executor.submit(() -> service.points("A"));
            release.countDown();
            assertEquals(a.get(5,TimeUnit.SECONDS), b.get(5,TimeUnit.SECONDS));
        } finally { release.countDown(); }
        verify(mapper,times(2)).points("A");
    }

    @Test void thresholdsUseOnlyValidatedBindingsAndPreserveWildcardFiltering() {
        var service = service();
        when(mapper.thresholdsForPoints(any(),any())).thenReturn(List.of());
        service.thresholds("A",null,null,null);
        verify(mapper).thresholdsForPoints(eq("321000"),argThat(p -> p.size()==1 && p.getFirst().deviceId().equals("D")));
        assertThrows(IllegalArgumentException.class, () -> service.thresholds("A","P",null,null));
        assertThrows(IllegalArgumentException.class, () -> service.thresholds("A",null,"OTHER",null));
        assertTrue(service.thresholds("A",null,null,"unknown").isEmpty());
        assertTrue(service.thresholds("A",null,null," ").isEmpty());
        assertTrue(service.thresholds("A",null,"D"," ").isEmpty());
        assertTrue(service.thresholds("A",null," ",null).isEmpty());
        verify(mapper,times(1)).thresholdsForPoints(any(),any());
    }

    @Test void sampleLimitAndInvalidValueGapsRemainUnchanged() {
        var service = service();
        var rows = new ArrayList<SampleResponse>();
        rows.add(new SampleResponse(from,"NaN",null));
        for(int i=1;i<2001;i++) rows.add(new SampleResponse(from.plusSeconds(i),"0",null));
        when(mapper.samplesForPoint(any(),any(),any(),any(),any(),any())).thenReturn(rows);
        var result=service.samples("A","P","D","QL0301",from,to);
        var items=(List<?>)result.get("items");
        assertEquals(2000,items.size());
        assertEquals(true,result.get("truncated"));
        assertNull(((SampleResponse)items.getFirst()).value());
        assertEquals(0.0,((SampleResponse)items.get(1)).value());
    }
}
