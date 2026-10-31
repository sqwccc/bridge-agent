package com.bridgemind.agent;

import com.bridgemind.monitoring.model.resp.*;
import com.bridgemind.monitoring.service.MonitoringService;
import org.springframework.stereotype.Service;
import java.time.*;
import java.util.*;

/** All computations use server-fetched values; presentation and model share this evidence. */
@Service
public class MonitoringAnalysis {
    private final MonitoringService service;
    public MonitoringAnalysis(MonitoringService service) { this.service = service; }

    public Map<String,Object> analyze(String bridge, MonitoringQuery query) {
        var all = service.points(bridge);
        var result = new LinkedHashMap<String,Object>();
        var to = query.to() == null ? LocalDateTime.now(ZoneId.of("Asia/Shanghai")).withNano(0) : query.to();
        var from = query.from() == null ? to.minusHours(24) : query.from();
        result.put("from", from); result.put("to", to); result.put("timezone", "Asia/Shanghai");
        result.put("analysis", query.analysis()); result.put("bridgeId", bridge);
        result.put("source", "现有监测数据库，只读查询");
        result.put("limitations", "阈值配置为当前最新有效快照，不受读数起止时间筛选，未验证其在历史时段是否生效。独立阈值区间仅作参考比较；边界包含规则未定义，不重新生成报警。统计异常不等于结构异常，相关不等于因果。未提供预期采样频率，不计算缺测率。");
        var selected = new LinkedHashSet<MonitorPointResponse>();
        var pool = all.stream().filter(p -> query.metric().isBlank() || query.metric().equals(p.metric())
                || query.metric().equals(p.metricName())
                || p.metricName().endsWith("_"+query.metric())).toList();
        boolean ambiguous = false;
        if (query.targets().isEmpty()) selected.addAll(pool);
        else for (String target : query.targets()) {
            var exact = pool.stream().filter(p -> target.equals(p.deviceId()) || target.equals(p.pointId())
                    || target.equals(p.pointName()) || target.equals(p.deviceName())).toList();
            var hits = exact.isEmpty() ? pool.stream().filter(p -> Objects.toString(p.pointName(), "").contains(target)
                    || Objects.toString(p.deviceName(), "").contains(target)
                    || Objects.toString(p.pointId(), "").contains(target) || Objects.toString(p.deviceId(), "").contains(target)).toList() : exact;
            if (hits.size() != 1) ambiguous = true;
            selected.addAll(hits);
        }
        int cap = query.analysis().equals("correlation") ? 2 : 4;
        if (ambiguous || selected.isEmpty() || selected.size() > cap
                || (query.analysis().equals("correlation") && selected.size() != 2)) {
            result.put("status", "clarification_required");
            result.put("message", "请明确" + (cap == 2 ? "两条" : "一至四条") + "本桥测点/设备及指标；指定对象不存在或匹配不唯一时，不扩大到全桥分析。");
            result.put("candidates", (selected.isEmpty() ? pool : selected.stream().toList()).stream().limit(20).toList());
            result.put("candidateTotal", selected.isEmpty() ? pool.size() : selected.size());
            return result;
        }
        if (query.analysis().equals("compare") && (selected.stream().anyMatch(p -> p.unit() == null)
                || selected.stream().map(p -> p.metric() + ":" + p.unit()).distinct().count() != 1)) {
            result.put("status", "clarification_required");
            result.put("message", "峰值比较需要相同指标且单位明确的通道，请重新选择。"); return result;
        }
        var channels = new ArrayList<Map<String,Object>>();
        var series = new ArrayList<List<SampleResponse>>();
        boolean truncated = false;
        for (var p : selected) {
            if (Thread.currentThread().isInterrupted()) throw new IllegalStateException("查询已停止");
            var channel = new LinkedHashMap<String,Object>();
            channel.put("point", p);
            var thresholds = service.thresholds(bridge, p.pointId(), p.deviceId(), p.metric());
            channel.put("thresholds", thresholds);
            if (query.analysis().equals("thresholds")) { channels.add(channel); continue; }
            var pack = service.samples(bridge, p.pointId(), p.deviceId(), p.metric(), from, to);
            @SuppressWarnings("unchecked") var rows = (List<SampleResponse>) pack.get("items");
            boolean cut = Boolean.TRUE.equals(pack.get("truncated")); truncated |= cut;
            channel.put("truncated", cut);
            if (!cut) {
                var stats = statistics(rows);
                channel.put("statistics", stats);
                channel.put("samples", rows);
                channel.put("thresholdComparisons", compareThresholds(rows, thresholds));
                series.add(rows);
            }
            channels.add(channel);
        }
        result.put("channels", channels);
        result.put("truncated", truncated);
        result.put("status", truncated ? "range_too_large" : "available");
        if (truncated) {
            // Do not publish partial computations for a multi-channel query.
            channels.forEach(c -> { c.remove("statistics"); c.remove("samples"); c.remove("thresholdComparisons"); });
            result.put("message", "所选区间有通道超过2000条，请缩小时间范围；未以截断样本计算统计。");
        } else if (query.analysis().equals("correlation")) result.put("correlation", correlation(series.get(0), series.get(1)));
        return result;
    }

