package com.bridgemind;

import com.bridgemind.bridge.mapper.BridgeMapper;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.monitoring.mapper.MonitoringMapper;
import com.bridgemind.report.mapper.ReportMapper;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static com.bridgemind.SourceMapperIntegrationTest.*;

@EnabledIfSystemProperty(named = "bridgemind.sourceIntegration", matches = "true")
class PhaseTwoSourceIntegrationTest {
    @BeforeAll
    static void init() throws Exception {
        SourceMapperIntegrationTest.setup();
    }

    @Test
    void archiveScopeSpecialFiltersAndMappedThresholdsUseActualColumns() throws Exception {
        try (var c = connection(); var session = factory.openSession(c)) {
            var bridges = session.getMapper(BridgeMapper.class);
            assertNull(bridges.archive("QXQR001A"));
            assertEquals(12, bridges.archive("10905200071").spanCount());
            var scope = bridges.all(new BridgeFilter(null, null, null, null));
            for (String special : List.of("1", "2", "1,2", "1,2,3")) {
                var codes = Set.of(special.split(","));
                assertEquals(scope.stream().filter(b -> b.specialTypeCodes().stream().anyMatch(codes::contains)).count(), bridges.count(filter(special, null, null, null)));
            }
            assertEquals(scope.stream().filter(b -> b.normalUse()).count(), bridges.count(filter(null, "normalUse", null, null)));
            assertEquals(scope.stream().filter(b -> b.maintenanceCategory() == null).count(), bridges.count(filter(null, null, null, "missing")));
            var selected = filter("1,2", null, "1", null);
            assertEquals(bridges.count(selected), bridges.all(selected).size());
            var monitoring = session.getMapper(MonitoringMapper.class);
            var all = monitoring.thresholds("02000102281", null, null, null);
            assertEquals(366, all.size());
            assertEquals(366, all.stream().map(t -> t.id()).distinct().count());
            var t = all.getFirst();
            assertTrue(monitoring.thresholds("02000102281", t.pointId(), t.deviceId(), t.metric()).stream().allMatch(v -> v.pointId().equals(t.pointId()) && v.deviceId().equals(t.deviceId()) && Objects.equals(v.metric(), t.metric())));
            assertTrue(session.getMapper(ReportMapper.class).list("QXQR001A").isEmpty());
            var reports = session.getMapper(ReportMapper.class).list("10905200071");
            assertTrue(reports.stream().anyMatch(r -> r.source().equals("BASE_INSPECTION")));
            assertEquals(reports.size(), reports.stream().map(r -> r.id()).distinct().count());
        }
    }

    private BridgeFilter filter(String special, String population, String span, String maintenance) {
        return new BridgeFilter(null, null, null, null, null, null, null, null, null, null, span, maintenance, special, population);
    }

    @Test
    void thresholdAndReportVersionsDoNotResurrectOrCrossCityAndIntervalsStaySeparate() throws Exception {
        String fixtures = "WITH " + records("dwd_ql_js_ql_inc", """
                [{"qlid":"A","qlbh":"SAME","sscsdm":"320100","sczt":0},{"qlid":"B","qlbh":"SAME","sscsdm":"320200","sczt":0}]
                """) + "," + records("dwd_ql_jc_jcd_inc", """
                [{"bsm":"P","ssbm":"SAME","sscsdm":"320100","jclx":70}]
                """) + "," + records("dwd_ql_jc_jcsb_inc", """
                [{"bsm":"D","dwbsm":"P","sscsdm":"320100","jczb":"QL1301","sblx":"QL13"}]
                """) + "," + records("dwd_ql_jc_jcxyz_inc", """
                [{"bsm":"t1","sbbsm":"D","sscsdm":"320100","jczb":"QL1301","jcjb":2,"yzxx":-10,"yzsx":-5},
                 {"bsm":"t2","sbbsm":"D","sscsdm":"320100","jczb":"QL1301","jcjb":2,"yzxx":5,"yzsx":10},
                 {"bsm":"t3","sbbsm":"D","sscsdm":"320100","jczb":"QL1301","sjtbsj":"2025-01-01"},
                 {"bsm":"t3","sbbsm":"D","sscsdm":"320100","jczb":"QL1301","sjtbzt":"D","sjtbsj":"2026-01-01"},
                 {"bsm":"other-city","sbbsm":"D","sscsdm":"320200","jczb":"QL1301"},
                 {"bsm":"other-metric","sbbsm":"D","sscsdm":"320100","jczb":"QL1201"}]
                """) + "," + records("dwd_ql_jg_dqjc_all", """
                [{"bsm":"deleted","jcdx":"SAME","sscsdm":"320100","tbsj":"2025-01-01"},
                 {"bsm":"deleted","jcdx":"SAME","sscsdm":"320100","sjtbzt":"D","tbsj":"2026-01-01"},
                 {"bsm":"kept","jcdx":"SAME","sscsdm":"320100","jclx":2},
                 {"bsm":"foreign","jcdx":"SAME","sscsdm":"320200","jclx":1}]
                """) + "," + records("dwd_ql_jg_cgdj_inc", """
                [{"id":"R","qlid":"A","sscsdm":"320100","jcnd":2026,"rwid":"T"},
                 {"id":"R2","qlid":"B","sscsdm":"320200","jcnd":2026,"rwid":"T"}]
                """) + "," + records("dwd_ql_js_fjxxb_inc", """
                [{"id":"F","fid":"R","wjurldz":"a.pdf","sjtbsj":"2025-01-01"},
                 {"id":"F","fid":"OTHER","wjurldz":"private.pdf","sjtbsj":"2026-01-01"},
                 {"id":"FT","fid":"T","wjurldz":"shared.pdf","sjtbsj":"2026-01-01"}]
                """) + "," + records("ql_sys_file", "[]") + ",";
        var thresholds = select(fixtures, "com.bridgemind.monitoring.mapper.MonitoringMapper.thresholds", new HashMap<>(Map.of("id", "A")), "id");
        assertEquals(Set.of("t1", "t2"), new HashSet<>(thresholds));
        var reports = select(fixtures, "com.bridgemind.report.mapper.ReportMapper.list", Map.of("id", "A"), "id");
        assertTrue(reports.contains("inspection-kept"));
        assertFalse(reports.contains("inspection-deleted"));
        assertFalse(reports.contains("inspection-foreign"));
        assertFalse(reports.contains("attachment-F"));
        assertTrue(reports.contains("regular-320100-R"));
        assertTrue(reports.contains("task-attachment-FT"));
        var shared = select(fixtures, "com.bridgemind.report.mapper.ReportMapper.list", Map.of("id", "A"), "related_bridge_count");
        assertTrue(shared.contains("1"));
    }

    private List<String> select(String fixtures, String statementId, Map<String, ?> values, String column) throws Exception {
        var params = new HashMap<String, Object>(values);
        params.putIfAbsent("point", null);
        params.putIfAbsent("device", null);
        params.putIfAbsent("metric", null);
        var ms = factory.getConfiguration().getMappedStatement(statementId);
        var bound = ms.getBoundSql(params);
        try (var c = connection(); var ps = c.prepareStatement(fixtures + bound.getSql().stripLeading().substring(4))) {
            new org.apache.ibatis.scripting.defaults.DefaultParameterHandler(ms, params, bound).setParameters(ps);
            var rows = new ArrayList<String>();
            try (var rs = ps.executeQuery()) {
                while (rs.next()) rows.add(rs.getString(column));
            }
            return rows;
        }
    }
}
