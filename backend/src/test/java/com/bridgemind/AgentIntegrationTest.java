package com.bridgemind;

import com.bridgemind.agent.*;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.work.service.WorkService;
import com.bridgemind.common.PageResponse;
import com.bridgemind.work.model.WorkFilter;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class AgentIntegrationTest {
    @Test
    void streamingRequiresMessageEndAndPropagatesChunks() throws Exception {
        var server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);
        var complete=new java.util.concurrent.atomic.AtomicBoolean(true);
        server.createContext("/v1/chat-messages",exchange->{
            var request=JsonMapper.builder().build().readTree(exchange.getRequestBody().readAllBytes());
            assertEquals("streaming",request.path("response_mode").asText());
            exchange.getResponseHeaders().add("Content-Type","text/event-stream");exchange.sendResponseHeaders(200,0);
            for(String chunk:List.of("桥梁","资料")){
                exchange.getResponseBody().write(("data: {\"event\":\"message\",\"answer\":\""+chunk+"\"}\n\n").getBytes(StandardCharsets.UTF_8));exchange.getResponseBody().flush();
            }
            if(complete.get())exchange.getResponseBody().write("data: {\"event\":\"message_end\"}\n\n".getBytes(StandardCharsets.UTF_8));
            exchange.close();
        });server.start();
        try{
            var client=new DifyClient("http://127.0.0.1:"+server.getAddress().getPort()+"/v1","test",JsonMapper.builder().build());
            var chunks=new java.util.ArrayList<String>();
            var active=new AtomicReference<java.io.InputStream>();
            client.stream("q","{}","u",(event,text)->chunks.add(text),active);
            assertEquals(List.of("桥梁","资料"),chunks);assertNull(active.get());
            complete.set(false);
            assertThrows(java.io.IOException.class,()->client.stream("q","{}","u",(event,text)->{},active));
            assertNull(active.get());
        }finally{server.stop(0);}
    }
    @Test
    void demoNeverReadsBusinessDetailsAndDateFilterApplies() {
        var bridges = mock(BridgeService.class);
        var work = mock(WorkService.class);
        var context = new AgentContext(bridges, work, JsonMapper.builder().build());
        var data = context.build("REAL-ID", true, LocalDate.of(2026, 10, 2), null);
        assertTrue(data.contains("合成联调样例"));
        assertFalse(data.contains("REAL-ID"));
        assertFalse(data.contains("DEMO-D1"));
        verify(bridges).requireExists("REAL-ID");
        verifyNoMoreInteractions(bridges);
        verifyNoInteractions(work);
    }

    @Test
    void sourceKeepsTotalAndTruncationInsteadOfPretendingSampleIsComplete() {
        var bridges = mock(BridgeService.class);
        var work = mock(WorkService.class);
        when(work.list(eq("B1"), anyString(), any(WorkFilter.class), eq(1), eq(30)))
                .thenReturn(new PageResponse<>(List.of(), 45, 1, 30));
        var context = new AgentContext(bridges, work, JsonMapper.builder().build());
        var data = context.build("B1", false, null, null);
        assertTrue(data.contains("\"truncated\":true"));
        assertTrue(data.contains("\"total\":45"));
        assertThrows(IllegalArgumentException.class, () -> context.build("B1", false,
                LocalDate.of(2026, 2, 1), LocalDate.of(2026, 1, 1)));
    }

    @Test
    void difyProtocolSendsContextWithoutClientConversationAndSanitizesErrors() throws Exception {
        var captured = new AtomicReference<String>();
        var server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/chat-messages", exchange -> {
            captured.set(new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            boolean authorized = "Bearer test-key".equals(exchange.getRequestHeaders().getFirst("Authorization"));
            byte[] body = (authorized ? "{\"answer\":\"来源资料未提供维修记录\"}" : "SECRET-UPSTREAM-DETAILS").getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(authorized ? 200 : 401, body.length);
            exchange.getResponseBody().write(body); exchange.close();
        });
        server.start();
        try {
            var url = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
            var client = new DifyClient(url, "test-key", JsonMapper.builder().build());
            assertEquals("来源资料未提供维修记录", client.ask("总结", "{\"total\":0}", "session-one"));
            var sent = JsonMapper.builder().build().readTree(captured.get());
            assertEquals("{\"total\":0}", sent.path("inputs").path("bridge_context").asText());
            assertEquals("session-one", sent.path("user").asText());
            assertFalse(sent.has("conversation_id"));
            var failure = assertThrows(ResponseStatusException.class,
                    () -> new DifyClient(url, "wrong", JsonMapper.builder().build()).ask("q", "c", "u"));
            assertFalse(failure.getReason().contains("SECRET"));
        } finally { server.stop(0); }
    }
}
