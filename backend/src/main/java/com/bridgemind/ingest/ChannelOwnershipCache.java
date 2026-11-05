package com.bridgemind.ingest;

import com.bridgemind.monitoring.mapper.MonitoringMapper;
import com.github.benmanes.caffeine.cache.*;
import org.springframework.stereotype.Component;
import org.springframework.core.env.Environment;
import org.springframework.beans.factory.annotation.Autowired;
import java.time.Duration;
import java.util.*;

/** Bounded metadata cache. Exceptions and missing/ambiguous owners are never cached. */
@Component
public class ChannelOwnershipCache {
    record Key(String point,String device,String metric) {}
    private final MonitoringMapper source;
    private final Cache<Key,List<Map<String,String>>> cache;
    @Autowired public ChannelOwnershipCache(MonitoringMapper source,Environment env) {
        this(source,Caffeine.newBuilder().maximumSize(Math.max(1,env.getProperty("bridgemind.kafka.owner-cache-size",Long.class,10000L)))
            .expireAfterWrite(Duration.ofSeconds(Math.max(1,env.getProperty("bridgemind.kafka.owner-cache-ttl-seconds",Long.class,30L))))
            .recordStats().build());
    }
    ChannelOwnershipCache(MonitoringMapper source,Cache<Key,List<Map<String,String>>> cache){this.source=source;this.cache=cache;}
    public List<Map<String,String>> resolve(MonitorMessage m) {
        var key=new Key(m.dwbsm(),m.sbbsm(),m.jczb());
        var result=cache.get(key,k->{
            List<Map<String,String>> rows;
            try { rows=source.resolveChannel(k.point(),k.device(),k.metric()); }
            catch(RuntimeException e){org.slf4j.LoggerFactory.getLogger(getClass()).warn("Ownership lookup failed mapper=MonitoringMapper.resolveChannel {}; result not cached",MonitorConsumer.safeFailure(e));throw e;}
            if(rows.size()!=1)return null;
            var row=rows.getFirst();
            if(row.get("city")==null||row.get("bridge")==null)return null;
            return List.of(Map.copyOf(row));
        });
        return result==null?List.of():result;
    }
    public void invalidate(MonitorMessage m){cache.invalidate(new Key(m.dwbsm(),m.sbbsm(),m.jczb()));}
    public String stats(){var s=cache.stats();return "size="+cache.estimatedSize()+",hits="+s.hitCount()+",misses="+s.missCount()+",loadFailures="+s.loadFailureCount();}
}
