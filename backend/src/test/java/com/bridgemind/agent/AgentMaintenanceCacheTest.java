package com.bridgemind.agent;

import com.github.benmanes.caffeine.cache.Caffeine;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;
import static org.junit.jupiter.api.Assertions.*;

class AgentMaintenanceCacheTest {
    final JsonMapper json=JsonMapper.builder().build();
    final AgentPlan plan=new AgentPlan("business_query","maintenance_plan",null,null,null,null,null);
    AgentEvidence.Evidence evidence(int total) {return new AgentEvidence.Evidence(new LinkedHashMap<>(Map.of("total",total,"查询时间","original")),List.of());}
    @Test void isolatesScopesExpiresAndReturnsPrivateCopies() {
        var ticks=new AtomicLong();
        var cache=new AgentMaintenanceCache(json,Caffeine.newBuilder().maximumSize(64).ticker(ticks::get).expireAfterWrite(Duration.ofSeconds(30)).build());
        var calls=new AtomicInteger();
        var one=cache.get(plan,"one",()->evidence(calls.incrementAndGet()));
        one.data().put("total",999);
        assertEquals(1,cache.get(plan,"one",()->evidence(calls.incrementAndGet())).data().get("total"));
        assertEquals(2,cache.get(plan,"two",()->evidence(calls.incrementAndGet())).data().get("total"));
        var dated=new AgentPlan("business_query","maintenance_plan",null,new com.bridgemind.work.model.WorkFilter(java.time.LocalDate.of(2026,10,1),null,null,null,null,null,null,null,null,false),null,null,null);
        assertEquals(3,cache.get(dated,"one",()->evidence(calls.incrementAndGet())).data().get("total"));
        assertEquals(4,cache.get(plan,null,()->evidence(calls.incrementAndGet())).data().get("total"));
        ticks.set(Duration.ofSeconds(31).toNanos());
        assertEquals(5,cache.get(plan,"one",()->evidence(calls.incrementAndGet())).data().get("total"));
    }
    @Test void failuresAreRetriedAndConcurrentRequestsShareOneLoad() throws Exception {
        var cache=new AgentMaintenanceCache(json);
        assertThrows(IllegalStateException.class,()->cache.get(plan,"one",()->{throw new IllegalStateException("source unavailable");}));
        var entered=new CountDownLatch(1);var release=new CountDownLatch(1);var calls=new AtomicInteger();
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks=new ArrayList<Future<AgentEvidence.Evidence>>();
            for(int i=0;i<8;i++)tasks.add(executor.submit(()->cache.get(plan,"one",()->{
                calls.incrementAndGet();entered.countDown();
                try{assertTrue(release.await(5,TimeUnit.SECONDS));}catch(InterruptedException e){throw new RuntimeException(e);}
                return evidence(7);
            })));
            assertTrue(entered.await(5,TimeUnit.SECONDS));release.countDown();
            for(var task:tasks)assertEquals(7,task.get(5,TimeUnit.SECONDS).data().get("total"));
            assertEquals(1,calls.get());
        } finally {release.countDown();}
    }
}
