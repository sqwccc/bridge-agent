package com.bridgemind.ingest;

import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import com.bridgemind.monitoring.mapper.MonitoringMapper;
import org.springframework.mock.env.MockEnvironment;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class MonitorIngestTest {
    static final String JSON="""
        {"BSM":"b","DWBSM":"p","SBBSM":"d","JCZB":"m","JCZ":1.123456,
        "JCCJSJ":"2026-11-04 12:00:00","JCSBSJ":"2026-11-04T12:00:01","SBZT":2,
        "YSKZJBZ":"b","SJTBZT":"I","TBSJ":"2026-11-04 12:00:02"}
        """;
    @Test void parsingPreservesPrecisionAndRejectsAmbiguity() {
        assertEquals("1.123456",MonitorMessage.parse(JSON).jcz().toPlainString());
        assertEquals(MonitorMessage.parse(JSON),MonitorMessage.parse(JSON.toLowerCase().replace("\"i\"","\"I\"")));
        for(String bad:List.of("null","{}",JSON.replace("1.123456","1.1234567"),JSON.replace("1.123456","1000000000000"),JSON.replace("\"BSM\":","\"bsm\":\"other\",\"BSM\":")))
            assertEquals("INVALID_MESSAGE",assertThrows(IllegalArgumentException.class,()->MonitorMessage.parse(bad)).getMessage());
    }
    final JdbcTemplate db=mock(JdbcTemplate.class);
    final MonitoringMapper source=mock(MonitoringMapper.class);
    final PlatformTransactionManager manager=mock(PlatformTransactionManager.class);
    final TransactionStatus status=mock(TransactionStatus.class);
    MonitorStore store() {when(manager.getTransaction(any())).thenReturn(status);return new MonitorStore(db,new TransactionTemplate(manager),source);}
    void insert() {when(db.update(startsWith("INSERT INTO bridge_agent.bm_monitor_inbox"),any(Object[].class))).thenReturn(1);}
    @Test void redeliveryDoesNotTouchBusinessAndCommits() {
        assertEquals("DUPLICATE",store().accept("t",0,1,null,JSON));verifyNoInteractions(source);verify(manager).commit(status);
    }
    @Test void badMessageIsDurablyIsolated() {
        insert();assertEquals("QUARANTINED",store().accept("t",0,1,null,"bad"));verifyNoInteractions(source);verify(manager).commit(status);
        verify(db).update(startsWith("INSERT INTO bridge_agent.bm_monitor_quarantine"),eq("t"),eq(0),eq(1L),eq("INVALID_MESSAGE"));
    }
    @Test void sourceOutageRollsBackInsteadOfQuarantine() {
        insert();when(source.resolveChannel(any(),any(),any())).thenThrow(new IllegalStateException("outage"));
        assertThrows(IllegalStateException.class,()->store().accept("t",0,1,null,JSON));verify(manager).rollback(status);
    }
    @Test void ambiguousOwnerCannotWriteSamples() {
        insert();when(source.resolveChannel(any(),any(),any())).thenReturn(List.of(Map.of("city","a","bridge","a"),Map.of("city","b","bridge","b")));
        assertEquals("QUARANTINED",store().accept("t",0,1,null,JSON));verify(db,never()).queryForMap(anyString(),any(Object[].class));
    }
    @Test void olderVersionDoesNotResurrectDeletion() {
        insert();when(source.resolveChannel(any(),any(),any())).thenReturn(List.of(Map.of("city","a","bridge","a")));
        when(db.queryForMap(anyString(),any(Object[].class))).thenReturn(Map.of("tbsj",java.sql.Timestamp.valueOf("2026-11-05 00:00:00"),"content","deleted"));
        assertEquals("STALE",store().accept("t",0,1,null,JSON));verify(db,never()).update(startsWith("UPDATE bridge_agent.bm_monitor_sample"),any(Object[].class));
    }
    @Test void offsetsFollowDatabaseSuccessAndFailuresRemainUncommitted() {
        var store=mock(MonitorStore.class);
        @SuppressWarnings("unchecked") var kafka=(org.apache.kafka.clients.consumer.Consumer<String,String>)mock(org.apache.kafka.clients.consumer.Consumer.class);
        var worker=new MonitorConsumer(new MockEnvironment(),store,new SimpleMeterRegistry());
        var record=new org.apache.kafka.clients.consumer.ConsumerRecord<String,String>("t",0,10,"k",JSON);
        when(store.accept("t",0,10,"k",JSON)).thenReturn("APPLIED");worker.process(kafka,record);
        var order=inOrder(store,kafka);order.verify(store).accept("t",0,10,"k",JSON);order.verify(kafka).commitSync(Map.of(new org.apache.kafka.common.TopicPartition("t",0),new org.apache.kafka.clients.consumer.OffsetAndMetadata(11)));
        reset(kafka);when(store.accept("t",0,10,"k",JSON)).thenThrow(new IllegalStateException());
        assertThrows(IllegalStateException.class,()->worker.process(kafka,record));verifyNoInteractions(kafka);
    }
    @Test void initialLatestBoundaryIsCommittedBeforeAnyMessage() {
        @SuppressWarnings("unchecked") var kafka=(org.apache.kafka.clients.consumer.Consumer<String,String>)mock(org.apache.kafka.clients.consumer.Consumer.class);
        var tp=new org.apache.kafka.common.TopicPartition("t",0);
        when(kafka.committed(Set.of(tp))).thenReturn(new HashMap<>());when(kafka.position(tp)).thenReturn(40L);
        MonitorConsumer.initializeOffsets(kafka,List.of(tp));verify(kafka).commitSync(Map.of(tp,new org.apache.kafka.clients.consumer.OffsetAndMetadata(40)));
    }
    @Test void kafkaDefaultsAndGate() {
        var registry=new SimpleMeterRegistry();var env=new MockEnvironment().withProperty("bridgemind.kafka.enabled","true");
        var consumer=new MonitorConsumer(env,mock(MonitorStore.class),registry);consumer.start();
        assertEquals(1,registry.get("bridge.monitor.failures").gauge().value());
        assertEquals("false",consumer.properties().getProperty("enable.auto.commit"));
        assertEquals("latest",consumer.properties().getProperty("auto.offset.reset"));consumer.stop();
    }
}
