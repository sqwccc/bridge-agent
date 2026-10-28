package com.bridgemind.bridge.service;

import com.bridgemind.bridge.mapper.BridgeMapper;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.model.resp.BridgeResponse;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.junit.jupiter.api.Test;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicLong;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class BridgeSnapshotTest {
    private final BridgeFilter all = new BridgeFilter(null, null, null, null);

    @Test
    void summaryCitiesAndPagesShareSnapshotAndKeepEmptyPageTotal() {
        var mapper = mock(BridgeMapper.class);
        var bridge = mock(BridgeResponse.class);
        when(bridge.cityCode()).thenReturn("320100");
        when(bridge.city()).thenReturn("南京市");
        when(mapper.all(all)).thenReturn(List.of(bridge));
        var service = new BridgeService(mapper);
        assertEquals(1, service.all(all).size());
        assertEquals(1, service.cities().getFirst().count());
        assertEquals(List.of(bridge), service.page(all, 1, 8).items());
        assertEquals(1, service.page(all, 2, 8).total());
        assertTrue(service.page(all, 2, 8).items().isEmpty());
        assertThrows(UnsupportedOperationException.class, () -> service.all(all).clear());
        verify(mapper, times(1)).all(all);
        verifyNoMoreInteractions(mapper);
    }

    @Test
    void conditionsAreIsolatedAndExpiredDataReloads() {
        var mapper = mock(BridgeMapper.class);
        when(mapper.all(any())).thenReturn(List.of());
        var ticks = new AtomicLong();
        var cache = Caffeine.newBuilder().maximumSize(64).ticker(ticks::get)
                .expireAfterWrite(Duration.ofSeconds(30)).<BridgeFilter, List<BridgeResponse>>build();
        var service = new BridgeService(mapper, cache);
        var search = new BridgeFilter("万福", null, null, null);
        service.all(all);
        service.all(search);
        ticks.set(Duration.ofSeconds(29).toNanos());
        service.all(all);
        verify(mapper, times(1)).all(all);
        ticks.set(Duration.ofSeconds(31).toNanos());
        service.all(all);
        verify(mapper, times(2)).all(all);
        verify(mapper, times(1)).all(search);
    }

    @Test
    void failedLoadsAreNotCached() {
        var mapper = mock(BridgeMapper.class);
        when(mapper.all(all)).thenThrow(new IllegalStateException("unavailable")).thenReturn(List.of());
        var service = new BridgeService(mapper);
        assertThrows(IllegalStateException.class, () -> service.all(all));
        assertTrue(service.all(all).isEmpty());
        verify(mapper, times(2)).all(all);
    }

    @Test
    void simultaneousReadersLoadOnlyOnce() throws Exception {
        var mapper = mock(BridgeMapper.class);
        var started = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(mapper.all(all)).thenAnswer(invocation -> {
            started.countDown();
            assertTrue(release.await(5, TimeUnit.SECONDS));
            return List.of();
        });
        var service = new BridgeService(mapper);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> service.all(all));
            assertTrue(started.await(5, TimeUnit.SECONDS));
            var second = executor.submit(() -> service.all(all));
            release.countDown();
            assertEquals(first.get(5, TimeUnit.SECONDS), second.get(5, TimeUnit.SECONDS));
        } finally { release.countDown(); }
        verify(mapper, times(1)).all(all);
    }

    @Test
    void detailAndOtherModulesReuseScopeAndRevocationIsRespectedAfterExpiry() {
        var mapper = mock(BridgeMapper.class);
        var bridge = mock(BridgeResponse.class);
        when(bridge.id()).thenReturn("visible");
        when(mapper.all(all)).thenReturn(List.of(bridge)).thenReturn(List.of());
        var ticks = new AtomicLong();
        var cache = Caffeine.newBuilder().ticker(ticks::get).expireAfterWrite(Duration.ofSeconds(30))
                .<BridgeFilter, List<BridgeResponse>>build();
        var service = new BridgeService(mapper, cache);
        service.all(all); // Already loaded by the map.
        assertSame(bridge, service.require("visible"));
        service.requireExists("visible");
        assertSame(bridge, service.detail("visible").bridge());
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.detail("hidden"));
        verify(mapper, never()).archiveForVisible("hidden");
        verify(mapper, never()).find(any());
        verify(mapper, never()).exists(any());
        verify(mapper, times(1)).all(all);
        ticks.set(Duration.ofSeconds(31).toNanos());
        assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.detail("visible"));
        verify(mapper, times(1)).archiveForVisible("visible");
        verify(mapper, times(2)).all(all);
    }
}
