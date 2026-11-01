package com.bridgemind.agent;

import com.github.benmanes.caffeine.cache.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Supplier;

/** Caches complete source evidence only, never model text or conversation state. */
@Service
public class AgentMaintenanceCache {
    record Key(AgentPlan plan,String bridgeId,LocalDate day) {}
    private final Cache<Key,String> snapshots;
    private final JsonMapper json;
    @Autowired public AgentMaintenanceCache(JsonMapper json) {
        this(json,Caffeine.newBuilder().maximumSize(64).expireAfterWrite(Duration.ofSeconds(30)).build());
    }
    AgentMaintenanceCache(JsonMapper json,Cache<Key,String> snapshots) {this.json=json;this.snapshots=snapshots;}
    public AgentEvidence.Evidence get(AgentPlan plan,String bridgeId,Supplier<AgentEvidence.Evidence> loader) {
        var key=new Key(plan,bridgeId,LocalDate.now(ZoneId.of("Asia/Shanghai")));
        String encoded=snapshots.get(key,k->{
            var evidence=loader.get();
            var data=new LinkedHashMap<>(evidence.data());
            data.put("资料缓存",Map.of("资料整理完成时间",ZonedDateTime.now(ZoneId.of("Asia/Shanghai")).toString(),
                    "有效秒数",30,"说明","相同条件最多复用30秒；查询时间为本批资料原始查询时间，不代表实时状态。失败不缓存。"));
            return json.writeValueAsString(new AgentEvidence.Evidence(data,evidence.references()));
        });
        // Each caller gets a private copy; mutations cannot poison another conversation's evidence.
        return json.readValue(encoded,AgentEvidence.Evidence.class);
    }
}
