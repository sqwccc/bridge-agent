package com.bridgemind.report.service;

import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.bridge.model.resp.BridgeResponse;
import com.bridgemind.monitoring.service.MonitoringService;
import com.bridgemind.monitoring.model.resp.*;
import com.bridgemind.ingest.MonitorReadings;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;
import java.math.BigDecimal;

@Service
public class MonitoringReportService {
    private final BridgeService bridges;private final MonitoringService monitoring;private final MonitorReadings readings;
    public MonitoringReportService(BridgeService bridges,MonitoringService monitoring,MonitorReadings readings) {
        this.bridges=bridges;this.monitoring=monitoring;this.readings=readings;
    }
    public record Channel(MonitorPointResponse point,long samples,long validSamples,BigDecimal minimum,BigDecimal maximum,
        BigDecimal average,String firstTime,String lastTime,List<ThresholdResponse> thresholds) {}
    public record Document(String id,String generatedAt,String timezone,LocalDate from,LocalDate to,BridgeResponse bridge,
        long samples,long validSamples,long configuredDevices,long configuredPoints,long channelsWithData,List<Channel> channels) {}
    public Document generate(String id,LocalDate from,LocalDate to) {
        if(from==null||to==null||to.isBefore(from)||java.time.temporal.ChronoUnit.DAYS.between(from,to)>=31)
            throw new IllegalArgumentException("统计区间须为1至31个自然日");
        var bridge=bridges.require(id);
        var points=monitoring.points(id).stream().collect(java.util.stream.Collectors.toMap(
            p->Arrays.asList(p.pointId(),p.deviceId(),p.metric()),p->p,(a,b)->a,LinkedHashMap::new)).values().stream().toList();
        var thresholds=monitoring.thresholds(id,null,null,null);
        var stats=readings.reportStats(bridge.cityCode(),points,from.atStartOfDay(),to.plusDays(1).atStartOfDay());
        var indexed=new HashMap<List<String>,Map<String,Object>>();
        for(var r:stats)indexed.put(Arrays.asList((String)r.get("point"),(String)r.get("device"),(String)r.get("metric")),r);
        var channels=new ArrayList<Channel>();
        for(var p:points) {
            var r=indexed.get(Arrays.asList(p.pointId(),p.deviceId(),p.metric()));
            if(r==null)throw new IllegalStateException("监测统计返回不完整");
            var ts=thresholds.stream().filter(t->Objects.equals(t.pointId(),p.pointId())&&Objects.equals(t.deviceId(),p.deviceId())&&Objects.equals(t.metric(),p.metric())).toList();
            channels.add(new Channel(p,((Number)r.get("samples")).longValue(),((Number)r.get("valid_samples")).longValue(),
                (BigDecimal)r.get("minimum"),(BigDecimal)r.get("maximum"),(BigDecimal)r.get("average"),stamp(r.get("first_time")),stamp(r.get("last_time")),ts));
        }
        return new Document("JC-"+UUID.randomUUID(),LocalDateTime.now(ZoneId.of("Asia/Shanghai")).toString(),"Asia/Shanghai",from,to,bridge,
            channels.stream().mapToLong(Channel::samples).sum(),channels.stream().mapToLong(Channel::validSamples).sum(),
            points.stream().map(MonitorPointResponse::deviceId).distinct().count(),points.stream().map(MonitorPointResponse::pointId).distinct().count(),
            channels.stream().filter(c->c.samples()>0).count(),List.copyOf(channels));
    }
    private static String stamp(Object value){return value==null?null:((java.sql.Timestamp)value).toLocalDateTime().toString();}
}
