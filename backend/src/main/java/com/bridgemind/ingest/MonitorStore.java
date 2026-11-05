package com.bridgemind.ingest;

import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.stereotype.Service;
import java.util.*;
import com.bridgemind.monitoring.mapper.MonitoringMapper;

@Service
public class MonitorStore {
    private final JdbcTemplate db;
    private final TransactionTemplate tx;
    private final ChannelOwnershipCache owners;
    @org.springframework.beans.factory.annotation.Autowired
    public MonitorStore(@Qualifier("dataSource") DataSource ds,ChannelOwnershipCache owners) {
        db=new JdbcTemplate(ds); db.setQueryTimeout(15);
        tx=new TransactionTemplate(new DataSourceTransactionManager(ds)); this.owners=owners;
    }
    MonitorStore(JdbcTemplate db,TransactionTemplate tx,MonitoringMapper metadata) {
        this.db=db;this.tx=tx;this.owners=new ChannelOwnershipCache(metadata,com.github.benmanes.caffeine.cache.Caffeine.newBuilder().maximumSize(100).build());
    }
    public record Input(String topic,int partition,long offset,String key,String raw) {}
    record BusinessKey(String city,String bsm) implements Comparable<BusinessKey> {
        public int compareTo(BusinessKey k){int c=city.compareTo(k.city);return c==0?bsm.compareTo(k.bsm):c;}
    }
    record Version(java.time.LocalDateTime time,String content) {}
    record Pending(Input input,MonitorMessage message,String city,String bridge,String reason) {}
    public record BatchResult(int received,int applied,int duplicate,int stale,int quarantined) {}
    public String cacheStats(){return owners.stats();}
    public BatchResult acceptBatch(List<Input> input) {
        if(input.isEmpty())return new BatchResult(0,0,0,0,0);
        if(input.size()>1000)throw new IllegalArgumentException("BATCH_TOO_LARGE");
        return tx.execute(status->writeBatch(input));
    }
    private BatchResult writeBatch(List<Input> input) {
        // RETURNING, rather than JDBC update counts, identifies only rows inserted by this transaction.
        var args=new ArrayList<Object>();var tuples=new ArrayList<String>();
        for(var r:input){tuples.add("(?,?,?,?,?,'RECEIVED')");Collections.addAll(args,r.topic(),r.partition(),r.offset(),r.key(),r.raw());}
        var inserted=db.queryForList("INSERT INTO bridge_agent.bm_monitor_inbox(topic,partition_id,offset_id,message_key,payload,status) VALUES "+String.join(",",tuples)+" ON CONFLICT DO NOTHING RETURNING topic,partition_id,offset_id",args.toArray());
        var fresh=new HashSet<List<Object>>();
        for(var row:inserted)fresh.add(List.of(row.get("topic"),((Number)row.get("partition_id")).intValue(),((Number)row.get("offset_id")).longValue()));
        var pending=new ArrayList<Pending>();var keys=new TreeSet<BusinessKey>();
        // Batch-local memo also avoids repeated ambiguous lookups without retaining them across batches.
        var scope=new HashMap<ChannelOwnershipCache.Key,List<Map<String,String>>>();
        for(var r:input) {
            if(!fresh.remove(List.of(r.topic(),r.partition(),r.offset())))continue;
            MonitorMessage m;
            try {m=MonitorMessage.parse(r.raw());}catch(IllegalArgumentException e){pending.add(new Pending(r,null,null,null,"INVALID_MESSAGE"));continue;}
            var resolved=scope.computeIfAbsent(new ChannelOwnershipCache.Key(m.dwbsm(),m.sbbsm(),m.jczb()),k->owners.resolve(m));
            if(resolved.size()!=1){pending.add(new Pending(r,m,null,null,"AMBIGUOUS_OR_MISSING_OWNER"));continue;}
            var owner=resolved.getFirst();String city=owner.get("city"),bridge=owner.get("bridge");
            pending.add(new Pending(r,m,city,bridge,null));keys.add(new BusinessKey(city,m.bsm()));
        }
        var versions=new HashMap<BusinessKey,Version>();
        if(!keys.isEmpty()) {
            var placeholders=new ArrayList<String>();var keyArgs=new ArrayList<Object>();
            for(var k:keys){placeholders.add("(?,?)");Collections.addAll(keyArgs,k.city(),k.bsm());}
            db.update("INSERT INTO bridge_agent.bm_monitor_sample(city,bsm) VALUES "+String.join(",",placeholders)+" ON CONFLICT DO NOTHING",keyArgs.toArray());
            var where=new ArrayList<String>();for(var k:keys)where.add("(city=? AND bsm=?)");
            var locked=db.queryForList("SELECT city,bsm,tbsj,content FROM bridge_agent.bm_monitor_sample WHERE "+String.join(" OR ",where)+" ORDER BY city,bsm FOR UPDATE",keyArgs.toArray());
            for(var row:locked){var stamp=(java.sql.Timestamp)row.get("tbsj");versions.put(new BusinessKey((String)row.get("city"),(String)row.get("bsm")),new Version(stamp==null?null:stamp.toLocalDateTime(),(String)row.get("content")));}
            if(versions.size()!=keys.size())throw new IllegalStateException("BATCH_LOCK_INCOMPLETE");
        }
        var updates=new LinkedHashMap<BusinessKey,Object[]>();var statuses=new ArrayList<Object[]>();var bad=new ArrayList<Object[]>();
        int applied=0,stale=0;var reasons=new TreeMap<String,Integer>();
        for(var p:pending) {
            var r=p.input();var m=p.message();String reason=p.reason(),outcome="APPLIED";
            if(reason==null) {
                var k=new BusinessKey(p.city(),m.bsm());var old=versions.get(k);String content=m.toString();
                if(old.time()!=null&&m.tbsj().isBefore(old.time())){outcome="STALE";stale++;}
                else if(old.time()!=null&&m.tbsj().equals(old.time())&&!content.equals(old.content()))reason="VERSION_CONFLICT";
                else {applied++;versions.put(k,new Version(m.tbsj(),content));updates.put(k,new Object[]{p.bridge(),m.dwbsm(),m.sbbsm(),m.jczb(),m.jcz(),m.jccsj(),m.jcsbsj(),m.bz(),m.sbzt(),m.yskzjbz(),m.sjtbzt(),m.tbsj(),content,r.topic(),r.partition(),r.offset(),p.city(),m.bsm()});}
            }
            if(reason!=null){reasons.merge(reason,1,Integer::sum);outcome="QUARANTINED";bad.add(new Object[]{r.topic(),r.partition(),r.offset(),reason});}
            statuses.add(new Object[]{outcome,p.city(),p.bridge(),r.topic(),r.partition(),r.offset()});
        }
        if(!updates.isEmpty())db.batchUpdate("UPDATE bridge_agent.bm_monitor_sample SET bridge_id=?,dwbsm=?,sbbsm=?,jczb=?,jcz=?,jccjsj=?,jcsbsj=?,bz=?,sbzt=?,yskzjbz=?,sjtbzt=?,tbsj=?,content=?,topic=?,partition_id=?,offset_id=?,received_at=CURRENT_TIMESTAMP WHERE city=? AND bsm=?",new ArrayList<>(updates.values()));
        if(!bad.isEmpty())db.batchUpdate("INSERT INTO bridge_agent.bm_monitor_quarantine(topic,partition_id,offset_id,reason) VALUES(?,?,?,?)",bad);
        if(!statuses.isEmpty())db.batchUpdate("UPDATE bridge_agent.bm_monitor_inbox SET status=?,city=?,bridge_id=? WHERE topic=? AND partition_id=? AND offset_id=?",statuses);
        if(!reasons.isEmpty())org.slf4j.LoggerFactory.getLogger(getClass()).info("Kafka batch quarantine reasons={} records={}",reasons,bad.size());
        return new BatchResult(input.size(),applied,input.size()-pending.size(),stale,bad.size());
    }
    public String accept(String topic,int partition,long offset,String key,String raw) {
        return tx.execute(status->{
            int inserted=db.update("INSERT INTO bridge_agent.bm_monitor_inbox(topic,partition_id,offset_id,message_key,payload,status) VALUES(?,?,?,?,?,'RECEIVED') ON CONFLICT DO NOTHING",topic,partition,offset,key,raw);
            if(inserted==0)return "DUPLICATE";
            return process(topic,partition,offset,raw);
        });
    }
    /** Internal operations entry point; intentionally no HTTP controller. */
    public String reprocess(String topic,int partition,long offset) {
        return tx.execute(status->{
            var rows=db.queryForList("SELECT payload,status FROM bridge_agent.bm_monitor_inbox WHERE topic=? AND partition_id=? AND offset_id=? FOR UPDATE",topic,partition,offset);
            if(rows.size()!=1)throw new IllegalArgumentException("MESSAGE_NOT_FOUND");
            if(!"QUARANTINED".equals(rows.getFirst().get("status")))return rows.getFirst().get("status").toString();
            String raw=(String)rows.getFirst().get("payload");
            try { owners.invalidate(MonitorMessage.parse(raw)); } catch(IllegalArgumentException ignored) { /* parser will isolate */ }
            return process(topic,partition,offset,raw);
        });
    }
    private String process(String topic,int partition,long offset,String raw) {
        MonitorMessage m;
        try { m=MonitorMessage.parse(raw); }
        catch(IllegalArgumentException e){return quarantine(topic,partition,offset,"INVALID_MESSAGE");}
        var resolved=owners.resolve(m);
        if(resolved.size()!=1)return quarantine(topic,partition,offset,"AMBIGUOUS_OR_MISSING_OWNER");
        String city=resolved.getFirst().get("city"),bridge=resolved.getFirst().get("bridge");
        // Serialize versions of one city/business key, including the first insert.
        db.update("INSERT INTO bridge_agent.bm_monitor_sample(city,bsm) VALUES(?,?) ON CONFLICT DO NOTHING",city,m.bsm());
        var previous=db.queryForMap("SELECT tbsj,content FROM bridge_agent.bm_monitor_sample WHERE city=? AND bsm=? FOR UPDATE",city,m.bsm());
        var stamp=(java.sql.Timestamp)previous.get("tbsj");
        String content=m.toString();
        String result="APPLIED";
        if(stamp!=null&&m.tbsj().isBefore(stamp.toLocalDateTime())) result="STALE";
        else if(stamp!=null&&m.tbsj().equals(stamp.toLocalDateTime())&&!content.equals(previous.get("content")))
            return quarantine(topic,partition,offset,"VERSION_CONFLICT");
        else db.update("UPDATE bridge_agent.bm_monitor_sample SET bridge_id=?,dwbsm=?,sbbsm=?,jczb=?,jcz=?,jccjsj=?,jcsbsj=?,bz=?,sbzt=?,yskzjbz=?,sjtbzt=?,tbsj=?,content=?,topic=?,partition_id=?,offset_id=?,received_at=CURRENT_TIMESTAMP WHERE city=? AND bsm=?",
            bridge,m.dwbsm(),m.sbbsm(),m.jczb(),m.jcz(),m.jccsj(),m.jcsbsj(),m.bz(),m.sbzt(),m.yskzjbz(),m.sjtbzt(),m.tbsj(),content,topic,partition,offset,city,m.bsm());
        db.update("UPDATE bridge_agent.bm_monitor_inbox SET status=?,city=?,bridge_id=? WHERE topic=? AND partition_id=? AND offset_id=?",result,city,bridge,topic,partition,offset);
        db.update("DELETE FROM bridge_agent.bm_monitor_quarantine WHERE topic=? AND partition_id=? AND offset_id=?",topic,partition,offset);
        return result;
    }
    private String quarantine(String topic,int partition,long offset,String reason) {
        db.update("INSERT INTO bridge_agent.bm_monitor_quarantine(topic,partition_id,offset_id,reason) VALUES(?,?,?,?) ON CONFLICT(topic,partition_id,offset_id) DO UPDATE SET reason=EXCLUDED.reason",topic,partition,offset,reason);
        db.update("UPDATE bridge_agent.bm_monitor_inbox SET status='QUARANTINED' WHERE topic=? AND partition_id=? AND offset_id=?",topic,partition,offset);
        return "QUARANTINED";
    }
}
