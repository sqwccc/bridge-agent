package com.bridgemind;

import com.bridgemind.bridge.model.resp.BridgeResponse;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.report.model.entity.ReportRecord;
import com.bridgemind.report.service.ReportService;
import com.sun.net.httpserver.HttpServer;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 附件代理使用隔离的本机测试服务，不依赖或写入真实来源库。
 */
class ReportServiceTest {
    private final BridgeService bridges = new BridgeService(null) {
        @Override
        public BridgeResponse require(String id) {
            return null;
        }
    };

    @Test
    void pdfDownloadPreservesContentAndChecksHeader() throws Exception {
        // 准备：明确为测试的文件响应；验证成功路径和伪装 PDF 被拒绝。
        byte[] pdf = "%PDF-1.4\n% integration fixture\n%%EOF".getBytes(StandardCharsets.US_ASCII);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/files/good.pdf", exchange -> {
            exchange.sendResponseHeaders(200, pdf.length);
            exchange.getResponseBody().write(pdf);
            exchange.close();
        });
        server.createContext("/files/bad.pdf", exchange -> {
            byte[] html = "<html>login</html>".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, html.length);
            exchange.getResponseBody().write(html);
            exchange.close();
        });
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/files/";
            var good = service(base, "good.pdf", 1024).file("bridge", "report");
            assertArrayEquals(pdf, good.bytes());
            assertTrue(good.pdf());
            assertEquals(502, assertThrows(ResponseStatusException.class, () -> service(base, "bad.pdf", 1024).file("bridge", "report")).getStatusCode().value());
            assertEquals(413, assertThrows(ResponseStatusException.class, () -> service(base, "good.pdf", 5).file("bridge", "report")).getStatusCode().value());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void redirectsAndMissingReportsAreNotFollowed() throws Exception {
        // 准备：来源返回重定向；验证不会跳转其他地址，也不能按任意报告 ID 下载。
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/files/redirect.pdf", exchange -> {
            exchange.getResponseHeaders().add("Location", "http://127.0.0.1/private");
            exchange.sendResponseHeaders(302, -1);
            exchange.close();
        });
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/files/";
            var service = service(base, "redirect.pdf", 1024);
            assertEquals(502, assertThrows(ResponseStatusException.class, () -> service.file("bridge", "report")).getStatusCode().value());
            assertEquals(404, assertThrows(ResponseStatusException.class, () -> service.file("bridge", "unknown")).getStatusCode().value());
        } finally {
            server.stop(0);
        }
    }

    private ReportService service(String base, String file, int limit) {
        return new ReportService(id -> List.of(new ReportRecord("report", "测试报告", "定期检测报告", LocalDateTime.of(2026, 1, 1, 0, 0), file)), bridges, base, limit);
    }

    @Test
    void imagePreviewUsesVerifiedTypeAndRejectsHtmlDisguisedAsImage() throws Exception {
        byte[] png = java.util.Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1kAAAAASUVORK5CYII=");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/files/a.png", exchange -> {
            exchange.sendResponseHeaders(200, png.length);
            exchange.getResponseBody().write(png);
            exchange.close();
        });
        server.createContext("/files/b.png", exchange -> {
            byte[] html = "<html>login</html>".getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(200, html.length);
            exchange.getResponseBody().write(html);
            exchange.close();
        });
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/files/";
            assertEquals("image/png", service(base, "a.png", 1024).file("a", "report").mediaType());
            assertEquals(502, assertThrows(ResponseStatusException.class, () -> service(base, "b.png", 1024).file("a", "report")).getStatusCode().value());
        } finally {
            server.stop(0);
        }
    }
}
