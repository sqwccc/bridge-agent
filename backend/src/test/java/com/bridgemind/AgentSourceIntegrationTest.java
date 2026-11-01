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
    @Test void focusGroupsAndCoverageRespectScopeAndDates() throws Exception {
        try(var connection=SourceMapperIntegrationTest.connection();var session=SourceMapperIntegrationTest.factory.openSession(connection)){
            var mapper=session.getMapper(AgentMapper.class);
            var ids=session.getMapper(BridgeMapper.class).all(new BridgeFilter(null,null,null,null)).stream().map(b->b.id()).toList();
            var groups=mapper.maintenancePriorities(ids,"defects",WorkFilter.all());
            var combined=com.bridgemind.agent.AgentFocusQueries.decode(mapper.focusSnapshot(ids,"defects",WorkFilter.all(),Set.of("total","maintenancePriority")));
            assertEquals(normalize(groups),normalize(combined.groups()));
            assertEquals(mapper.maintenanceCandidates(ids,"defects",WorkFilter.all()),combined.candidates());
            assertEquals(total(mapper.summary(ids,"defects",WorkFilter.all())),groups.stream().mapToLong(g->((Number)g.get("count")).longValue()).sum());
            var candidates=mapper.maintenanceCandidates(ids,"defects",WorkFilter.all());
            assertTrue(candidates.size()<=5);assertTrue(candidates.stream().allMatch(r->ids.contains(r.bridgeId())));
            var coverage=mapper.monitoringCoverage(ids,WorkFilter.all());
            assertTrue(((Number)coverage.get("reading_count")).longValue()>0);
            assertEquals(0L,((Number)mapper.monitoringCoverage(List.of(),WorkFilter.all()).get("reading_count")).longValue());
            var future=new WorkFilter(LocalDate.of(2099,1,1),LocalDate.of(2099,1,2),null,null,null,null,null,null,null,false);
            var empty=mapper.monitoringCoverage(ids,future);
            var emptyCombined=com.bridgemind.agent.AgentFocusQueries.decode(mapper.focusSnapshot(ids,"defects",future,Set.of("total","maintenancePriority")));
            assertEquals(0,total(emptyCombined.summary()));
            assertTrue(emptyCombined.groups().isEmpty());assertTrue(emptyCombined.examples().isEmpty());assertTrue(emptyCombined.candidates().isEmpty());
            assertEquals(0L,((Number)empty.get("reading_count")).longValue());assertEquals(coverage.get("channel_count"),empty.get("channel_count"));
            assertTrue(mapper.maintenancePriorities(ids,"defects",future).isEmpty());assertTrue(connection.isReadOnly());
        }
    }
    private Object normalize(Object value) {
        var json=tools.jackson.databind.json.JsonMapper.builder().build();
        return json.readValue(json.writeValueAsString(value),Object.class);
    }
    private long total(List<Map<String,Object>> rows){return ((Number)rows.stream().filter(r->r.get("dimension").equals("total")).findFirst().orElseThrow().get("count")).longValue();}
    @Test void selectiveQueriesMatchOriginalRowsAndOrdering() throws Exception {
        try(var connection=SourceMapperIntegrationTest.connection();var session=SourceMapperIntegrationTest.factory.openSession(connection)) {
            var mapper=session.getMapper(AgentMapper.class);
            var all=session.getMapper(BridgeMapper.class).all(new BridgeFilter(null,null,null,null)).stream().map(b->b.id()).toList();
            var future=new WorkFilter(LocalDate.of(2099,1,1),LocalDate.of(2099,1,2),null,null,null,null,null,null,null,false);
            for(var ids:List.of(all,List.of("10905200071"),List.<String>of()))for(var kind:List.of("patrols","defects","maintenance")) {
                var dimensions=switch(kind) {
                    case "defects" -> Set.of("total","zone","status","severity","damageType");
                    case "maintenance" -> Set.of("total","status","maintenanceType");
                    default -> Set.of("total","resultProvided");
                };
                var filter=ids.isEmpty()?future:WorkFilter.all();
                var expected=mapper.summary(ids,kind,filter).stream().filter(r->dimensions.contains(r.get("dimension"))).toList();
                var combined=com.bridgemind.agent.AgentFocusQueries.decode(mapper.focusSnapshot(ids,kind,filter,dimensions));
                for(var row:expected)for(var field:List.of("first_date","last_date","latest_sync"))row.putIfAbsent(field,null);
                assertEquals(normalize(expected),normalize(combined.summary()));
                assertEquals(mapper.examples(ids,kind,filter).stream().limit(3).toList(),combined.examples());
                assertTrue(combined.candidates().isEmpty());
            }
            assertTrue(connection.isReadOnly());
        }
    }
}
