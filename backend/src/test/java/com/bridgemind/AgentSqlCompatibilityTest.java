package com.bridgemind;

import com.bridgemind.work.model.WorkFilter;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.io.StringReader;
import java.sql.DriverManager;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/** Local SQL regression only; PostgreSQL execution is not Vastbase certification. */
class AgentSqlCompatibilityTest {
    private Configuration configuration() throws Exception {
        var config = new Configuration();
        for (var resource : new PathMatchingResourcePatternResolver().getResources("classpath*:mapper/source/**/*.xml")) {
            try (var input = resource.getInputStream()) {
                new XMLMapperBuilder(input, config, resource.toString(), config.getSqlFragments()).parse();
            }
        }
        return config;
    }

    @Test void rendersAllQuestionQueriesIncludingEmptyScopeAndTotalOnly() throws Exception {
        var config = configuration();
        for (var kind : List.of("defects", "maintenance", "patrols")) {
            for (var ids : List.of(List.<String>of(), List.of("bridge-a", "bridge-b"))) {
                for (var dimensions : List.of(Set.<String>of(), Set.of("total"),
                        Set.of("total", "maintenancePriority", "city", "zone", "status", "severity",
                                "damageType", "maintenanceType", "month", "resultProvided"))) {
                    var params = new HashMap<String, Object>();
                    params.put("kind", kind); params.put("bridgeIds", ids);
                    params.put("filter", WorkFilter.all()); params.put("dimensions", dimensions);
                    for (var query : List.of("focusSnapshot", "summary", "examples", "monitoringCoverage",
                            "maintenancePriorities", "maintenanceCandidates")) {
                        var sql = config.getMappedStatement("com.bridgemind.agent.mapper.AgentMapper." + query)
                                .getBoundSql(params).getSql().toUpperCase(Locale.ROOT);
                        assertFalse(sql.contains("LATERAL"), query);
                        assertFalse(sql.contains("MATERIALIZED"), query);
                        assertFalse(sql.contains("COUNT(DISTINCT ("), query);
                        if (ids.isEmpty()) assertFalse(sql.contains(" IN ()"), query);
                    }
                }
            }
        }
    }

    @Test
    @EnabledIfSystemProperty(named = "agent.sqlFixtureUrl", matches = ".+")
    void groupedBranchesPreserveNullsTotalsPriorityAndDimensionSelection() throws Exception {
        var config = configuration();
        // No source tables or production credentials: synthetic CTE rows only.
        var xml = """
                <!DOCTYPE mapper PUBLIC "-//mybatis.org//DTD Mapper 3.0//EN" "https://mybatis.org/dtd/mybatis-3-mapper.dtd">
                <mapper namespace="fixture">
                  <sql id="maintenancePriority"><include refid="com.bridgemind.agent.mapper.AgentMapper.maintenancePriority"/></sql>
                  <select id="summary" resultType="map">
                    WITH matched AS (
                      SELECT * FROM (VALUES
                        ('3201'::text,1,1,5,2,3,'  '::text,'2026-01-02'::timestamp,'2026-01-03'::timestamp),
                        ('3202'::text,NULL,NULL,NULL,NULL,NULL,NULL::text,NULL::timestamp,NULL::timestamp),
                        ('3201'::text,1,4,4,2,3,'done'::text,'2026-02-02'::timestamp,'2026-02-03'::timestamp)
                      ) v(city_code,zone,status,severity,damage_type,maintenance_type,result,occurred_at,source_updated_at)
                      WHERE <choose><when test="empty">FALSE</when><otherwise>TRUE</otherwise></choose>
                    )
                    <include refid="com.bridgemind.agent.mapper.AgentMapper.summaryRows"/>
                  </select>
                </mapper>
                """;
        new XMLMapperBuilder(new StringReader(xml), config, "fixture", config.getSqlFragments()).parse();
        try (var connection = DriverManager.getConnection(System.getProperty("agent.sqlFixtureUrl"), "postgres", "fixture")) {
            for (boolean empty : List.of(false, true)) {
                for (var dimensions : List.of(Set.<String>of(), Set.of("total"),
                        Set.of("total", "maintenancePriority", "city", "zone", "status", "severity",
                                "damageType", "maintenanceType", "month", "resultProvided"))) {
                    var params = new HashMap<String, Object>();
                    params.put("empty", empty); params.put("dimensions", dimensions);
                    var rows = execute(config, connection, params);
                    assertEquals(empty ? 0L : 3L, rows.get("total/all"));
                    if (empty || dimensions.size() <= 1) assertEquals(1, rows.size());
                    else {
                        assertEquals(2L, rows.get("city/3201"));
                        assertEquals(1L, rows.get("city/3202"));
                        assertEquals(1L, rows.get("zone/missing"));
                        assertEquals(1L, rows.get("month/missing"));
                        assertEquals(2L, rows.get("resultProvided/no"));
                        assertEquals(1L, rows.get("resultProvided/yes"));
                        assertEquals(1L, rows.get("maintenancePriority/verify_severe"));
                        assertEquals(1L, rows.get("maintenancePriority/verify_closure"));
                        assertEquals(1L, rows.get("maintenancePriority/complete_status"));
                        for (var dimension : dimensions) {
                            assertEquals(3L, rows.entrySet().stream()
                                    .filter(e -> e.getKey().startsWith(dimension + "/"))
                                    .mapToLong(Map.Entry::getValue).sum(), dimension);
                        }
                    }
                }
            }
            // Legacy summary callers omit dimensions and receive all eight ordinary groups.
            var rows = execute(config, connection, Map.of("empty", false));
            assertEquals(9L, rows.keySet().stream().map(k -> k.split("/")[0]).distinct().count());
            assertFalse(rows.keySet().stream().anyMatch(k -> k.startsWith("maintenancePriority/")));
        }
    }

    private Map<String, Long> execute(Configuration config, java.sql.Connection connection, Map<String, ?> params) throws Exception {
        var sql = config.getMappedStatement("fixture.summary").getBoundSql(params).getSql();
        var rows = new HashMap<String, Long>();
        try (var statement = connection.createStatement(); var result = statement.executeQuery(sql)) {
            while (result.next()) rows.put(result.getString("dimension") + "/" + result.getString("code"), result.getLong("count"));
        }
        return rows;
    }
}
