package com.bridgemind.ingest;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import com.bridgemind.monitoring.mapper.MonitoringMapper;
import com.bridgemind.monitoring.model.resp.*;
import com.bridgemind.work.model.WorkFilter;
import java.time.LocalDateTime;
import java.util.*;

@Service
public class MonitorReadings {
    private final JdbcTemplate db;
    private final MonitoringMapper metadata;
    public MonitorReadings(@Qualifier("dataSource") DataSource ds,MonitoringMapper metadata) {
        db=new JdbcTemplate(ds);db.setQueryTimeout(30);this.metadata=metadata;
    }
    public List<SampleResponse> samples(String city,String point,String device,String metric,LocalDateTime from,LocalDateTime to) {
        return db.query("SELECT jccjsj,jcz FROM bridge_agent.bm_monitor_sample WHERE city=? AND dwbsm=? AND sbbsm=? AND jczb IS NOT DISTINCT FROM CAST(? AS text) AND sjtbzt<>'D' AND jccjsj BETWEEN ? AND ? ORDER BY jccjsj,bsm LIMIT 2001",
            (rs,n)->new SampleResponse(rs.getTimestamp(1).toLocalDateTime(),rs.getString(2),null),city,point,device,metric,from,to);
    }
    /** Full-period aggregates, never the chart's 2001-row preview. One SQL statement snapshot. */
    public List<Map<String,Object>> reportStats(String city,List<MonitorPointResponse> points,LocalDateTime from,LocalDateTime to) {
        if(points.isEmpty())return List.of();
        var values=new ArrayList<String>();var args=new ArrayList<Object>();
        for(var p:points){values.add("(CAST(? AS text),CAST(? AS text),CAST(? AS text))");args.add(p.pointId());args.add(p.deviceId());args.add(p.metric());}
        args.add(city);args.add(from);args.add(to);
        return db.queryForList("WITH channels(point,device,metric) AS (VALUES "+String.join(",",values)+") SELECT c.point,c.device,c.metric,count(s.bsm) AS samples,count(s.jcz) AS valid_samples,min(s.jcz) AS minimum,max(s.jcz) AS maximum,avg(s.jcz) AS average,min(s.jccjsj) AS first_time,max(s.jccjsj) AS last_time FROM channels c LEFT JOIN bridge_agent.bm_monitor_sample s ON s.dwbsm=c.point AND s.sbbsm=c.device AND s.jczb IS NOT DISTINCT FROM c.metric AND s.city=? AND s.sjtbzt<>'D' AND s.jccjsj>=? AND s.jccjsj<? GROUP BY c.point,c.device,c.metric ORDER BY c.point,c.device,c.metric",args.toArray());
    }
    private List<Map<String,Object>> aggregates(List<Map<String,String>> channels,WorkFilter filter) {
        var rows=new ArrayList<Map<String,Object>>();
        for(int start=0;start<channels.size();start+=250) {
            var batch=channels.subList(start,Math.min(start+250,channels.size()));var args=new ArrayList<Object>();
            var values=new ArrayList<String>();
            for(var c:batch){values.add("(CAST(? AS text),CAST(? AS text),CAST(? AS text),CAST(? AS text),CAST(? AS text))");for(String k:List.of("bridge","city","point","device","metric"))args.add(c.get(k));}
            String sql="WITH channels(bridge,city,point,device,metric) AS (VALUES "+String.join(",",values)+") SELECT c.bridge,c.city,c.point,c.device,c.metric,count(s.bsm) AS n,min(s.jccjsj) AS first,max(s.jccjsj) AS last FROM channels c LEFT JOIN bridge_agent.bm_monitor_sample s ON s.city=c.city AND s.dwbsm=c.point AND s.sbbsm=c.device AND s.jczb IS NOT DISTINCT FROM c.metric AND s.sjtbzt<>'D'";
            if(filter.from()!=null){sql+=" AND s.jccjsj>=?";args.add(filter.from().atStartOfDay());}
            if(filter.to()!=null){sql+=" AND s.jccjsj<?";args.add(filter.to().plusDays(1).atStartOfDay());}
            final String query=sql+" GROUP BY c.bridge,c.city,c.point,c.device,c.metric";
            final String name="MonitorReadings.coverageAggregate.batch"+(start/250+1);
            rows.addAll(com.bridgemind.diagnostics.QueryTrace.jdbc(name,()->db.queryForList(query,args.toArray())));
        }
        return rows;
    }
    public List<LatestSampleResponse> latest(String city,List<MonitorPointResponse> points) {
        var channels=new ArrayList<Map<String,String>>();
        for(var p:points){var c=new HashMap<String,String>();c.put("bridge","");c.put("city",city);c.put("point",p.pointId());c.put("device",p.deviceId());c.put("metric",p.metric());channels.add(c);}
        return aggregates(channels,WorkFilter.all()).stream().filter(r->r.get("last")!=null)
            .map(r->new LatestSampleResponse((String)r.get("point"),(String)r.get("device"),(String)r.get("metric"),((java.sql.Timestamp)r.get("last")).toLocalDateTime()))
            .sorted(Comparator.comparing(LatestSampleResponse::pointId).thenComparing(LatestSampleResponse::deviceId).thenComparing(LatestSampleResponse::metric,Comparator.nullsFirst(Comparator.naturalOrder()))).toList();
    }
    public Map<String,Object> coverage(List<String> ids,WorkFilter filter) {
        org.slf4j.LoggerFactory.getLogger(getClass()).info("monitoring coverage start {} bridgeCount={} hasFrom={} hasTo={}",com.bridgemind.diagnostics.QueryTrace.context(),ids.size(),filter.from()!=null,filter.to()!=null);
        var channels=metadata.channels(ids);
        org.slf4j.LoggerFactory.getLogger(getClass()).info("monitoring coverage channels ready {} channels={} batches={}",com.bridgemind.diagnostics.QueryTrace.context(),channels.size(),(channels.size()+249)/250);
        var rows=aggregates(channels,filter);
        var configured=new HashSet<String>();var withReadings=new HashSet<String>();var keys=new HashSet<List<Object>>();
        long readings=0;java.sql.Timestamp first=null,last=null;
        for(var row:rows) {
            configured.add((String)row.get("bridge"));long n=((Number)row.get("n")).longValue();readings+=n;
            if(n>0){withReadings.add((String)row.get("bridge"));keys.add(Arrays.asList(row.get("city"),row.get("point"),row.get("device"),row.get("metric")));}
            var f=(java.sql.Timestamp)row.get("first");var l=(java.sql.Timestamp)row.get("last");
            if(f!=null&&(first==null||f.before(first)))first=f;if(l!=null&&(last==null||l.after(last)))last=l;
        }
        var result=new LinkedHashMap<String,Object>();result.put("channel_count",channels.size());result.put("configured_bridges",configured.size());
        result.put("reading_count",readings);result.put("bridges_with_readings",withReadings.size());result.put("channels_with_readings",keys.size());
        result.put("first_time",first==null?null:first.toString());result.put("last_time",last==null?null:last.toString());return result;
    }
}
