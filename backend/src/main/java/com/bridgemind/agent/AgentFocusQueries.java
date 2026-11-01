package com.bridgemind.agent;

import com.bridgemind.agent.mapper.AgentMapper;
import com.bridgemind.work.model.*;
import com.bridgemind.work.service.WorkService;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Service;
import org.slf4j.LoggerFactory;
import java.util.*;
import java.util.concurrent.*;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.core.type.TypeReference;

/** Four workers across ALL requests; leaves capacity in the six-connection source pool. */
@Service
public class AgentFocusQueries {
    private final AgentMapper mapper;
    // Internal SQL JSON only. Preserve raw attachment metadata for WorkRecord's derived flags;
    // the normal response mapper still honors @JsonIgnore and never exposes attachmentRaw.
    private static final JsonMapper SQL_JSON=JsonMapper.builder().disable(MapperFeature.USE_ANNOTATIONS)
            .propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).build();
    private final ExecutorService executor = new ThreadPoolExecutor(4,4,0,TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(32),Thread.ofPlatform().daemon().name("agent-evidence-",0).factory(),
            new ThreadPoolExecutor.AbortPolicy());
    public AgentFocusQueries(AgentMapper mapper) { this.mapper=mapper; }
    public record Business(List<Map<String,Object>> summary,List<WorkRecord> examples,
                           List<Map<String,Object>> groups,List<WorkRecord> candidates) {}
    public record Result(Map<String,Business> businesses,Map<String,Object> coverage) {}
    public static Business decode(Map<String,String> snapshot) {
        List<Map<String,Object>> rows=SQL_JSON.readValue(snapshot.get("summary"),new TypeReference<>(){});
        var summary=rows.stream().filter(r->!"maintenancePriority".equals(r.get("dimension"))).toList();
        var groups=rows.stream().filter(r->"maintenancePriority".equals(r.get("dimension")))
                .map(r->Map.of("code",r.get("code"),"count",r.get("count"))).toList();
        List<WorkRecord> examples=SQL_JSON.readValue(snapshot.get("examples"),new TypeReference<>(){});
        List<WorkRecord> candidates=SQL_JSON.readValue(snapshot.get("candidates"),new TypeReference<>(){});
        return new Business(summary,examples,groups,candidates);
    }
    static Set<String> dimensions(String kind) {
        return switch(kind) {
            case "defects" -> Set.of("total","zone","status","severity","damageType");
            case "maintenance" -> Set.of("total","status","maintenanceType");
            default -> Set.of("total","resultProvided");
        };
    }
    public Result load(List<String> ids,WorkFilter filter,boolean maintenance) {
        var kinds=List.of("patrols","defects","maintenance");
        for(var kind:kinds) WorkService.validate(WorkKind.parse(kind),filter,1,10);
        var futures=new ArrayList<Future<?>>();
        try {
            var business=new LinkedHashMap<String,Future<Business>>();
            for(var kind:kinds) {
                var future=executor.submit(()->{
                    long start=System.nanoTime();
                    var selected=new HashSet<>(dimensions(kind));
                    if(maintenance&&kind.equals("defects"))selected.add("maintenancePriority");
                    var result=decode(mapper.focusSnapshot(ids,kind,filter,selected));
                    LoggerFactory.getLogger(AgentFocusQueries.class).info("agent focus kind={} durationMs={}",kind,TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start));
                    return result;
                });
                business.put(kind,future);futures.add(future);
            }
            var coverage=executor.submit(()->mapper.monitoringCoverage(ids,filter));futures.add(coverage);
            var results=new LinkedHashMap<String,Business>();
            for(var entry:business.entrySet()) results.put(entry.getKey(),entry.getValue().get());
            return new Result(results,coverage.get());
        } catch(InterruptedException e) {
            Thread.currentThread().interrupt();throw new IllegalStateException("资料查询已取消",e);
        } catch(ExecutionException e) {
            if(e.getCause() instanceof RuntimeException cause)throw cause;
            throw new IllegalStateException("资料查询失败",e.getCause());
        } finally {
            // Never return partial evidence, and never leave queued work after failure/cancellation.
            futures.forEach(f-> { if(!f.isDone())f.cancel(true); });
        }
    }
    @PreDestroy public void close() { executor.shutdownNow(); }
}
