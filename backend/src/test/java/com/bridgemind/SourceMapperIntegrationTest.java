package com.bridgemind;

import com.bridgemind.bridge.mapper.BridgeMapper;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.service.BridgeDictionary;
import com.bridgemind.bridge.service.BridgeAssessment;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.dashboard.service.DashboardService;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.*;

import org.apache.ibatis.executor.parameter.ParameterHandler;
import org.apache.ibatis.scripting.defaults.DefaultParameterHandler;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 显式启用的 PostgreSQL 只读测试；边界夹具是单条 SELECT 的 CTE，不建表、不写来源。
 */
@EnabledIfSystemProperty(named = "bridgemind.sourceIntegration", matches = "true")
class SourceMapperIntegrationTest {
    static SqlSessionFactory factory;
    static Map<String, String> config = new HashMap<>();

    @BeforeAll
    static void setup() throws Exception {
        for (String line : Files.readAllLines(Path.of("../.env.local"))) {
            if (!line.isBlank() && !line.strip().startsWith("#") && line.contains("=")) {
                var pair = line.split("=", 2);
                config.put(pair[0].strip(), pair[1].strip().replaceAll("^[\"']|[\"']$", ""));
            }
        }
        var ds = new DriverManagerDataSource(config.get("SOURCE_DB_URL"), config.get("SOURCE_DB_USER"), config.get("SOURCE_DB_PASSWORD"));
        var bean = new SqlSessionFactoryBean();
        bean.setDataSource(ds);
        bean.setTransactionFactory(new org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory());
        bean.setMapperLocations(new PathMatchingResourcePatternResolver().getResources("classpath*:mapper/source/**/*.xml"));
        var c = new org.apache.ibatis.session.Configuration();
        c.setMapUnderscoreToCamelCase(true);
        c.setDefaultStatementTimeout(15);
        bean.setConfiguration(c);
        factory = bean.getObject();
    }

    static Connection connection() throws Exception {
        var c = DriverManager.getConnection(config.get("SOURCE_DB_URL"), config.get("SOURCE_DB_USER"), config.get("SOURCE_DB_PASSWORD"));
        c.setReadOnly(true);
        c.setTransactionIsolation(Connection.TRANSACTION_REPEATABLE_READ);
        c.setAutoCommit(false);
        c.setSchema(config.getOrDefault("SOURCE_DB_SCHEMA", "qiaoliang"));
        return c;
    }

    @Test
    void actualMappingsReturnIndependentGradesAndMatchingCounts() throws Exception {
        try (var c = connection(); var session = factory.openSession(c)) {
            var mapper = session.getMapper(BridgeMapper.class);
            var all = new BridgeFilter(null, null, null, null);
            var rows = mapper.all(all);
            assertEquals(mapper.count(all), rows.size());
            assertFalse(rows.isEmpty());
            assertTrue(rows.stream().allMatch(b -> b.hasMonitoringDevices()));
            assertEquals(rows.size(), mapper.cities().stream().mapToLong(g -> g.count()).sum());
            assertNull(mapper.find("QXQR001A"));
            assertFalse(mapper.exists("QXQR001A"));
            assertNull(mapper.archive("QXQR001A"));
            var summary = new DashboardService(new BridgeService(mapper)).summary(all);
            for (var group : summary.types()) {
                var filter = new BridgeFilter(null, null, Integer.valueOf(group.code()), null);
                assertEquals(group.count(), mapper.count(filter));
                assertTrue(mapper.all(filter).stream().allMatch(b -> Integer.toString(BridgeDictionary.typeGroup(b.type())).equals(group.code())));
            }
            for (var group : summary.monitoringTypes()) {
                var filter = new BridgeFilter(null, null, null, group.code());
                assertEquals(group.count(), mapper.count(filter));
                assertTrue(mapper.all(filter).stream().allMatch(b -> Integer.toString(BridgeDictionary.monitoringGroup(b.effectiveMonitoringType())).equals(group.code())));
            }
            assertTrue(rows.stream().anyMatch(b -> !Objects.equals(b.conditionGrade(), b.structureGrade())));
            assertTrue(rows.stream().anyMatch(b -> b.monitoringTypeBasis().equals("DEVICE_DEFAULT")));
            for (var filter : List.of(new BridgeFilter(null, null, null, "2"),
                    new BridgeFilter(null, null, null, "missing"), new BridgeFilter(null, null, null, "0"),
                    new BridgeFilter(null, null, null, null, "missing", null, null, null, null, null),
                    new BridgeFilter(null, null, null, null, null, "-9999", null, null, null, null),
                    new BridgeFilter(null, null, null, null, null, null, 0, 0, 0, 0))) {
                var filtered = mapper.all(filter);
                assertEquals(filtered.size(), mapper.count(filter));
                assertEquals(filtered.stream().limit(8).toList(), mapper.page(filter, 8, 0));
            }
            assertTrue(c.isReadOnly());
        }
    }

    static String records(String table, String json) {
        return table + " AS (SELECT * FROM jsonb_populate_recordset(NULL::" + config.getOrDefault("SOURCE_DB_SCHEMA", "qiaoliang") + "." + table + ",'" + json + "'::jsonb))";
    }

