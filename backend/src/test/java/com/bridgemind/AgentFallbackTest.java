package com.bridgemind;

import com.bridgemind.agent.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;
import java.io.IOException;
import java.util.*;
import java.util.function.BiConsumer;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AgentFallbackTest {
    private final JsonMapper json=JsonMapper.builder().build();
    private AgentEvidence.Evidence pack(){return new AgentEvidence.Evidence(Map.of("总体统计",Map.of("total",5,"cities",List.of(Map.of("label","南京","count",5))),"范围说明","当前接入桥梁"),List.of(new AgentEvidence.Reference("E1","来源","/api/v1/dashboard")));}
    private String ask(MockMvc mvc,MockHttpSession session,Map<String,Object> request)throws Exception{
        var result=mvc.perform(post("/api/v1/agent/ask").session(session).contentType("application/json").content(json.writeValueAsString(request)))
                .andExpect(request().asyncStarted()).andReturn();
        result.getAsyncResult(5000);
        return mvc.perform(asyncDispatch(result)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }
    private String conversationId(String s){for(String block:s.split("\n\n"))if(block.startsWith("event:meta"))return json.readTree(block.substring(block.indexOf("data:")+5)).path("conversationId").asText();throw new AssertionError(s);}
    @Test void overviewShortcutSkipsBothDifyCallsAndCompletesSse() throws Exception {
        var classifier=mock(AgentClassifier.class);var evidence=mock(AgentEvidence.class);var dify=mock(DifyClient.class);
        when(classifier.configured()).thenReturn(true);when(dify.configured()).thenReturn(true);
        var compact=new AgentEvidence.Evidence(Map.of("重点问答","data_overview","简版概览",true,"范围说明","当前范围",
            "监测数据覆盖",Map.of("scope_bridge_count",133,"channel_count",7417,"reading_count",0,"bridges_with_readings",0,"channels_with_readings",0)),List.of());
        when(evidence.build(any(),isNull(),eq(false))).thenReturn(compact);
        var controller=new AgentStreamController(classifier,evidence,dify,json,"source");
        try {
            var result=ask(MockMvcBuilders.standaloneSetup(controller).build(),new MockHttpSession(),Map.of("scope","network","question","整体数据情况","answerMode","auto"));
            assertTrue(result.contains("event:done"),result);assertFalse(result.contains("event:error"),result);
            assertTrue(result.contains("简版"));assertTrue(result.contains("本轮未查询"));assertFalse(result.contains("巡检 0 条"));
            verify(classifier,never()).classify(anyString(),anyString(),any(),any(),anyString());
            verify(dify,never()).stream(anyString(),anyString(),anyString(),any(),any());
            verify(evidence).build(argThat(p->p.topic().equals("data_overview")),isNull(),eq(false));
        } finally {controllerClose(controller);}
    }
    @Test void unavailableModelStillAnswersAndFollowupsReuseEvidence()throws Exception{
        var classifier=mock(AgentClassifier.class);var evidence=mock(AgentEvidence.class);var dify=mock(DifyClient.class);
        when(evidence.build(any(),isNull(),eq(false))).thenReturn(pack());
        var controller=new AgentStreamController(classifier,evidence,dify,json,"source");
        try{
            var mvc=MockMvcBuilders.standaloneSetup(controller).build();var session=new MockHttpSession();
            var first=ask(mvc,session,Map.of("scope","network","question","各地市接入桥梁数量对比"));
            assertTrue(first.contains("event:visualization"));assertTrue(first.contains("event:replace"));assertTrue(first.contains("event:done"));
            var second=ask(mvc,session,Map.of("scope","network","question","为什么","conversationId",conversationId(first)));
            assertTrue(second.contains("依据说明"),second);verify(evidence,times(1)).build(any(),any(),anyBoolean());
            mvc.perform(post("/api/v1/agent/ask").session(new MockHttpSession()).contentType("application/json")
                    .content(json.writeValueAsString(Map.of("scope","network","question","为什么","conversationId",conversationId(first)))))
                    .andExpect(status().isConflict());
        }finally{controllerClose(controller);}
    }
    @Test void interruptedModelAnswerIsReplacedAndCompletedHistoryReachesModel()throws Exception{
        var classifier=mock(AgentClassifier.class);var evidence=mock(AgentEvidence.class);var dify=mock(DifyClient.class);
        when(classifier.configured()).thenReturn(true);when(dify.configured()).thenReturn(true);
        when(classifier.classify(anyString(),anyString(),any(),any(),anyString())).thenReturn(new AgentPlan("business_query","overview",null,null,null,null,null));
        when(evidence.build(any(),isNull(),eq(false))).thenReturn(pack());
        doAnswer(call->{BiConsumer<String,String> events=call.getArgument(3);events.accept("delta","未完成的模型回答");throw new IOException("upstream");}).when(dify).stream(anyString(),anyString(),anyString(),any(),any());
        var controller=new AgentStreamController(classifier,evidence,dify,json,"source");
        try{
            var mvc=MockMvcBuilders.standaloneSetup(controller).build();var session=new MockHttpSession();
            var first=ask(mvc,session,Map.of("scope","network","question","接入桥梁概况"));
            assertTrue(first.contains("未完成的模型回答"),first);assertTrue(first.contains("event:replace"));assertFalse(first.contains("event:error"));
            doAnswer(call->{String context=call.getArgument(1);assertTrue(context.contains("最近三轮上下文"));assertTrue(context.contains("answer"));assertFalse(context.contains("未完成的模型回答"));BiConsumer<String,String> events=call.getArgument(3);events.accept("delta","已根据证据说明");return null;})
                    .when(dify).stream(anyString(),anyString(),anyString(),any(),any());
            var second=ask(mvc,session,Map.of("scope","network","question","详细一点","conversationId",conversationId(first)));
            assertTrue(second.contains("已根据证据说明"));verify(evidence,times(1)).build(any(),any(),anyBoolean());
        }finally{controllerClose(controller);}
    }
    private void controllerClose(AgentStreamController controller)throws Exception{
        var method=AgentStreamController.class.getDeclaredMethod("close");method.setAccessible(true);method.invoke(controller);
    }
    @Test void classifierFailureReportsStageWithoutLeakingUpstreamDetails()throws Exception{
        var classifier=mock(AgentClassifier.class);var evidence=mock(AgentEvidence.class);var dify=mock(DifyClient.class);
        when(classifier.configured()).thenReturn(true);when(dify.configured()).thenReturn(true);
        when(classifier.classify(anyString(),anyString(),any(),any(),anyString()))
                .thenThrow(new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_GATEWAY,"secret-key private-host"));
        var controller=new AgentStreamController(classifier,evidence,dify,json,"source");
        org.springframework.test.util.ReflectionTestUtils.setField(controller,"enhanced",false);
        try{
            var mvc=MockMvcBuilders.standaloneSetup(controller).build();
            var response=ask(mvc,new MockHttpSession(),Map.of("scope","network","question","接入桥梁概况"));
            assertTrue(response.contains("event:error"),response);
            assertTrue(response.contains("\"stage\":\"classification\""),response);
            assertTrue(response.contains("requestId"),response);
            assertFalse(response.contains("secret-key"));assertFalse(response.contains("private-host"));
            assertFalse(response.contains("event:done"));
            verifyNoInteractions(evidence);
        }finally{controllerClose(controller);}
    }
}