    public static Map<String,Object> statistics(List<SampleResponse> rows) {
        var out = new LinkedHashMap<String,Object>();
        var valid = rows.stream().filter(s -> s.time() != null && s.value() != null && Double.isFinite(s.value()))
                .sorted(Comparator.comparing(SampleResponse::time)).toList();
        out.put("sampleCount", rows.size()); out.put("validCount", valid.size());
        out.put("invalidCount", rows.size() - valid.size());
        out.put("duplicateTimes", valid.size() - valid.stream().map(SampleResponse::time).distinct().count());
        out.put("status", valid.isEmpty() ? "no_data" : "available");
        if (valid.isEmpty()) return out;
        var min = valid.stream().min(Comparator.comparingDouble(SampleResponse::value)).orElseThrow();
        var max = valid.stream().max(Comparator.comparingDouble(SampleResponse::value)).orElseThrow();
        var peak = valid.stream().max(Comparator.comparingDouble(s -> Math.abs(s.value()))).orElseThrow();
        double mean = valid.stream().mapToDouble(SampleResponse::value).average().orElseThrow();
        out.put("min", min.value()); out.put("max", max.value()); out.put("peak", Math.abs(peak.value()));
        out.put("minTime", min.time()); out.put("maxTime", max.time()); out.put("peakTime", peak.time());
        out.put("mean", mean); out.put("firstTime", valid.getFirst().time()); out.put("lastTime", valid.getLast().time());
        if (valid.stream().map(SampleResponse::time).distinct().count() >= 3) {
            double[] x = valid.stream().mapToDouble(s -> Duration.between(valid.getFirst().time(), s.time()).toMillis()/3600000.0).toArray();
            double xm = Arrays.stream(x).average().orElseThrow(), xx=0, xy=0, yy=0;
            for(int i=0;i<x.length;i++){double dx=x[i]-xm, dy=valid.get(i).value()-mean;xx+=dx*dx;xy+=dx*dy;yy+=dy*dy;}
            out.put("slopePerHour", xy/xx); out.put("rSquared", yy == 0 ? 0.0 : Math.min(1.0, xy*xy/(xx*yy)));
        } else out.put("trendUnavailable", "至少需要三个不同时间点");
        if(valid.size()>=6){
            double median=median(valid.stream().mapToDouble(SampleResponse::value).toArray());
            double mad=median(valid.stream().mapToDouble(s->Math.abs(s.value()-median)).toArray());
            if(mad>0)out.put("anomalyCount",valid.stream().filter(s->0.67448975*Math.abs(s.value()-median)/mad>3.5).count());
            else out.put("anomalyUnavailable","MAD为零，无法可靠判定统计异常");
        }else out.put("anomalyUnavailable","至少需要六个有效样本");
        out.put("method","真实时间最小二乘趋势；稳健Z=0.67448975×|值−中位数|/MAD，>3.5为统计异常");
        return out;
    }
    private static double median(double[] a){Arrays.sort(a);return a.length%2==0?(a[a.length/2-1]+a[a.length/2])/2:a[a.length/2];}

    public static List<Map<String,Object>> compareThresholds(List<SampleResponse> rows,List<ThresholdResponse> thresholds){
        var output=new ArrayList<Map<String,Object>>();
        for(var t:thresholds){
            var r=new LinkedHashMap<String,Object>();r.put("id",t.id());r.put("levelName",t.levelName());
            if(t.lower()==null||t.upper()==null||t.lower().compareTo(t.upper())>=0||t.extremePlaceholder()) {
                r.put("status","invalid_or_incomplete");
            }else{
                var values=rows.stream().filter(s->s.value()!=null&&Double.isFinite(s.value())).mapToDouble(SampleResponse::value).toArray();
                r.put("status",values.length==0?"no_data":"reference_only");
                r.put("below",Arrays.stream(values).filter(v->v<t.lower().doubleValue()).count());
                r.put("above",Arrays.stream(values).filter(v->v>t.upper().doubleValue()).count());
                r.put("onBoundary",Arrays.stream(values).filter(v->v==t.lower().doubleValue()||v==t.upper().doubleValue()).count());
                r.put("note","仅比较来源区间上下限；边界未定义，不能转换为报警数量或安全结论");
            }output.add(r);
        }return output;
    }
    private static Map<Long,Double> buckets(List<SampleResponse> rows){
        var grouped=new TreeMap<Long,DoubleSummaryStatistics>();
        rows.stream().filter(s->s.time()!=null&&s.value()!=null&&Double.isFinite(s.value())).forEach(s->{
            long bucket=Math.floorDiv(s.time().atZone(ZoneId.of("Asia/Shanghai")).toEpochSecond(),1800);
            grouped.computeIfAbsent(bucket,k->new DoubleSummaryStatistics()).accept(s.value());
        });var means=new TreeMap<Long,Double>();grouped.forEach((k,v)->means.put(k,v.getAverage()));return means;
    }
    public static Map<String,Object> correlation(List<SampleResponse> a,List<SampleResponse> b){
        var x=buckets(a);var y=buckets(b);var pairs=new ArrayList<Map<String,Object>>();
        x.forEach((k,v)->{if(y.containsKey(k))pairs.add(Map.of("x",v,"y",y.get(k),"bucket",k));});
        var result=new LinkedHashMap<String,Object>();result.put("pairedCount",pairs.size());result.put("bucketMinutes",30);
        if(pairs.size()<6){result.put("status","insufficient_pairs");return result;}
        double xm=pairs.stream().mapToDouble(p->(Double)p.get("x")).average().orElseThrow();
        double ym=pairs.stream().mapToDouble(p->(Double)p.get("y")).average().orElseThrow(),xx=0,yy=0,xy=0;
        for(var p:pairs){double dx=(Double)p.get("x")-xm,dy=(Double)p.get("y")-ym;xx+=dx*dx;yy+=dy*dy;xy+=dx*dy;}
        if(xx==0||yy==0){result.put("status","zero_variance");return result;}
        result.put("status","available");result.put("r",Math.max(-1,Math.min(1,xy/Math.sqrt(xx*yy))));result.put("pairs",pairs);return result;
    }
}
