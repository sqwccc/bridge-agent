package com.bridgemind;

import com.bridgemind.monitoring.service.MonitoringService;
import com.bridgemind.report.service.ReportService;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 输入边界与附件代理边界；避免长区间扫描及任意地址代理。
 */
class BoundaryTest {
    @Test
    void missingAndNonNumericSamplesAreNotZero() {
        // 准备/执行/验证：合法零值与科学计数法保留；缺测和非有限数形成曲线断点。
        assertEquals(0.0, MonitoringService.numericValue("0"));
        assertEquals(-125.0, MonitoringService.numericValue(" -1.25e2 "));
        assertEquals(0.5, MonitoringService.numericValue(".5"));
        for (String raw : new String[]{null, "", "设备离线", "NaN", "Infinity", "1e999"})
            assertNull(MonitoringService.numericValue(raw));
    }

    @Test
    void queryWindowMustBeOrderedAndBounded() {
        // 准备：历史时间窗；执行/验证：接受边界，拒绝反向或超过31天的区间。
        var from = LocalDateTime.of(2026, 10, 1, 0, 0);
        assertDoesNotThrow(() -> MonitoringService.validateRange(from, from.plusDays(31)));
        assertThrows(IllegalArgumentException.class, () -> MonitoringService.validateRange(from, from.minusSeconds(1)));
        assertThrows(IllegalArgumentException.class, () -> MonitoringService.validateRange(from, from.plusDays(31).plusSeconds(1)));
    }

    @Test
    void reportUrlCannotEscapeConfiguredOriginOrPath() {
        // 准备：配置限定文件服务；执行/验证：绝对外域、协议相对及编码回退全部拒绝。
        String base = "https://reports.example.test/qiaoliang/";
        assertEquals("https://reports.example.test/qiaoliang/a.pdf", ReportService.resolveAllowed(base, "a.pdf").toString());
        for (String path : new String[]{"https://other.example/a.pdf", "//other.example/a.pdf", "../private", "%2e%2e/private", "/private/a.pdf", "file:///a.pdf", "a.pdf?url=other"})
            assertThrows(IllegalArgumentException.class, () -> ReportService.resolveAllowed(base, path), path);
    }
}
