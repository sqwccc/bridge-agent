package com.bridgemind;

import com.bridgemind.monitoring.mapper.MonitoringMapper;
import com.bridgemind.monitoring.model.resp.MonitorPointResponse;
import org.apache.ibatis.scripting.defaults.DefaultParameterHandler;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import java.time.LocalDateTime;
import java.util.*;
import static com.bridgemind.SourceMapperIntegrationTest.*;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named="bridgemind.sourceIntegration",matches="true")
class MonitoringPerformanceSourceTest {
    @BeforeAll static void init() throws Exception { SourceMapperIntegrationTest.setup(); }

    @Test void fastQueriesMatchOriginalWanfuSamplesAndThresholds() throws Exception {
        try(var c=connection(); var session=factory.openSession(c)) {
            var mapper=session.getMapper(MonitoringMapper.class);
            var points=mapper.points("10905200071");
            assertEquals(mapper.thresholds("10905200071",null,null,null),mapper.thresholdsForPoints("321000",points));
            var metrics=new HashSet<String>();
            var from=LocalDateTime.of(2026,10,21,0,0);
            for(var p:points) {
                if(!p.deviceId().startsWith("WFDQ-") || !metrics.add(p.metric())) continue;
                assertEquals(mapper.samples("10905200071",p.pointId(),p.deviceId(),p.metric(),from,from.plusDays(2)),
                        mapper.samplesForPoint("321000",p.pointId(),p.deviceId(),p.metric(),from,from.plusDays(2)));
            }
            assertEquals(10,metrics.size());
        }
    }

    @Test void fastSamplesKeepCityPointDeviceMetricTimeAndDeletionBoundaries() throws Exception {
        String fixtures="WITH "+records("dwd_ql_jc_jcz_inc","""
            [{"bsm":"ok","sscsdm":"321000","dwbsm":"P","sbbsm":"D","jczb":null,"jcz":"0","jccjsj":"2026-10-22T00:00:00"},
             {"bsm":"city","sscsdm":"320100","dwbsm":"P","sbbsm":"D","jczb":null,"jccjsj":"2026-10-22T00:00:00"},
             {"bsm":"point","sscsdm":"321000","dwbsm":"Q","sbbsm":"D","jczb":null,"jccjsj":"2026-10-22T00:00:00"},
             {"bsm":"device","sscsdm":"321000","dwbsm":"P","sbbsm":"E","jczb":null,"jccjsj":"2026-10-22T00:00:00"},
             {"bsm":"metric","sscsdm":"321000","dwbsm":"P","sbbsm":"D","jczb":"","jccjsj":"2026-10-22T00:00:00"},
             {"bsm":"deleted","sscsdm":"321000","dwbsm":"P","sbbsm":"D","sjtbzt":"D","jccjsj":"2026-10-22T00:00:00"},
             {"bsm":"late","sscsdm":"321000","dwbsm":"P","sbbsm":"D","jccjsj":"2026-10-24T00:00:00"}]
            """);
        var params=new HashMap<String,Object>(Map.of("city","321000","point","P","device","D",
                "from",LocalDateTime.of(2026,10,21,0,0),"to",LocalDateTime.of(2026,10,23,0,0)));
        params.put("metric",null);
        assertEquals(List.of("0"),select(fixtures,"samplesForPoint",params,"raw_value"));
    }

    @Test void thresholdsDeduplicateBeforeDeviceFilterAndPreserveNullMetricsAndIntervals() throws Exception {
        String fixtures="WITH "+records("dwd_ql_jc_jcxyz_inc","""
            [{"bsm":"a","sscsdm":"321000","sbbsm":"D","jczb":null,"jcjb":2,"yzxx":-10,"yzsx":-5},
             {"bsm":"b","sscsdm":"321000","sbbsm":"D","jczb":null,"jcjb":2,"yzxx":5,"yzsx":10},
             {"bsm":"gone","sscsdm":"321000","sbbsm":"D","sjtbsj":"2025-01-01"},
             {"bsm":"gone","sscsdm":"321000","sbbsm":"D","sjtbzt":"D","sjtbsj":"2026-01-01"},
             {"bsm":"moved","sscsdm":"321000","sbbsm":"D","sjtbsj":"2025-01-01"},
             {"bsm":"moved","sscsdm":"321000","sbbsm":"OTHER","sjtbsj":"2026-01-01"},
             {"bsm":"foreign","sscsdm":"320100","sbbsm":"D"},
             {"bsm":"wrong-metric","sscsdm":"321000","sbbsm":"D","jczb":""}]
            """);
        var p=new MonitorPointResponse("P","p","D","d",null,null);
        assertEquals(List.of("a","b"),select(fixtures,"thresholdsForPoints",Map.of("city","321000","points",List.of(p)),"id"));
    }

    List<String> select(String fixtures,String name,Map<String,?> params,String column) throws Exception {
        var ms=factory.getConfiguration().getMappedStatement("com.bridgemind.monitoring.mapper.MonitoringMapper."+name);
        var bound=ms.getBoundSql(params);
        var query=bound.getSql().stripLeading();
        query=query.startsWith("WITH") ? fixtures+","+query.substring(4) : fixtures+" "+query;
        try(var c=connection();var ps=c.prepareStatement(query)) {
            new DefaultParameterHandler(ms,params,bound).setParameters(ps);
            var result=new ArrayList<String>();
            try(var rs=ps.executeQuery()) {while(rs.next()) result.add(rs.getString(column));}
            return result;
        }
    }
}
