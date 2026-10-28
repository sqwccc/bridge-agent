package com.bridgemind;

import com.bridgemind.bridge.mapper.BridgeMapper;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.service.BridgeService;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import static org.junit.jupiter.api.Assertions.*;

@EnabledIfSystemProperty(named = "bridgemind.sourceIntegration", matches = "true")
class BridgeDetailPerformanceSourceTest {
    @BeforeAll static void setup() throws Exception { SourceMapperIntegrationTest.setup(); }
    @Test void scopedArchiveCoversVisibleBridgesAndMatchesOriginalSamples() throws Exception {
        try (var connection = SourceMapperIntegrationTest.connection();
             var session = SourceMapperIntegrationTest.factory.openSession(connection)) {
            var mapper = session.getMapper(BridgeMapper.class);
            var service = new BridgeService(mapper);
            var scope = service.all(new BridgeFilter(null,null,null,null));
            // Every visible bridge has an archive; representative full results match the original query.
            for (var bridge : scope) assertNotNull(mapper.archiveForVisible(bridge.id()));
            for (var id : java.util.List.of("10905200071", "02000102281"))
                assertEquals(mapper.archive(id), service.detail(id).archive());
            assertThrows(org.springframework.web.server.ResponseStatusException.class, () -> service.detail("QXQR001A"));
            assertTrue(connection.isReadOnly());
        }
    }
}
