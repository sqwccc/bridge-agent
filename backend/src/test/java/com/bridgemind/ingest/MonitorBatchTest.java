package com.bridgemind.ingest;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.bridgemind.monitoring.mapper.MonitoringMapper;
import java.time.Duration;
import java.util.*;
import java.util.concurrent.atomic.AtomicLong;
import org.apache.kafka.clients.consumer.*;
import org.apache.kafka.common.TopicPartition;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
class MonitorBatchTest {
    @Test void ownerCacheExpiresAndDoesNotRetainFailuresOrAmbiguity() {
        var source=mock(MonitoringMapper.class);var ticks=new AtomicLong();
        var cache=new ChannelOwnershipCache(source,Caffeine.newBuilder().maximumSize(2).expireAfterWrite(Duration.ofSeconds(30)).ticker(ticks::get).build());
        var m=MonitorMessage.parse(MonitorIngestTest.JSON);
        when(source.resolveChannel("p","d","m")).thenReturn(List.of(Map.of("city","a","bridge","A")));
        cache.resolve(m);cache.resolve(m);verify(source,times(1)).resolveChannel("p","d","m");
        ticks.set(Duration.ofSeconds(31).toNanos());when(source.resolveChannel("p","d","m")).thenReturn(List.of());
        assertTrue(cache.resolve(m).isEmpty());cache.resolve(m);verify(source,times(3)).resolveChannel("p","d","m");
        when(source.resolveChannel("p","d","m")).thenThrow(new IllegalStateException("unavailable"));
        assertThrows(IllegalStateException.class,()->cache.resolve(m));
        doReturn(List.of(Map.of("city","b","bridge","B"))).when(source).resolveChannel("p","d","m");
        assertEquals("b",cache.resolve(m).getFirst().get("city"));cache.invalidate(m);cache.resolve(m);verify(source,times(6)).resolveChannel("p","d","m");
    }
    @Test void commitsOnlyAfterWholeBatchAndPropagatesCommitFailure() {
        var store=mock(MonitorStore.class);
        @SuppressWarnings("unchecked") Consumer<String,String> consumer=mock(Consumer.class);
        var worker=new MonitorConsumer(new MockEnvironment(),store,new SimpleMeterRegistry());
        var records=List.of(new ConsumerRecord<String,String>("t",0,10,null,"a"),new ConsumerRecord<String,String>("t",0,12,null,"b"),new ConsumerRecord<String,String>("t",1,4,null,"c"));
        when(store.acceptBatch(anyList())).thenReturn(new MonitorStore.BatchResult(3,1,1,0,1));
        worker.processBatch(consumer,records);var order=inOrder(store,consumer);order.verify(store).acceptBatch(anyList());
        order.verify(consumer).commitSync(Map.of(new TopicPartition("t",0),new OffsetAndMetadata(13),new TopicPartition("t",1),new OffsetAndMetadata(5)));
        reset(consumer);when(store.acceptBatch(anyList())).thenThrow(new IllegalStateException());assertThrows(IllegalStateException.class,()->worker.processBatch(consumer,records));verifyNoInteractions(consumer);
        doReturn(new MonitorStore.BatchResult(3,0,3,0,0)).when(store).acceptBatch(anyList());doThrow(new CommitFailedException()).when(consumer).commitSync(anyMap());
        assertThrows(CommitFailedException.class,()->worker.processBatch(consumer,records));
    }
    @Test void failureDiagnosticsDoNotExposeMessages() {
        String summary=MonitorConsumer.safeFailure(new RuntimeException("password-secret",new java.sql.SQLException("payload-secret","42601",7)));
        assertTrue(summary.contains("42601"));assertFalse(summary.contains("secret"));
        var registry=new SimpleMeterRegistry();new MonitorConsumer(new MockEnvironment(),mock(MonitorStore.class),registry).start();
        assertEquals(0,registry.get("bridge.monitor.failures").gauge().value());
    }
}
