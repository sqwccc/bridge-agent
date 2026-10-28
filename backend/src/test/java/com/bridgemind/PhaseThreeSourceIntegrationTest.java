package com.bridgemind;

import com.bridgemind.work.mapper.*;
import com.bridgemind.work.model.*;

import java.util.*;

import org.apache.ibatis.scripting.defaults.DefaultParameterHandler;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named = "bridgemind.sourceIntegration", matches = "true")
class PhaseThreeSourceIntegrationTest {
    @BeforeAll
    static void setup() throws Exception {
        SourceMapperIntegrationTest.setup();
    }

    @Test
    void actualRecordsAndRawQualityReconcile() throws Exception {
        try (var connection = SourceMapperIntegrationTest.connection(); var session = SourceMapperIntegrationTest.factory.openSession(connection)) {
            var records = session.getMapper(WorkMapper.class);
            var quality = session.getMapper(QualityMapper.class);
            var patrols = records.list("320591-03664", "patrols", WorkFilter.all(), 8, 0);
            assertEquals(1206, records.count("320591-03664", "patrols", WorkFilter.all()));
            assertEquals(8, patrols.size());
            assertTrue(patrols.stream().allMatch(r -> r.bridgeId().equals("320591-03664")));
            assertEquals(patrols.getFirst().id(), records.find("320591-03664", "patrols", patrols.getFirst().id()).id());
            assertEquals(1206, patrols.getFirst().matchingTotal());
            assertNull(records.find("QXQR001A", "patrols", patrols.getFirst().id()));
            assertTrue(patrols.getFirst().dataIssues().stream().anyMatch(s -> s.contains("检查结果")));
            for (String kind : List.of("defects", "maintenance")) {
                var rows = records.list("15032610123365813067", kind, WorkFilter.all(), 100, 0);
                assertFalse(rows.isEmpty(), kind);
                assertEquals(rows.size(), records.count("15032610123365813067", kind, WorkFilter.all()));
                assertEquals(rows.getFirst().id(), records.find("15032610123365813067", kind, rows.getFirst().id()).id());
            }
            var q = quality.profile("patrols", "");
            assertEquals(23345, q.rawRows());
            assertEquals(0, q.duplicateExcess());
            assertEquals(q.rawRows(), q.mappedRows() + q.unmatchedRows() + q.ambiguousRows());
            assertEquals(23345, q.mappedRows());
            assertEquals(0, q.unmatchedRows());
            assertEquals(q.rawRows(), q.missingDetails());
            var d = quality.profile("defects", "");
            assertEquals(722, d.rawRows());
            assertEquals(722, d.mappedRows());
            var m = quality.profile("maintenance", "");
            assertEquals(484, m.rawRows());
            assertEquals(484, m.mappedRows());
            assertTrue(quality.issues("defects", "", "UNMATCHED_BRIDGE", 8, 0).stream().allMatch(i -> i.bridgeId() == null));
            assertEquals(0, quality.issueCount("defects", "", "UNMATCHED_BRIDGE"));
            assertTrue(connection.isReadOnly());
        }
    }

