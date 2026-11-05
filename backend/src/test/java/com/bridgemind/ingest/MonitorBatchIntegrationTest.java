package com.bridgemind.ingest;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.core.io.FileSystemResource;
import com.bridgemind.monitoring.mapper.MonitoringMapper;
import org.springframework.mock.env.MockEnvironment;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

/** Dedicated loopback-only disposable database; never reads application .env or production data. */
@EnabledIfSystemProperty(named="bridgemind.batchIntegration",matches="true")
class MonitorBatchIntegrationTest {
    final DriverManagerDataSource ds=new DriverManagerDataSource("jdbc:postgresql://127.0.0.1:55439/bridge_batch_test","batch_test","");
    JdbcTemplate db;MonitoringMapper source;MonitorStore store;
    @BeforeEach void setup() throws Exception {
        db=new JdbcTemplate(ds);assertEquals("bridge_batch_test",db.queryForObject("select current_database()",String.class));
        try(var c=ds.getConnection()){ScriptUtils.executeSqlScript(c,new FileSystemResource("../deploy/cce/sql/003-monitor-kafka.sql"));}
        db.execute("TRUNCATE bridge_agent.bm_monitor_quarantine,bridge_agent.bm_monitor_sample,bridge_agent.bm_monitor_inbox");
        source=mock(MonitoringMapper.class);when(source.resolveChannel(any(),any(),any())).thenReturn(List.of(Map.of("city","321000","bridge","bridge")));
        store=new MonitorStore(ds,new ChannelOwnershipCache(source,new MockEnvironment()));
    }
    MonitorStore.Input input(long offset,String json){return new MonitorStore.Input("t",0,offset,null,json);}
    long count(String table){return db.queryForObject("SELECT count(*) FROM bridge_agent."+table,Long.class);}
    @Test void batchReplayVersionsConflictsAndBadMessages() {
        String base=MonitorIngestTest.JSON;
        String newer=base.replace("12:00:02","12:00:03").replace("\"I\"","\"D\"");
        var result=store.acceptBatch(List.of(input(1,base),input(2,newer),input(3,base),input(4,newer.replace("1.123456","2.123456")),input(5,"bad")));
        assertEquals(new MonitorStore.BatchResult(5,2,0,1,2),result);assertEquals(5,count("bm_monitor_inbox"));assertEquals(1,count("bm_monitor_sample"));assertEquals(2,count("bm_monitor_quarantine"));
        assertEquals("D",db.queryForObject("select sjtbzt from bridge_agent.bm_monitor_sample",String.class));
        assertEquals(5,store.acceptBatch(List.of(input(1,base),input(2,newer),input(3,base),input(4,base),input(5,"bad"))).duplicate());
        verify(source,times(1)).resolveChannel(any(),any(),any());
    }
    @Test void databaseWriteFailureRollsBackWholeBatch() {
        db.execute("ALTER TABLE bridge_agent.bm_monitor_sample ADD CONSTRAINT reject_test CHECK(jcz IS NULL OR jcz < 2)");
        try {assertThrows(RuntimeException.class,()->store.acceptBatch(List.of(input(1,MonitorIngestTest.JSON),input(2,MonitorIngestTest.JSON.replace("\"b\"","\"other\"").replace("1.123456","9.123456")))));
            assertEquals(0,count("bm_monitor_inbox"));assertEquals(0,count("bm_monitor_sample"));assertEquals(0,count("bm_monitor_quarantine"));
        }finally{db.execute("ALTER TABLE bridge_agent.bm_monitor_sample DROP CONSTRAINT reject_test");}
    }
    @Test void thousandSamplesUseOneOwnerLookupAndKeepEverySample() {
        var batch=new ArrayList<MonitorStore.Input>();for(int i=0;i<1000;i++)batch.add(input(i,MonitorIngestTest.JSON.replace("\"b\"","\"b"+i+"\"")));
        long start=System.nanoTime();assertEquals(1000,store.acceptBatch(batch).applied());
        System.out.println("isolated PostgreSQL batch1000 elapsedMs="+(System.nanoTime()-start)/1000000);
        assertEquals(1000,count("bm_monitor_sample"));assertEquals(1000,store.acceptBatch(batch).duplicate());verify(source,times(1)).resolveChannel(any(),any(),any());
    }
    @Test void concurrentBatchesSerializeVersions() throws Exception {
        var other=new MonitorStore(ds,new ChannelOwnershipCache(source,new MockEnvironment()));
        String old=MonitorIngestTest.JSON,newer=old.replace("12:00:02","12:00:03").replace("\"I\"","\"D\"");
        try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)) {
            var first=executor.submit(()->store.acceptBatch(List.of(input(1,old),input(2,old.replace("\"b\"","\"c\"")))));
            var second=executor.submit(()->other.acceptBatch(List.of(input(3,newer.replace("\"b\"","\"c\"")),input(4,newer))));
            first.get(20,java.util.concurrent.TimeUnit.SECONDS);second.get(20,java.util.concurrent.TimeUnit.SECONDS);
        }
        assertEquals(2,db.queryForObject("select count(*) from bridge_agent.bm_monitor_sample where sjtbzt='D'",Integer.class));assertEquals(4,count("bm_monitor_inbox"));
    }
    @Test void sourceFailureRollsBackInbox() {
        when(source.resolveChannel(any(),any(),any())).thenThrow(new IllegalStateException());
        assertThrows(IllegalStateException.class,()->store.acceptBatch(List.of(input(1,MonitorIngestTest.JSON))));assertEquals(0,count("bm_monitor_inbox"));
    }
}
