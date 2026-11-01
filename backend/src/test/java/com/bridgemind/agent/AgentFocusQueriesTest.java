package com.bridgemind.agent;

import com.bridgemind.agent.mapper.AgentMapper;
import com.bridgemind.work.model.WorkFilter;
import org.junit.jupiter.api.Test;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class AgentFocusQueriesTest {
    @Test void independentQueriesOverlapWithoutChangingOrderOrLimits() throws Exception {
        var mapper=mock(AgentMapper.class);var ready=new CountDownLatch(4);
        when(mapper.focusSnapshot(anyList(),anyString(),any(),anySet())).thenAnswer(inv->{
            ready.countDown();assertTrue(ready.await(5,TimeUnit.SECONDS));
            return Map.of("summary","[{\"dimension\":\"total\",\"count\":3}]","examples","[]","candidates","[]");
        });
        when(mapper.monitoringCoverage(anyList(),any())).thenAnswer(inv->{
            ready.countDown();assertTrue(ready.await(5,TimeUnit.SECONDS));return Map.of("reading_count",3);
        });
        var service=new AgentFocusQueries(mapper);
        try {
            var result=service.load(List.of("one"),WorkFilter.all(),true);
            assertEquals(List.of("patrols","defects","maintenance"),new ArrayList<>(result.businesses().keySet()));
            for(var kind:result.businesses().keySet()){
                var dimensions=new HashSet<>(AgentFocusQueries.dimensions(kind));
                if(kind.equals("defects"))dimensions.add("maintenancePriority");
                verify(mapper).focusSnapshot(List.of("one"),kind,WorkFilter.all(),dimensions);
            }
            verify(mapper,never()).maintenancePriorities(anyList(),anyString(),any());
            verify(mapper,never()).maintenanceCandidates(anyList(),anyString(),any());
        } finally {service.close();}
    }
    @Test void sourceFailureNeverProducesPartialEvidence() {
        var mapper=mock(AgentMapper.class);
        when(mapper.focusSnapshot(anyList(),anyString(),any(),anySet())).thenThrow(new IllegalStateException("source failed"));
        var service=new AgentFocusQueries(mapper);
        try {assertThrows(IllegalStateException.class,()->service.load(List.of("one"),WorkFilter.all(),true));}
        finally {service.close();}
    }
}
