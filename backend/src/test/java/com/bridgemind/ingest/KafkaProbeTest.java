package com.bridgemind.ingest;
import org.junit.jupiter.api.Test;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.*;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import java.nio.charset.StandardCharsets;
import org.springframework.mock.env.MockEnvironment;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class KafkaProbeTest {
    @SuppressWarnings("unchecked") final Consumer<byte[],byte[]> consumer=mock(Consumer.class);
    final TopicPartition tp=new TopicPartition("t",0);
    void setup() {
        when(consumer.partitionsFor(eq("t"),any(Duration.class))).thenReturn(List.of(new PartitionInfo("t",0,null,new Node[0],new Node[0])));
        when(consumer.endOffsets(eq(List.of(tp)),any(Duration.class))).thenReturn(Map.of(tp,50L));
    }
    @Test void logsExactlyThreeFullRecordsWithoutGroupOrCommits() {
        setup();var records=new ArrayList<ConsumerRecord<byte[],byte[]>>();
        for(int i=0;i<5;i++)records.add(new ConsumerRecord<>("t",0,50+i,null,("{\"id\":"+i+"}").getBytes(StandardCharsets.UTF_8)));
        when(consumer.poll(any(Duration.class))).thenReturn(new ConsumerRecords<>(Map.of(tp,records)));
        var output=new ArrayList<String>();assertEquals(3,KafkaProbe.collect(consumer,"t",3,Duration.ofSeconds(30),()->true,()->0L,output::add));
        assertEquals(3,output.size());verify(consumer).assign(List.of(tp));verify(consumer).seek(tp,50L);
        verify(consumer,never()).subscribe(anyCollection());verify(consumer,never()).commitSync();verify(consumer,never()).commitSync(anyMap());
    }
    @Test void retainsFullPayloadKeyHeadersAndNulls() {
        String value="{\"long\":\""+"中".repeat(10000)+"\"}\nend";
        var record=new ConsumerRecord<byte[],byte[]>("t",0,1,"full-key".getBytes(StandardCharsets.UTF_8),value.getBytes(StandardCharsets.UTF_8));
        record.headers().add("h",new byte[]{0,-1,1});String text=KafkaProbe.completeMessage(record);
        assertTrue(text.contains("中".repeat(10000)));assertTrue(text.contains("full-key"));assertTrue(text.contains(Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8))));assertTrue(text.contains("AP8B"));assertFalse(text.contains("\n"));
        assertTrue(KafkaProbe.completeMessage(new ConsumerRecord<byte[],byte[]>("t",0,2,null,null)).contains("\"valueUtf8\":null"));
    }
    @Test void timesOutWithoutRetryOrCommit() {
        setup();var clock=new AtomicLong();when(consumer.poll(any(Duration.class))).thenAnswer(a->{clock.addAndGet(Duration.ofSeconds(1).toNanos());return ConsumerRecords.empty();});
        assertEquals(0,KafkaProbe.collect(consumer,"t",3,Duration.ofSeconds(2),()->true,clock::get,s->fail()));verify(consumer,times(2)).poll(any(Duration.class));verify(consumer,never()).commitSync(anyMap());
    }
    @Test void probeConfigurationHasNoGroupAndNeverCallsStore() {
        var store=mock(MonitorStore.class);var worker=new MonitorConsumer(new MockEnvironment().withProperty("bridgemind.kafka.mode","probe"),store,new SimpleMeterRegistry());
        worker.start();var p=worker.probeProperties();assertFalse(p.containsKey("group.id"));assertEquals("false",p.getProperty("enable.auto.commit"));assertEquals("false",p.getProperty("allow.auto.create.topics"));verifyNoInteractions(store);worker.stop();
    }
}
