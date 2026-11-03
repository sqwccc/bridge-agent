package com.bridgemind.config;

import com.bridgemind.auth.controller.AuthController;
import jakarta.servlet.DispatcherType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.junit.jupiter.web.SpringJUnitWebConfig;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.context.WebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringJUnitWebConfig(NoLoginSecurityTest.Config.class)
@TestPropertySource(properties = {"bridgemind.preview-enabled=false", "bridgemind.dify.preview-access=false"})
class NoLoginSecurityTest {
    @Configuration
    @EnableWebMvc
    @EnableWebSecurity
    @Import({SecurityConfig.class, AuthController.class, Probe.class})
    static class Config {}

    @RestController
    static class Probe {
        @GetMapping({"/api/v1/bridges/10905200071/monitoring/latest", "/api/v1/alarms", "/error"})
        String read() { return "ok"; }
        @PostMapping("/api/v1/agent/ask") String ask() { return "ok"; }
        @PutMapping("/api/v1/bridges/10905200071/structure-config") String save() { return "ok"; }
    }

    @Autowired WebApplicationContext context;
    MockMvc mvc;
    @BeforeEach void setup() {
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }

    @Test void readsAndErrorDispatchNeedNoLoginEvenWithOldFlagsDisabled() throws Exception {
        mvc.perform(get("/api/v1/bridges/10905200071/monitoring/latest")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/alarms")).andExpect(status().isOk());
        mvc.perform(get("/error").with(request -> {
            request.setDispatcherType(DispatcherType.ERROR);
            return request;
        })).andExpect(status().isOk());
        mvc.perform(get("/api/v1/auth/config")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.loginRequired").value(false));
        mvc.perform(get("/api/v1/auth/me")).andExpect(status().isNotFound());
    }

    @Test void writesNeedCsrfButNoAccount() throws Exception {
        mvc.perform(get("/api/v1/auth/csrf")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.token").isNotEmpty());
        mvc.perform(post("/api/v1/agent/ask").with(csrf())).andExpect(status().isOk());
        mvc.perform(put("/api/v1/bridges/10905200071/structure-config").with(csrf())).andExpect(status().isOk());
        mvc.perform(post("/api/v1/agent/ask")).andExpect(status().isForbidden());
    }
}