    private static String fixtures() {
        return "WITH " + SourceMapperIntegrationTest.records("dwd_ql_js_ql_inc", """
                [{"qlid":"A","qlbh":"SAME","sscsdm":"320100","sczt":0},
                 {"qlid":"B","qlbh":"SAME","sscsdm":"320200","sczt":0},
                 {"qlid":"C","qlbh":"AMB","sscsdm":"320100","sczt":0},
                 {"qlid":"E","qlbh":"AMB","sscsdm":"320100","sczt":0}]
                """) + "," + SourceMapperIntegrationTest.records("dwd_ql_jc_jcd_inc", """
                [{"bsm":"PA","ssbm":"A","sscsdm":"320100","jclx":70},
                 {"bsm":"PB","ssbm":"B","sscsdm":"320200","jclx":70},
                 {"bsm":"PC","ssbm":"C","sscsdm":"320100","jclx":70}]
                """) + "," + SourceMapperIntegrationTest.records("dwd_ql_jc_jcsb_inc", """
                [{"bsm":"DA","dwbsm":"PA","sscsdm":"320100"},
                 {"bsm":"DB","dwbsm":"PB","sscsdm":"320200"},
                 {"bsm":"DC","dwbsm":"PC","sscsdm":"320100"}]
                """) + "," + SourceMapperIntegrationTest.records("dwd_ql_xjjl_inc", """
                [{"bsm":"P","xjdx":"SAME","sscsdm":"320100","jcrq":"2025-01-01","tbsj":"2025-01-02","jcjg":"正常"},
                 {"bsm":"P","xjdx":"SAME","sscsdm":"320200","jcrq":"2025-01-01","tbsj":"2025-01-02"},
                 {"bsm":"DEL","xjdx":"SAME","sscsdm":"320100","tbsj":"2025-01-01"},
                 {"bsm":"DEL","xjdx":"SAME","sscsdm":"320100","tbsj":"2026-01-01","sjtbzt":"D"},
                 {"bsm":"MOVED","xjdx":"SAME","sscsdm":"320100","tbsj":"2025-01-01"},
                 {"bsm":"MOVED","xjdx":"OTHER","sscsdm":"320100","tbsj":"2026-01-01"},
                 {"bsm":"AMB","xjdx":"AMB","sscsdm":"320100"}]
                """) + "," + SourceMapperIntegrationTest.records("dwd_ql_jg_jcbhxx_all", """
                [{"bsm":"D1","qlbh":"SAME","bhbh":"BH","sscsdm":"320100","sbrq":"2025-01-01","clzt":1,"shcd":5,"qlbw":1,"xjx":1,"shlx":18,"bhly":1,"bhms":"裂缝","tbsj":"2025-01-01"},
                 {"bsm":"D2","qlbh":"SAME","bhbh":"BH","sscsdm":"320100","sbrq":"2025-01-02","clzt":99},
                 {"bsm":"D3","qlbh":"SAME","bhbh":"BH","sscsdm":"320200"}]
                """) + "," + SourceMapperIntegrationTest.records("dwd_ql_jg_yhwxxx_all", """
                [{"bsm":"M1","qlbh":"SAME","bhbh":"BH","sscsdm":"320100","yhrq":"2025-02-01","wtzgrq":"2025-01-01","wtzgzt":4,"yhlx":1},
                 {"bsm":"M2","qlbh":"SAME","bhbh":"BH","sscsdm":"320200"}]
                """) + ",";
    }

    private static List<Map<String, Object>> run(String statement, Map<String, Object> params) throws Exception {
        var mapped = SourceMapperIntegrationTest.factory.getConfiguration().getMappedStatement(statement);
        var bound = mapped.getBoundSql(params);
        String sql = fixtures() + bound.getSql().stripLeading().substring(4);
        try (var c = SourceMapperIntegrationTest.connection(); var query = c.prepareStatement(sql)) {
            new DefaultParameterHandler(mapped, params, bound).setParameters(query);
            try (var result = query.executeQuery()) {
                var rows = new ArrayList<Map<String, Object>>();
                while (result.next()) {
                    var row = new HashMap<String, Object>();
                    for (int i = 1; i <= result.getMetaData().getColumnCount(); i++)
                        row.put(result.getMetaData().getColumnLabel(i), result.getObject(i));
                    rows.add(row);
                }
                return rows;
            }
        }
    }

    @Test
    void cityDeletesChangedParentAndQualityAreHandledBeforeBusinessFilters() throws Exception {
        var params = new HashMap<String, Object>(Map.of("bridgeId", "A", "kind", "patrols", "filter", WorkFilter.all(), "limit", 20, "offset", 0));
        String ns = "com.bridgemind.work.mapper.WorkMapper.";
        var patrols = run(ns + "list", params);
        assertEquals(1, patrols.size());
        assertEquals("P", patrols.getFirst().get("id"));
        assertEquals("320100", patrols.getFirst().get("city_code"));
        params.put("kind", "defects");
        assertEquals(2, run(ns + "list", params).size());
        params.put("filter", new WorkFilter(null, null, "1", null, null, "5", null, null, null, false));
        assertEquals("D1", run(ns + "list", params).getFirst().get("id"));
        params.put("filter", new WorkFilter(null, null, null, null, null, null, null, null, null, true));
        assertEquals("D2", run(ns + "list", params).getFirst().get("id"));
        params.put("kind", "maintenance");
        params.put("filter", WorkFilter.all().forDefect("BH"));
        assertEquals(1, run(ns + "list", params).size());
        var quality = run("com.bridgemind.work.mapper.QualityMapper.profile", Map.of("kind", "patrols", "city", "320100")).getFirst();
        assertEquals(5L, quality.get("raw_rows"));
        assertEquals(1L, quality.get("duplicate_excess"));
        assertEquals(1L, quality.get("deleted_rows"));
        assertEquals(1L, quality.get("ambiguous_rows"));
        assertEquals(0L, quality.get("unmatched_rows"));
    }
}
