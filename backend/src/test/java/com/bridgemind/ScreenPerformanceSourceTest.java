package com.bridgemind;

import com.bridgemind.alarm.mapper.AlarmMapper;
import com.bridgemind.alarm.service.AlarmService;
import com.bridgemind.bridge.mapper.BridgeMapper;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.service.BridgeService;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named = "bridgemind.sourceIntegration", matches = "true")
class ScreenPerformanceSourceTest {
    @BeforeAll
    static void setup() throws Exception { SourceMapperIntegrationTest.setup(); }

    @Test
    void snapshotPagesAndAlarmWindowCountsMatchSourceQueries() throws Exception {
        try (var connection = SourceMapperIntegrationTest.connection();
             var session = SourceMapperIntegrationTest.factory.openSession(connection)) {
            var bridgeMapper = session.getMapper(BridgeMapper.class);
            var bridges = new BridgeService(bridgeMapper);
            var alarms = session.getMapper(AlarmMapper.class);
            for (var filter : java.util.List.of(new BridgeFilter(null, null, null, null),
                    new BridgeFilter("万福", null, null, null),
                    new BridgeFilter("不存在xyz987", null, null, null))) {
                var page = bridges.page(filter, 1, 8);
                assertEquals(bridgeMapper.page(filter, 8, 0), page.items());
                assertEquals(bridgeMapper.count(filter), page.total());
                var alarmService = new AlarmService(alarms, bridges);
                var alarmPage = alarmService.list(filter, null, null, null, null, 1, 50);
                assertEquals(alarms.count(filter, null, null, null, null), alarmPage.total());
                assertEquals(alarmPage.total(), alarmService.list(filter, null, null, null, null, 100, 50).total());
            }
            assertEquals(bridgeMapper.cities(), bridges.cities());
            assertTrue(connection.isReadOnly());
        }
    }
}
