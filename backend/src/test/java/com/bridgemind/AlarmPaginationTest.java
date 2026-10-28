package com.bridgemind;

import com.bridgemind.alarm.mapper.AlarmMapper;
import com.bridgemind.alarm.model.resp.AlarmResponse;
import com.bridgemind.alarm.service.AlarmService;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.bridge.model.req.BridgeFilter;
import org.junit.jupiter.api.Test;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AlarmPaginationTest {
    private final BridgeFilter filter = new BridgeFilter(null, null, null, null);

    @Test
    void usesWindowTotalAndReusesIdenticalRequests() {
        var mapper = mock(AlarmMapper.class);
        var row = mock(AlarmResponse.class);
        when(row.matchingTotal()).thenReturn(96L);
        when(mapper.list(filter, null, null, null, null, 50, 0)).thenReturn(List.of(row));
        var service = new AlarmService(mapper, mock(BridgeService.class));
        assertEquals(96, service.list(filter, null, null, null, null, 1, 50).total());
        assertEquals(96, service.list(filter, null, null, null, null, 1, 50).total());
        verify(mapper, times(1)).list(filter, null, null, null, null, 50, 0);
        verifyNoMoreInteractions(mapper);
    }

    @Test
    void emptyFirstPageNeedsNoCountButOutOfRangePagePreservesTotal() {
        var mapper = mock(AlarmMapper.class);
        when(mapper.list(eq(filter), isNull(), isNull(), isNull(), isNull(), eq(50), anyInt())).thenReturn(List.of());
        when(mapper.count(filter, null, null, null, null)).thenReturn(96L);
        var service = new AlarmService(mapper, mock(BridgeService.class));
        assertEquals(0, service.list(filter, null, null, null, null, 1, 50).total());
        verify(mapper, never()).count(any(), any(), any(), any(), any());
        assertEquals(96, service.list(filter, null, null, null, null, 3, 50).total());
        verify(mapper, times(1)).count(filter, null, null, null, null);
    }
}
