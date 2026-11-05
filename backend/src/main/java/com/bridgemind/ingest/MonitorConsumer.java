package com.bridgemind.ingest;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.springframework.stereotype.Component;
import org.springframework.core.env.Environment;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.TopicPartition;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import io.micrometer.core.instrument.MeterRegistry;

/** Worker owns consumer; failures close it without committing pending records. */
@Component
public class MonitorConsumer {
    private static final org.slf4j.Logger LOG=org.slf4j.LoggerFactory.getLogger(MonitorConsumer.class);
    private final Environment env;private final MonitorStore store;
    private volatile boolean running;private Thread worker;
    private long lastStatusNanos;
    private final AtomicLong success=new AtomicLong(),failures=new AtomicLong(),quarantined=new AtomicLong(),lag=new AtomicLong(-1);
    public MonitorConsumer(Environment env,MonitorStore store,MeterRegistry registry) {
        this.env=env;this.store=store;
        registry.gauge("bridge.monitor.last.success.epoch",success);registry.gauge("bridge.monitor.failures",failures);
        registry.gauge("bridge.monitor.quarantined",quarantined);registry.gauge("bridge.monitor.lag",lag);
    }
    @PostConstruct public void start() {
        if(!env.getProperty("bridgemind.kafka.enabled",Boolean.class,false)){LOG.info("Kafka monitoring disabled; no consumer started");return;}
        String mode=env.getProperty("bridgemind.kafka.mode","consume");
        if("probe".equals(mode)) {
            running=true;worker=Thread.ofPlatform().daemon().name("monitor-kafka-probe").start(this::runProbe);return;
        }
        if(!"consume".equals(mode)){failures.incrementAndGet();LOG.error("Kafka monitoring disabled: invalid mode (expected consume or probe)");return;}
        if(!env.getProperty("bridgemind.kafka.contract-verified",Boolean.class,false)) {
            failures.incrementAndGet();org.slf4j.LoggerFactory.getLogger(getClass()).error("Kafka monitoring disabled: contract verification required");return;
        }
        LOG.info("Kafka monitoring starting; batchSize={} maxPollRecords={} manualCommit=true contractVerified=true",batchSize(),properties().getProperty("max.poll.records"));
        running=true;worker=Thread.ofPlatform().daemon().name("monitor-kafka").start(this::run);
    }
    Properties properties() {
        Properties p=new Properties();
        p.put("bootstrap.servers",env.getProperty("bridgemind.kafka.bootstrap-servers","172.27.9.16:21007,172.27.9.17:21007,172.27.9.18:21007"));
        p.put("group.id",env.getProperty("bridgemind.kafka.group-id","bridgemind-ql-ssjc-v1"));
        p.put("enable.auto.commit","false");p.put("auto.offset.reset","latest");p.put("isolation.level","read_committed");
        p.put("max.poll.records",Integer.toString(bounded("max-poll-records",500)));
        p.put("max.poll.interval.ms",env.getProperty("bridgemind.kafka.max-poll-interval-ms","300000"));
        p.put("key.deserializer","org.apache.kafka.common.serialization.StringDeserializer");p.put("value.deserializer","org.apache.kafka.common.serialization.StringDeserializer");
        p.put("security.protocol",env.getProperty("bridgemind.kafka.security-protocol","SASL_PLAINTEXT"));
        p.put("sasl.mechanism",env.getProperty("bridgemind.kafka.sasl-mechanism","GSSAPI"));
        p.put("sasl.kerberos.service.name",env.getProperty("bridgemind.kafka.kerberos-service-name","kafka"));return p;
    }
    Properties probeProperties() {
        var p=properties();p.remove("group.id");
        p.put("client.id","bridgemind-readonly-probe");p.put("allow.auto.create.topics","false");p.put("auto.offset.reset","none");
        p.put("enable.auto.commit","false");p.put("max.poll.records","3");
        p.put("request.timeout.ms","10000");p.put("default.api.timeout.ms","10000");
        p.put("key.deserializer","org.apache.kafka.common.serialization.ByteArrayDeserializer");
        p.put("value.deserializer","org.apache.kafka.common.serialization.ByteArrayDeserializer");return p;
    }
    private void runProbe() {
        String id=UUID.randomUUID().toString();
        try {
            int limit=env.getProperty("bridgemind.kafka.probe-max-records",Integer.class,3);
            int seconds=env.getProperty("bridgemind.kafka.probe-timeout-seconds",Integer.class,30);
            if(limit<1||limit>10||seconds<1||seconds>300)throw new IllegalArgumentException("INVALID_PROBE_LIMIT");
            LOG.info("Kafka probe start id={} maxRecords={} timeoutSeconds={} start=latest fullMessages=true databaseWrites=0 offsetCommits=0 group=none",id,limit,seconds);
            try(var consumer=new KafkaConsumer<byte[],byte[]>(probeProperties())) {
                int count=KafkaProbe.collect(consumer,env.getProperty("bridgemind.kafka.topic","STD_QL_JC_SSJC"),limit,
                    Duration.ofSeconds(seconds),()->running,System::nanoTime,message->LOG.info("Kafka probe message id={} data={}",id,message));
                LOG.info("Kafka probe complete id={} samples={} databaseWrites=0 offsetCommits=0; probe will not restart until application restart",id,count);
            }
        } catch(RuntimeException e){failures.incrementAndGet();LOG.warn("Kafka probe failed id={} {}; databaseWrites=0 offsetCommits=0; no automatic retry or consume fallback",id,safeFailure(e));}
        finally{running=false;}
    }
    private void run() {
        while(running) {
            try(var consumer=new KafkaConsumer<String,String>(properties())) {
                consumer.subscribe(List.of(env.getProperty("bridgemind.kafka.topic","STD_QL_JC_SSJC")),new ConsumerRebalanceListener() {
                    public void onPartitionsRevoked(Collection<TopicPartition> partitions) { LOG.info("Kafka partitions revoked: {}",partitions); }
                    public void onPartitionsAssigned(Collection<TopicPartition> partitions) { initializeOffsets(consumer,partitions); LOG.info("Kafka partitions assigned: {}",partitions); }
                });
                while(running) {
                    var records=consumer.poll(Duration.ofSeconds(1));
                    var batch=new ArrayList<ConsumerRecord<String,String>>();
                    for(var r:records) {
                        if(!running)break;
                        batch.add(r);
                        if(batch.size()==batchSize()){processBatch(consumer,batch);batch.clear();}
                    }
                    if(running&&!batch.isEmpty())processBatch(consumer,batch);
                    long total=0;boolean known=true;for(var tp:consumer.assignment()){var l=consumer.currentLag(tp);if(l.isEmpty())known=false;else total+=l.getAsLong();}lag.set(known&&!consumer.assignment().isEmpty()?total:-1);
                    if(System.nanoTime()-lastStatusNanos>Duration.ofSeconds(30).toNanos()) {
                        lastStatusNanos=System.nanoTime();LOG.info("Kafka status assigned={} lag={} lastSuccessEpoch={} failures={} quarantined={} ownerCache={}",consumer.assignment(),lag.get(),success.get(),failures.get(),quarantined.get(),store.cacheStats());
                    }
                }
            } catch(RuntimeException e) {
                lag.set(-1);failures.incrementAndGet();LOG.warn("Kafka monitoring reconnect in 5000ms; {}",safeFailure(e));
                try{Thread.sleep(5000);}catch(InterruptedException interrupted){Thread.currentThread().interrupt();return;}
            }
        }
    }
    // Persist the initial latest boundary before processing: a first-message failure must not skip it on reconnect.
    static void initializeOffsets(Consumer<String,String> consumer,Collection<TopicPartition> partitions) {
        var committed=consumer.committed(new HashSet<>(partitions));var initial=new HashMap<TopicPartition,OffsetAndMetadata>();
        for(var tp:partitions)if(committed.get(tp)==null)initial.put(tp,new OffsetAndMetadata(consumer.position(tp)));
        if(!initial.isEmpty())consumer.commitSync(initial);
    }
    private int bounded(String name,int fallback){int n=env.getProperty("bridgemind.kafka."+name,Integer.class,fallback);if(n<1||n>1000)throw new IllegalArgumentException("INVALID_BATCH_LIMIT");return n;}
    private int batchSize(){return bounded("batch-size",200);}
    void processBatch(Consumer<String,String> consumer,List<ConsumerRecord<String,String>> records) {
        if(records.isEmpty())return;
        var inputs=new ArrayList<MonitorStore.Input>();var offsets=new LinkedHashMap<TopicPartition,OffsetAndMetadata>();
        for(var r:records){inputs.add(new MonitorStore.Input(r.topic(),r.partition(),r.offset(),r.key(),r.value()));
            var tp=new TopicPartition(r.topic(),r.partition());var previous=offsets.get(tp);
            if(previous!=null&&r.offset()<previous.offset())throw new IllegalArgumentException("NON_MONOTONIC_BATCH");
            offsets.put(tp,new OffsetAndMetadata(r.offset()+1));}
        String id=UUID.randomUUID().toString();long start=System.nanoTime();String phase="database";
        LOG.info("Kafka batch start id={} records={} nextOffsets={}",id,records.size(),offsets);
        try {
            var result=store.acceptBatch(inputs);long stored=System.nanoTime();phase="offsetCommit";
            consumer.commitSync(offsets);success.set(System.currentTimeMillis()/1000);quarantined.addAndGet(result.quarantined());
            LOG.info("Kafka batch complete id={} received={} applied={} duplicate={} stale={} quarantined={} dbMs={} commitMs={} nextOffsets={} ownerCache={}",
                id,result.received(),result.applied(),result.duplicate(),result.stale(),result.quarantined(),(stored-start)/1000000,(System.nanoTime()-stored)/1000000,offsets,store.cacheStats());
        } catch(RuntimeException e){LOG.warn("Kafka batch failed id={} phase={} elapsedMs={} nextOffsets={} {}; reconnect will replay uncommitted records",id,phase,(System.nanoTime()-start)/1000000,offsets,safeFailure(e));throw e;}
    }
    /** Do not log Throwable messages: drivers may include SQL values or authentication material. */
    static String safeFailure(Throwable failure) {
        var parts=new ArrayList<String>();var seen=Collections.newSetFromMap(new IdentityHashMap<Throwable,Boolean>());
        for(Throwable e=failure;e!=null&&seen.add(e)&&parts.size()<8;e=e.getCause()) {
            String part=e.getClass().getSimpleName();
            if(e instanceof java.sql.SQLException sql){part+="[sqlState="+sql.getSQLState()+",vendorCode="+sql.getErrorCode()+"]";}
            for(var frame:e.getStackTrace())if(frame.getClassName().startsWith("com.bridgemind.")){part+="@"+frame.getClassName()+"."+frame.getMethodName()+":"+frame.getLineNumber();break;}
            parts.add(part);
        }
        return String.join(" <- ",parts);
    }
    void process(Consumer<String,String> consumer,ConsumerRecord<String,String> r) {
        String outcome=store.accept(r.topic(),r.partition(),r.offset(),r.key(),r.value());
        consumer.commitSync(Map.of(new TopicPartition(r.topic(),r.partition()),new OffsetAndMetadata(r.offset()+1)));
        success.set(System.currentTimeMillis()/1000);if("QUARANTINED".equals(outcome))quarantined.incrementAndGet();
    }
    @PreDestroy public void stop() {LOG.info("Kafka monitoring stopping; lastSuccessEpoch={} failures={} quarantined={} lag={}",success.get(),failures.get(),quarantined.get(),lag.get());running=false;if(worker!=null){worker.interrupt();try{worker.join(10000);}catch(InterruptedException e){Thread.currentThread().interrupt();}}}
}
