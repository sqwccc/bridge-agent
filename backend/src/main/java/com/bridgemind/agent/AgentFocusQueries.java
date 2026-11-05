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
    private final com.bridgemind.ingest.MonitorReadings readings;
    // Internal SQL JSON only. Preserve raw attachment metadata for WorkRecord's derived flags;
    // the normal response mapper still honors @JsonIgnore and never exposes attachmentRaw.
    private static final JsonMapper SQL_JSON=JsonMapper.builder().disable(MapperFeature.USE_ANNOTATIONS)
            .propertyNamingStrategy(PropertyNamingStrategies.SNAKE_CASE).build();
    private final ExecutorService executor = new ThreadPoolExecutor(4,4,0,TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(32),Thread.ofPlatform().daemon().name("agent-evidence-",0).factory(),
            new ThreadPoolExecutor.AbortPolicy());
    public AgentFocusQueries(AgentMapper mapper, com.bridgemind.ingest.MonitorReadings readings) { this.mapper=mapper; this.readings=readings; }
    public record Business(List<Map<String,Object>> summary,List<WorkRecord> examples,
                           List<Map<String,Object>> groups,List<WorkRecord> candidates) {}
    public record Result(Map<String,Business> businesses,Map<String,Object> coverage) {}
    public static Business decode(Map<String,String> snapshot) {
        List<Map<String,Object>> rows=SQL_JSON.readValue(snapshot.get("summary"),new TypeReference<>(){});
        var summary=rows.stream().filter(r->!"maintenancePriority".equals(r.get("dimension"))).toList();
        var groups=rows.stream().filter(r->"maintenancePriority".equals(r.get("dimension")))
                .map(r->Map.of("code",r.get("code"),"count",r.get("count"))).toList();
        List<WorkRecord> examples=decodeRecords(snapshot.get("examples"),"examples");
        List<WorkRecord> candidates=decodeRecords(snapshot.get("candidates"),"candidates");
        return new Business(summary,examples,groups,candidates);
    }
    private static List<WorkRecord> decodeRecords(String payload,String section) {
        try { return SQL_JSON.readValue(payload,new TypeReference<>(){}); }
        catch(tools.jackson.databind.exc.InvalidFormatException e) {
            var dateError=e.getCause();
            while(dateError!=null && !(dateError instanceof java.time.format.DateTimeParseException))dateError=dateError.getCause();
            if(dateError instanceof java.time.format.DateTimeParseException date) {
                // Log only known date fields; never stringify the record, Jackson message or path keys.
                String field="unknown";int index=-1;
                for(var ref:e.getPath()) {
                    if(ref.getIndex()>=0)index=ref.getIndex();
                    if(Set.of("occurredAt","sourceUpdatedAt","rectifiedDate","occurred_at","source_updated_at","rectified_date").contains(java.util.Objects.toString(ref.getPropertyName(),"")))field=ref.getPropertyName();
                }
                String value=date.getParsedString();
                String shape=value==null?"null":value.substring(0,Math.min(value.length(),80)).replaceAll("[A-Za-z]","a").replaceAll("[0-9]","d").replaceAll("[^da :+./TtZz-]","?");
                String safeDate=!field.equals("unknown") && value!=null && value.length()<=64 && value.matches("[0-9TtZz :+./-]+")?value:"[redacted]";
                LoggerFactory.getLogger(AgentFocusQueries.class).warn("agent date decode failed {} section={} recordIndex={} field={} targetType={} valueLength={} dateValue={} shape={} errorIndex={}",
                    com.bridgemind.diagnostics.QueryTrace.context(),section,index,field,e.getTargetType().getSimpleName(),value==null?0:value.length(),safeDate,shape,date.getErrorIndex());
            }
            throw e;
        }
    }
    static Set<String> dimensions(String kind) {
        return switch(kind) {
            case "defects" -> Set.of("total","zone","status","severity","damageType");
            case "maintenance" -> Set.of("total","status","maintenanceType");
            default -> Set.of("total","resultProvided");
        };
    }
    /** Overview intentionally excludes work-record scans and JSON date decoding. */
    public Result overview(List<String> ids,WorkFilter filter) {
        return new Result(Map.of(),readings.coverage(ids,filter));
    }
    public Result load(List<String> ids,WorkFilter filter,boolean maintenance) {
        var kinds=List.of("patrols","defects","maintenance");
        for(var kind:kinds) WorkService.validate(WorkKind.parse(kind),filter,1,10);
        var futures=new ArrayList<Future<?>>();
        try {
            var business=new LinkedHashMap<String,Future<Business>>();
            for(var kind:kinds) {
                var future=executor.submit(com.bridgemind.diagnostics.QueryTrace.task("focus."+kind,()->{
                    long start=System.nanoTime();
                    var selected=new HashSet<>(dimensions(kind));
                    if(maintenance&&kind.equals("defects"))selected.add("maintenancePriority");
                    var result=decode(mapper.focusSnapshot(ids,kind,filter,selected));
                    LoggerFactory.getLogger(AgentFocusQueries.class).info("agent focus kind={} durationMs={}",kind,TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-start));
                    return result;
                }));
                business.put(kind,future);futures.add(future);
            }
            var coverage=executor.submit(com.bridgemind.diagnostics.QueryTrace.task("focus.monitoringCoverage",()->readings.coverage(ids,filter)));futures.add(coverage);
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
