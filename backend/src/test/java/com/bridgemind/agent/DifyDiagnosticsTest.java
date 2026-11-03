package com.bridgemind.agent;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import tools.jackson.databind.json.JsonMapper;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;

class DifyDiagnosticsTest {
    @Test void logsStatusProtocolFailuresAndInvalidPlanWithoutSecrets() throws Exception {
        var logs = new ListAppender<ILoggingEvent>();
        logs.start();
        var clientLogger = (Logger) LoggerFactory.getLogger(DifyClient.class);
        var classifierLogger = (Logger) LoggerFactory.getLogger(AgentClassifier.class);
        clientLogger.addAppender(logs);
        classifierLogger.addAppender(logs);
        var status = new AtomicInteger(401);
        var body = new AtomicReference<>("SECRET-RESPONSE");
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat-messages", exchange -> {
            exchange.getRequestBody().readAllBytes();
            byte[] bytes = body.get().getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status.get(), bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.close();
        });
        server.start();
        try {
            var url = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
            var mapper = JsonMapper.builder().build();
            var client = new DifyClient(url, "SECRET-KEY", mapper);
            assertThrows(Exception.class, () -> client.ask("SECRET-QUESTION", "SECRET-CONTEXT", "diagnostic-id"));
            status.set(200);
            body.set("{\"answer\":\"\"}");
            assertThrows(Exception.class, () -> client.ask("SECRET-QUESTION", "SECRET-CONTEXT", "diagnostic-id"));
            for (String payload : List.of(
                    "data: {\"event\":\"error\",\"message\":\"SECRET-RESPONSE\"}\n\n",
                    "data: {\"event\":\"message\",\"answer\":\"SECRET-ANSWER\"}\n\n")) {
                body.set(payload);
                assertThrows(Exception.class, () -> client.stream("SECRET-QUESTION", "SECRET-CONTEXT", "diagnostic-id",
                        (event, text) -> {}, new AtomicReference<>()));
            }
            body.set("{\"answer\":\"SECRET-INVALID-PLAN\"}");
            var classifier = new AgentClassifier(url, "SECRET-KEY", mapper);
            assertThrows(IllegalArgumentException.class, () -> classifier.classify("SECRET-QUESTION", "network", Map.of(), List.of(), "diagnostic-id"));
            var text = logs.list.stream().map(ILoggingEvent::getFormattedMessage).reduce("", (a, b) -> a + "\n" + b);
            for (String expected : List.of("requestId=diagnostic-id", "upstreamStatus=401", "reason=empty_answer",
                    "reason=upstream_error_event", "reason=incomplete_stream", "reason=invalid_plan")) {
                assertTrue(text.contains(expected), text);
            }
            assertFalse(text.contains("SECRET"), text);
            assertTrue(logs.list.stream().allMatch(event -> event.getThrowableProxy() == null));
        } finally {
            server.stop(0);
            clientLogger.detachAppender(logs);
            classifierLogger.detachAppender(logs);
            logs.stop();
        }
    }
}
