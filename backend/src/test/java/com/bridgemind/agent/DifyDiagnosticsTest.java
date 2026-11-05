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
    @Test void logsTimeoutPhaseAndPreservesCauseWithoutSecrets() throws Exception {
        var logger=(Logger)LoggerFactory.getLogger(DifyClient.class);
        var logs=new ListAppender<ILoggingEvent>();logs.start();logger.addAppender(logs);
        try {
            var http=org.mockito.Mockito.mock(java.net.http.HttpClient.class);
            var timeout=new java.net.http.HttpTimeoutException("SECRET-FAILURE");
            org.mockito.Mockito.doThrow(timeout).when(http).send(org.mockito.ArgumentMatchers.any(),org.mockito.ArgumentMatchers.any());
            var client=new DifyClient("http://SECRET-USER@localhost:8090/v1","SECRET-KEY",JsonMapper.builder().build(),http);
            var error=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->client.ask("SECRET-QUESTION","SECRET-CONTEXT","timeout-id"));
            assertSame(timeout,error.getCause());
            var request=org.mockito.ArgumentCaptor.forClass(java.net.http.HttpRequest.class);
            org.mockito.Mockito.verify(http).send(request.capture(),org.mockito.ArgumentMatchers.any());
            assertEquals(java.time.Duration.ofSeconds(180),request.getValue().timeout().orElseThrow());
            String text=logs.list.stream().map(ILoggingEvent::getFormattedMessage).reduce("",(a,b)->a+"\n"+b);
            for(String expected:List.of("requestId=timeout-id","requestTimeoutSeconds=180","connectTimeoutSeconds=10","phase=await_response_headers","headersReceived=false","elapsedMs=","reason=request_timeout","HttpTimeoutException"))assertTrue(text.contains(expected),text);
            assertFalse(text.contains("SECRET"),text);
        } finally {logger.detachAppender(logs);logs.stop();}
    }
    @Test void logsDateFieldAndFormatWithoutWholeRecord() {
        var logger=(Logger)LoggerFactory.getLogger(AgentFocusQueries.class);
        var logs=new ListAppender<ILoggingEvent>();logs.start();logger.addAppender(logs);
        org.slf4j.MDC.put("agentRequestId","date-id");org.slf4j.MDC.put("agentStep","focus.defects");
        try {
            for(String value:List.of("2026/11/04 12:34:56","SECRET-DATE")) {
                String row="[{\"occurred_at\":\""+value+"\",\"description\":\"SECRET-RECORD\"}]";
                assertThrows(tools.jackson.databind.exc.InvalidFormatException.class,()->AgentFocusQueries.decode(Map.of("summary","[]","examples",row,"candidates","[]")));
            }
            String text=logs.list.stream().map(ILoggingEvent::getFormattedMessage).reduce("",(a,b)->a+"\n"+b);
            for(String expected:List.of("requestId=date-id","step=focus.defects","section=examples","field=occurred_at","2026/11/04 12:34:56","shape=dddd/dd/dd dd:dd:dd","errorIndex=","dateValue=[redacted]"))assertTrue(text.contains(expected),text);
            assertFalse(text.contains("SECRET"),text);
        } finally {logger.detachAppender(logs);logs.stop();org.slf4j.MDC.clear();}
    }
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
