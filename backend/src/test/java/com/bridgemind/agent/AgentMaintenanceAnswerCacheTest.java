package com.bridgemind.agent;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;
import java.time.*;
import java.util.*;
import java.util.function.BiConsumer;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

class AgentMaintenanceAnswerCacheTest {
    final JsonMapper json=JsonMapper.builder().build();
    final AgentPlan plan=new AgentPlan("business_query","maintenance_plan",null,null,null,null,null);
    final AgentEvidence.Evidence evidence=new AgentEvidence.Evidence(Map.of("重点问答","maintenance_plan","查询时间","original"),List.of());
    AgentStreamController.Question question(String bridge,String text) {
        return new AgentStreamController.Question(text,"bridge",bridge,null,null,null,null,"auto");
    }
    @Test void isolationExpiryAndPrivateCopies() {
        var instant=new java.util.concurrent.atomic.AtomicReference<>(Instant.parse("2026-11-01T10:00:00Z"));
        var clock=new Clock(){public ZoneId getZone(){return ZoneOffset.UTC;}public Clock withZone(ZoneId zone){return Clock.fixed(instant.get(),zone);}public Instant instant(){return instant.get();}};
        var cache=new AgentMaintenanceAnswerCache(json,clock);
        var key=cache.key("session",question("one","养护方案"));
        cache.put(key,plan,evidence,null,"完整回答");
        assertNull(cache.get(key,0));
        var result=cache.get(key,1800);assertEquals("完整回答",result.text());
        result.evidence().data().put("查询时间","changed");
        assertEquals("original",cache.get(key,1800).evidence().data().get("查询时间"));
        assertNull(cache.get(cache.key("other",question("one","养护方案")),1800));
        assertNull(cache.get(cache.key("session",question("two","养护方案")),1800));
        assertNull(cache.get(cache.key("session",question("one","别的问题")),1800));
        var dated=new AgentStreamController.Question("养护方案","bridge","one",null,LocalDate.of(2026,10,1),null,null,"auto");
        assertNull(cache.get(cache.key("session",dated),1800));
        instant.set(instant.get().plusSeconds(1801));assertNull(cache.get(key,1800));
        cache.put(key,new AgentPlan("business_query","overview",null,null,null,null,null),evidence,null,"其他回答");
        assertNull(cache.get(key,1800));
    }
    String ask(MockMvc mvc,MockHttpSession session,String text,String conversation)throws Exception {
        var body=new AgentStreamController.Question(text,"bridge","one",null,null,null,conversation,"auto");
        var result=mvc.perform(post("/api/v1/agent/ask").session(session).contentType("application/json").content(json.writeValueAsString(body))).andReturn();
        result.getAsyncResult(5000);
        return mvc.perform(asyncDispatch(result)).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }
    @Test void completedAnswersSkipQueriesAndModelButFollowupsAndFailuresDoNot()throws Exception {
        var classifier=mock(AgentClassifier.class);var source=mock(AgentEvidence.class);var dify=mock(DifyClient.class);
        when(classifier.configured()).thenReturn(true);when(dify.configured()).thenReturn(true);
        when(classifier.classify(anyString(),anyString(),any(),anyList(),anyString())).thenReturn(plan);
        when(source.build(any(),anyString(),eq(false))).thenReturn(evidence);
        doAnswer(call->{BiConsumer<String,String> output=call.getArgument(3);output.accept("delta","完整养护方案");return null;}).when(dify).stream(anyString(),anyString(),anyString(),any(),any());
        var controller=new AgentStreamController(classifier,source,dify,json,"source");
        ReflectionTestUtils.setField(controller,"maintenanceAnswerCacheSeconds",1800);
        try {
            var mvc=MockMvcBuilders.standaloneSetup(controller).build();var session=new MockHttpSession();
            assertTrue(ask(mvc,session,"养护方案",null).contains("完整养护方案"));
            var hit=ask(mvc,session,"养护方案",null);assertTrue(hit.contains("临时缓存"),hit);
            verify(source,times(1)).build(any(),anyString(),eq(false));
            verify(dify,times(1)).stream(anyString(),anyString(),anyString(),any(),any());
            String id=null;
            for(String block:hit.split("\n\n"))if(block.startsWith("event:meta"))id=json.readTree(block.substring(block.indexOf("data:")+5)).path("conversationId").asText();
            assertNotNull(id);ask(mvc,session,"为什么",id);
            verify(dify,times(2)).stream(anyString(),anyString(),anyString(),any(),any());
            doThrow(new IllegalStateException("unavailable")).when(dify).stream(anyString(),anyString(),anyString(),any(),any());
            var failedSession=new MockHttpSession();
            assertFalse(ask(mvc,failedSession,"养护方案",null).contains("临时缓存"));
            assertFalse(ask(mvc,failedSession,"养护方案",null).contains("临时缓存"));
            verify(dify,times(4)).stream(anyString(),anyString(),anyString(),any(),any());
        } finally {controller.close();}
    }
}
