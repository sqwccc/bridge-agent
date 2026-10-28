package com.bridgemind;

import com.bridgemind.agent.mapper.AgentMapper;
import com.bridgemind.bridge.mapper.BridgeMapper;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.work.mapper.WorkMapper;
import com.bridgemind.work.model.WorkFilter;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import java.time.LocalDate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named="bridgemind.sourceIntegration",matches="true")
class AgentSourceIntegrationTest {
    @BeforeAll static void setup() throws Exception {SourceMapperIntegrationTest.setup();}
    @Test void aggregatesRespectScopeAndMatchExistingSingleBridgeCounts() throws Exception {
        try(var connection=SourceMapperIntegrationTest.connection();var session=SourceMapperIntegrationTest.factory.openSession(connection)){
            var mapper=session.getMapper(AgentMapper.class);
            var bridges=session.getMapper(BridgeMapper.class);
            var existing=session.getMapper(WorkMapper.class);
            var ids=bridges.all(new BridgeFilter(null,null,null,null)).stream().map(b->b.id()).toList();
            for(String kind:List.of("patrols","defects","maintenance")){
                var summary=mapper.summary(ids,kind,WorkFilter.all());
                long total=total(summary);
                assertTrue(total>0);
                assertEquals(total,summary.stream().filter(r->r.get("dimension").equals("city")).mapToLong(r->((Number)r.get("count")).longValue()).sum());
                var examples=mapper.examples(ids,kind,WorkFilter.all());
                assertTrue(examples.size()<=10);
                assertTrue(examples.stream().allMatch(r->ids.contains(r.bridgeId())));
                String id=examples.getFirst().bridgeId();
                assertEquals(existing.count(id,kind,WorkFilter.all()),total(mapper.summary(List.of(id),kind,WorkFilter.all())));
                assertEquals(0,total(mapper.summary(List.of(),kind,WorkFilter.all())));
                assertEquals(0,total(mapper.summary(ids,kind,new WorkFilter(LocalDate.of(2099,1,1),LocalDate.of(2099,1,2),null,null,null,null,null,null,null,false))));
            }
            assertTrue(connection.isReadOnly());
        }
    }
    private long total(List<Map<String,Object>> rows){return ((Number)rows.stream().filter(r->r.get("dimension").equals("total")).findFirst().orElseThrow().get("count")).longValue();}
}
