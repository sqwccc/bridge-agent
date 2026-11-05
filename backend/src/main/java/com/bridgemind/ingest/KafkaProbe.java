package com.bridgemind.ingest;

import org.apache.kafka.clients.consumer.Consumer;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.apache.kafka.common.TopicPartition;
import java.time.Duration;
import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.function.LongSupplier;
import java.nio.charset.StandardCharsets;
import tools.jackson.databind.json.JsonMapper;

/** Explicit diagnostic mode: no Store, no group subscription, no offset commits. */
final class KafkaProbe {
    private static final JsonMapper JSON=new JsonMapper();
    private KafkaProbe() {}
    static int collect(Consumer<byte[],byte[]> consumer,String topic,int limit,Duration timeout,
                       BooleanSupplier running,LongSupplier clock,java.util.function.Consumer<String> output) {
        long deadline=clock.getAsLong()+timeout.toNanos();
        if(!running.getAsBoolean())return 0;
        var partitions=consumer.partitionsFor(topic,remaining(deadline,clock)).stream()
            .map(p->new TopicPartition(p.topic(),p.partition())).toList();
        if(partitions.isEmpty())throw new IllegalStateException("PROBE_NO_PARTITIONS");
        consumer.assign(partitions);
        var ends=consumer.endOffsets(partitions,remaining(deadline,clock));
        for(var tp:partitions)consumer.seek(tp,ends.get(tp));
        int count=0;
        while(running.getAsBoolean()&&count<limit&&clock.getAsLong()<deadline) {
            var wait=remaining(deadline,clock);if(wait.compareTo(Duration.ofSeconds(1))>0)wait=Duration.ofSeconds(1);
            for(var record:consumer.poll(wait)) {
                if(!running.getAsBoolean()||clock.getAsLong()>=deadline)break;
                output.accept(completeMessage(record));
                if(++count>=limit)break;
            }
        }
        return count;
    }
    private static Duration remaining(long deadline,LongSupplier clock) {
        long nanos=deadline-clock.getAsLong();if(nanos<=0)throw new IllegalStateException("PROBE_DEADLINE_REACHED");
        return Duration.ofNanos(nanos);
    }
    // JSON escapes newlines/control characters, but does not redact or truncate payloads.
    // Base64 retains every byte, including binary/invalid UTF-8 payloads and headers.
    static String completeMessage(ConsumerRecord<byte[],byte[]> r) {
        var m=new LinkedHashMap<String,Object>();m.put("topic",r.topic());m.put("partition",r.partition());m.put("offset",r.offset());
        m.put("timestamp",r.timestamp());m.put("timestampType",r.timestampType().toString());
        m.put("keyUtf8",utf8(r.key()));m.put("valueUtf8",utf8(r.value()));m.put("keyBase64",base64(r.key()));m.put("valueBase64",base64(r.value()));
        var headers=new ArrayList<Map<String,Object>>();r.headers().forEach(h->{var entry=new LinkedHashMap<String,Object>();entry.put("key",h.key());entry.put("valueBase64",base64(h.value()));headers.add(entry);});m.put("headers",headers);
        return JSON.writeValueAsString(m);
    }
    private static String utf8(byte[] b){return b==null?null:new String(b,StandardCharsets.UTF_8);}
    private static String base64(byte[] b){return b==null?null:Base64.getEncoder().encodeToString(b);}
}
