package com.bridgemind;

import com.bridgemind.agent.*;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import tools.jackson.databind.json.JsonMapper;
import java.util.List;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AgentRoutingTest {
    @Test void unrelatedAndHelpNeverAccessBusinessEvidence() throws Exception {
        var classifier=mock(AgentClassifier.class);var evidence=mock(AgentEvidence.class);var dify=mock(DifyClient.class);
        when(classifier.configured()).thenReturn(true);when(dify.configured()).thenReturn(true);
        for(String route:List.of("out_of_scope","greeting_help","unsupported","clarification_required")) {
            when(classifier.classify(anyString(),anyString(),any(),any(),anyString())).thenReturn(new AgentPlan(route,"overview",null,null,null,null,"请明确比较指标"));
            var controller=new AgentStreamController(classifier,evidence,dify,JsonMapper.builder().build(),"source");
            var mvc=MockMvcBuilders.standaloneSetup(controller).build();
            var result=mvc.perform(post("/api/v1/agent/ask").session(new MockHttpSession()).contentType("application/json")
                    .content("{\"scope\":\"network\",\"question\":\"test\"}")).andExpect(request().asyncStarted()).andReturn();
            result.getAsyncResult(5000);
            var response=mvc.perform(asyncDispatch(result)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
            assertTrue(response.contains("event:done"));assertTrue(response.contains("event:delta"));
        }
        verifyNoInteractions(evidence);
        verify(dify,never()).stream(anyString(),anyString(),anyString(),any(),any());
    }
    @Test void invalidRoutesAndTopicsFailClosed(){
        assertThrows(IllegalArgumentException.class,()->new AgentPlan("sql","overview",null,null,null,null,null));
        assertThrows(IllegalArgumentException.class,()->new AgentPlan("business_query","execute_sql",null,null,null,null,null));
    }
}
