package com.bridgemind;

import com.bridgemind.agent.*;
import com.bridgemind.monitoring.model.resp.*;
import com.bridgemind.monitoring.service.MonitoringService;
import org.junit.jupiter.api.Test;
import java.time.*;
import java.math.BigDecimal;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AgentEnhancementTest {
    private static final LocalDateTime START=LocalDateTime.of(2026,10,1,0,0);
    private SampleResponse sample(int minutes,Double value){return new SampleResponse(START.plusMinutes(minutes),Objects.toString(value,"bad"),value);}
    @Test void focusTopicsRetainDatesAndRejectRecordFilters() {
        var first=AgentRules.classify("2026-01-01至2026-10-31整体数据情况","network",null);
        assertEquals("data_overview",first.topic());
        var next=AgentRules.classify("养护方案","network",first);
        assertEquals("maintenance_plan",next.topic());assertEquals(first.workFilter().from(),next.workFilter().from());
        assertThrows(IllegalArgumentException.class,()->new AgentPlan("business_query","maintenance_plan",null,null,"record","",null));
        var evidence=new AgentEvidence.Evidence(Map.of("重点问答","maintenance_plan","养护编排",Map.of("分组统计",List.of(Map.of("code","verify_closure","count",4)))),List.of());
        var chart=AgentPresentation.chart(evidence,"养护方案",JsonMapper.builder().build());
        assertEquals("table",chart.type());assertEquals(1,chart.rows().size());assertEquals(4L,chart.rows().getFirst().get("count"));
        assertTrue(chart.rows().getFirst().get("action").toString().contains("不直接视为闭环"));
    }
    @Test void fitsRealTimeAndRetainsNegativePeakTimestamp(){
        var stats=MonitoringAnalysis.statistics(List.of(sample(0,-10.0),sample(60,-8.0),sample(180,-4.0),sample(200,null)));
        assertEquals(2.0,(Double)stats.get("slopePerHour"),1e-9);
        assertEquals(1.0,(Double)stats.get("rSquared"),1e-9);
        assertEquals(10.0,stats.get("peak"));assertEquals(START,stats.get("peakTime"));assertEquals(1,stats.get("invalidCount"));
    }
    @Test void missingAndSparseDataNeverProduceNormalStatusOrAnomalyCount(){
        var missing=MonitoringAnalysis.statistics(List.of(sample(0,null)));
        assertEquals("no_data",missing.get("status"));assertFalse(missing.containsKey("peak"));
        var sparse=MonitoringAnalysis.statistics(List.of(sample(0,1.0),sample(0,2.0)));
        assertTrue(sparse.containsKey("trendUnavailable"));assertFalse(sparse.containsKey("anomalyCount"));assertEquals(1L,sparse.get("duplicateTimes"));
        var flat=new ArrayList<SampleResponse>();for(int i=0;i<6;i++)flat.add(sample(i,1.0));
        assertTrue(MonitoringAnalysis.statistics(flat).containsKey("anomalyUnavailable"));
    }
    @Test void asymmetricIndependentIntervalsKeepBoundariesAndSources(){
        var threshold=new ThresholdResponse("t1","p","d","m",null,2,new BigDecimal("10"),new BigDecimal("-2"),null,null,null);
        var result=MonitoringAnalysis.compareThresholds(List.of(sample(0,-3.0),sample(1,-2.0),sample(2,11.0)),List.of(threshold));
        assertEquals(1L,result.getFirst().get("below"));assertEquals(1L,result.getFirst().get("above"));assertEquals(1L,result.getFirst().get("onBoundary"));
        assertEquals("reference_only",result.getFirst().get("status"));assertFalse(result.getFirst().containsKey("alarmCount"));
    }
    @Test void correlationRequiresSixBucketsAndVariation(){
        var a=new ArrayList<SampleResponse>();var b=new ArrayList<SampleResponse>();
        for(int i=0;i<5;i++){a.add(sample(i*30,(double)i));b.add(sample(i*30+1,2.0*i));}
        assertEquals("insufficient_pairs",MonitoringAnalysis.correlation(a,b).get("status"));
        a.add(sample(150,5.0));b.add(sample(151,10.0));
        assertEquals(1.0,(Double)MonitoringAnalysis.correlation(a,b).get("r"),1e-9);
        assertEquals("zero_variance",MonitoringAnalysis.correlation(a,a.stream().map(s->new SampleResponse(s.time(),"1",1.0)).toList()).get("status"));
    }
    @Test void resolutionNeverWidensUnknownTargetAndRejectsTruncation(){
        var service=mock(MonitoringService.class);var p=new MonitorPointResponse("p","测点","d","设备","m","mm");
        when(service.points("bridge")).thenReturn(List.of(p));
        var analysis=new MonitoringAnalysis(service);
        assertEquals("clarification_required",analysis.analyze("bridge",new MonitoringQuery("trend",List.of("其他设备"),"",null,null)).get("status"));
        verify(service,never()).samples(any(),any(),any(),any(),any(),any());
        when(service.thresholds(any(),any(),any(),any())).thenReturn(List.of());
        when(service.samples(any(),any(),any(),any(),any(),any())).thenReturn(Map.of("items",List.of(sample(0,1.0)),"truncated",true));
        var truncated=analysis.analyze("bridge",new MonitoringQuery("trend",List.of("d"),"",null,null));
        assertEquals("range_too_large",truncated.get("status"));assertFalse(truncated.toString().contains("statistics"));
        assertTrue(truncated.get("limitations").toString().contains("未验证其在历史时段是否生效"));
    }
    @Test void rulesFailClosedOnUnrecognizedConditionsAndRetainExplicitFollowup(){
        assertEquals("clarification_required",AgentRules.classify("南京严重病害", "network",null).route());
        assertEquals("defects",AgentRules.classify("病害主要集中在哪些部位", "network",null).topic());
        var p=AgentRules.classify("设备 d，趋势，2026-10-01T00:00至2026-10-02T00:00","bridge",null);
        assertEquals("trend",p.monitoring().analysis());
        var next=AgentRules.classify("那e呢","bridge",p);
        assertEquals(List.of("e"),next.monitoring().targets());assertEquals(p.monitoring().from(),next.monitoring().from());
        assertEquals(p,AgentRules.classify("为什么","bridge",p));
    }
    @Test void chartValuesComeFromAggregatesAndKeepCategorySeparation(){
        var evidence=new AgentEvidence.Evidence(Map.of("总体统计",Map.of("total",5,"cities",List.of(Map.of("label","南京","count",2),Map.of("label","扬州","count",3)))),List.of());
        var chart=AgentPresentation.chart(evidence,"各地市接入桥梁数量对比",JsonMapper.builder().build());
        assertNotNull(chart);assertEquals(5L,chart.rows().stream().mapToLong(r->((Number)r.get("value")).longValue()).sum());
    }
}