    @Test
    void assessmentCategoryAndStatusFiltersAgreeWithJavaClassification() throws Exception {
        Integer[] categories = {1, 1, 3, 5, 2, 1, null, 98, 0};
        String[] conditions = {"1", "3", "4", "1", "  ", "99", "3", null, "7"};
        String[] structures = {"3", "2", "1", "5", "98", null, "1", "99", " 4 "};
        var json = tools.jackson.databind.json.JsonMapper.builder().build();
        var bridges = new ArrayList<Map<String, Object>>();
        var points = new ArrayList<Map<String, Object>>();
        var devices = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < categories.length; i++) {
            var b = new HashMap<String, Object>();
            b.put("qlid", "G" + i); b.put("sscsdm", "320100"); b.put("sczt", 0);
            b.put("yhlb", categories[i]); b.put("qlwhzk", conditions[i]); b.put("qljgzk", structures[i]);
            bridges.add(b);
            points.add(Map.of("bsm", "P" + i, "ssbm", "G" + i, "sscsdm", "320100", "jclx", 70));
            devices.add(Map.of("bsm", "D" + i, "dwbsm", "P" + i, "sscsdm", "320100"));
        }
        String fixtures = "WITH " + records("dwd_ql_js_ql_inc", json.writeValueAsString(bridges)) + ","
                + records("dwd_ql_jc_jcd_inc", json.writeValueAsString(points)) + ","
                + records("dwd_ql_jc_jcsb_inc", json.writeValueAsString(devices)) + ",";
        var statement = factory.getConfiguration().getMappedStatement("com.bridgemind.bridge.mapper.BridgeMapper.all");
        try (var c = connection()) {
            for (String category : List.of("I", "II_V", "unknown")) {
                for (boolean condition : List.of(true, false)) {
                    for (String bucket : BridgeAssessment.buckets(category)) {
                        var expected = new HashSet<String>();
                        for (int i = 0; i < categories.length; i++) {
                            if (BridgeAssessment.category(categories[i]).equals(category)
                                    && BridgeAssessment.displayBucket(categories[i], condition ? conditions[i] : structures[i]).equals(bucket)) expected.add("G" + i);
                        }
                        var filter = new BridgeFilter(null, null, null, null, condition ? bucket : null, condition ? null : bucket,
                                null, null, null, null, null, null, null, null, category);
                        var params = Map.of("filter", filter);
                        var bound = statement.getBoundSql(params);
                        try (var ps = c.prepareStatement(fixtures + bound.getSql().stripLeading().substring(4))) {
                            new DefaultParameterHandler(statement, params, bound).setParameters(ps);
                            var actual = new HashSet<String>();
                            try (var rs = ps.executeQuery()) { while (rs.next()) actual.add(rs.getString("id")); }
                            assertEquals(expected, actual, category + "/" + (condition ? "BCI" : "BSI") + "/" + bucket);
                        }
                    }
                }
            }
        }
    }

    @Test
    void mergedOtherFiltersMatchNullUnknownAndInvalidCodesInPostgres() throws Exception {
        var bridges = new ArrayList<String>();
        var points = new ArrayList<String>();
        var devices = new ArrayList<String>();
        String[] types = {"null", "0", "98", "99", "777", "1", "6"};
        String[] monitoring = {"null", "0", "99", "1", "2", "1", "2"};
        for (int i = 0; i < types.length; i++) {
            bridges.add("{\"qlid\":\"M" + i + "\",\"sscsdm\":\"320100\",\"sczt\":0,\"jglx\":" + types[i] + ",\"jkjclx\":" + monitoring[i] + "}");
            points.add("{\"bsm\":\"P" + i + "\",\"ssbm\":\"M" + i + "\",\"sscsdm\":\"320100\",\"jclx\":70}");
            devices.add("{\"bsm\":\"D" + i + "\",\"dwbsm\":\"P" + i + "\",\"sscsdm\":\"320100\"}");
        }
        String fixtures = "WITH " + records("dwd_ql_js_ql_inc", "[" + String.join(",", bridges) + "]") + ","
                + records("dwd_ql_jc_jcd_inc", "[" + String.join(",", points) + "]") + ","
                + records("dwd_ql_jc_jcsb_inc", "[" + String.join(",", devices) + "]") + ",";
        for (var filter : List.of(new BridgeFilter(null, null, 99, null), new BridgeFilter(null, null, 98, null),
                new BridgeFilter(null, null, null, "0"), new BridgeFilter(null, null, null, "missing"))) {
            var params = Map.of("filter", filter);
            var ms = factory.getConfiguration().getMappedStatement("com.bridgemind.bridge.mapper.BridgeMapper.all");
            var bound = ms.getBoundSql(params);
            try (var c = connection(); var ps = c.prepareStatement(fixtures + bound.getSql().stripLeading().substring(4))) {
                new DefaultParameterHandler(ms, params, bound).setParameters(ps);
                var ids = new HashSet<String>();
                try (var rs = ps.executeQuery()) { while (rs.next()) ids.add(rs.getString("id")); }
                assertEquals(filter.type() != null ? Set.of("M0", "M1", "M2", "M3", "M4") : Set.of("M1", "M2"), ids);
            }
        }
    }

    @Test
    void latestDeletesCityScopeAndAmbiguityAreHandledInRealPostgres() throws Exception {
        String bridges = """
                [{"qlid":"A","qlbh":"SAME","sscsdm":"320100","sczt":0},
                 {"qlid":"B","qlbh":"SAME","sscsdm":"320200","sczt":0},
                 {"qlid":"C","qlbh":"AMB","sscsdm":"320100","sczt":0},
                 {"qlid":"D","qlbh":"AMB","sscsdm":"320100","sczt":0},
                 {"qlid":"E","qlbh":"E","sscsdm":"320100","sczt":0},
                 {"qlid":"F","qlbh":"F","sscsdm":"320100","sczt":0,"jkjclx":0},
                 {"qlid":"G","qlbh":"G","sscsdm":"320100","sczt":0},
                 {"qlid":"POINT_ONLY","qlbh":"POINT_ONLY","sscsdm":"320100","sczt":0,"jkjclx":1},
                 {"qlid":"REMOVED","qlbh":"R","sscsdm":"320100","sczt":0,"sjtbsj":"2025-01-01"},
                 {"qlid":"REMOVED","qlbh":"R","sscsdm":"320100","sczt":1,"sjtbsj":"2026-01-01"}]
                """;
        String points = """
                [{"bsm":"PA","ssbm":"SAME","sscsdm":"320100","jclx":70},
                 {"bsm":"PB","ssbm":"SAME","sscsdm":"320200","jclx":70},
                 {"bsm":"PC","ssbm":"AMB","sscsdm":"320100","jclx":70},
                 {"bsm":"PE","ssbm":"E","sscsdm":"320100","jclx":70,"sjtbsj":"2025-01-01"},
                 {"bsm":"PE","ssbm":"E","sscsdm":"320100","sjtbzt":"D","sjtbsj":"2026-01-01"},
                 {"bsm":"PF","ssbm":"F","sscsdm":"320100","jclx":70},
                 {"bsm":"PR","ssbm":"R","sscsdm":"320100","jclx":70},
                 {"bsm":"PP","ssbm":"POINT_ONLY","sscsdm":"320100","jclx":70},
                 {"bsm":"PG","ssbm":"G","sscsdm":"320100","jclx":70,"sjtbsj":"2025-01-01"},
                 {"bsm":"PG","ssbm":"G","sscsdm":"320100","jclx":71,"sjtbsj":"2026-01-01"}]
                """;
        String devices = """
                [{"bsm":"DA","dwbsm":"PA","sscsdm":"320100"},
                 {"bsm":"DA2","dwbsm":"PA","sscsdm":"320100"},
                 {"bsm":"DR","dwbsm":"PR","sscsdm":"320100"},
                 {"bsm":"DB","dwbsm":"PB","sscsdm":"320200","sjtbsj":"2025-01-01"},
                 {"bsm":"DB","dwbsm":"PB","sscsdm":"320200","sjtbzt":"D","sjtbsj":"2026-01-01"},
                 {"bsm":"DC","dwbsm":"PC","sscsdm":"320100"},
                 {"bsm":"DE","dwbsm":"PE","sscsdm":"320100"},
                 {"bsm":"DF","dwbsm":"PF","sscsdm":"320100"},
                 {"bsm":"DG","dwbsm":"PG","sscsdm":"320100"}]
                """;
        String fixtures = "WITH " + records("dwd_ql_js_ql_inc", bridges) + "," + records("dwd_ql_jc_jcd_inc", points) + "," + records("dwd_ql_jc_jcsb_inc", devices) + ",";
        var ms = factory.getConfiguration().getMappedStatement("com.bridgemind.bridge.mapper.BridgeMapper.all");
        var params = Map.of("filter", new BridgeFilter(null, null, null, null));
        var bound = ms.getBoundSql(params);
        String query = fixtures + bound.getSql().stripLeading().substring(4);
        try (var c = connection(); var statement = c.prepareStatement(query)) {
            ParameterHandler handler = new DefaultParameterHandler(ms, params, bound);
            handler.setParameters(statement);
            var effective = new HashMap<String, Integer>();
            var evidence = new HashMap<String, Boolean>();
            try (var rs = statement.executeQuery()) {
                while (rs.next()) {
                    effective.put(rs.getString("id"), rs.getObject("effective_monitoring_type", Integer.class));
                    evidence.put(rs.getString("id"), rs.getBoolean("has_monitoring_devices"));
                }
            }
            assertEquals(Set.of("A", "F"), effective.keySet());
            assertFalse(effective.containsKey("REMOVED"));
            assertEquals(2, effective.get("A"));
            assertTrue(evidence.get("A"));
            for (String id : List.of("B", "C", "D", "E", "G")) {
                assertFalse(effective.containsKey(id), id);
            }
            assertEquals(0, effective.get("F"));
            assertTrue(evidence.get("F"));
        }
    }
}
