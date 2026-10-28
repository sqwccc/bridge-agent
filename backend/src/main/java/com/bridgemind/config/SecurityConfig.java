package com.bridgemind.config;

import org.springframework.context.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.*;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.*;
import org.springframework.security.web.csrf.*;

/**
 * 同源 Session 登录；登录与退出同样校验 CSRF，所有数据接口必须认证。
 */
@Configuration
public class SecurityConfig {
    @Value("${bridgemind.preview-enabled:false}")
    private boolean previewEnabled;
    @Value("${bridgemind.dify.preview-access:false}")
    private boolean agentPreviewAccess;

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    AuthenticationManager authenticationManager(UserDetailsService users, PasswordEncoder encoder) {
        var provider = new DaoAuthenticationProvider(users);
        provider.setPasswordEncoder(encoder);
        return new ProviderManager(provider);
    }

    @Bean
    SecurityContextRepository securityContextRepository() {
        return new HttpSessionSecurityContextRepository();
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, SecurityContextRepository repository) throws Exception {
        http.authorizeHttpRequests(a -> {
                    a.dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ASYNC).permitAll();
                    a.requestMatchers("/actuator/health", "/api/v1/auth/config", "/api/v1/auth/csrf", "/api/v1/auth/login").permitAll();
                    if (previewEnabled && agentPreviewAccess)
                        a.requestMatchers(HttpMethod.POST, "/api/v1/bridges/*/agent/ask", "/api/v1/agent/ask").permitAll();
                    a.requestMatchers(HttpMethod.PUT, "/api/v1/bridges/*/structure-config").permitAll();
                    if (previewEnabled)
                        a.requestMatchers(HttpMethod.GET, "/api/v1/agent/status", "/api/v1/dashboard/**", "/api/v1/bridges/**", "/api/v1/alarms", "/api/v1/dictionaries/bridges", "/api/v1/data-quality/records/**").permitAll();
                    a.anyRequest().authenticated();
                })
                .securityContext(c -> c.securityContextRepository(repository).requireExplicitSave(true))
                .csrf(c -> c.csrfTokenRepository(new HttpSessionCsrfTokenRepository()).csrfTokenRequestHandler(new CsrfTokenRequestAttributeHandler()))
                .headers(h -> h.frameOptions(f -> f.sameOrigin()))
                .requestCache(AbstractHttpConfigurer::disable).httpBasic(AbstractHttpConfigurer::disable).formLogin(AbstractHttpConfigurer::disable).logout(AbstractHttpConfigurer::disable)
                .exceptionHandling(e -> e.authenticationEntryPoint((req, res, ex) -> {
                    res.setStatus(401);
                    res.setContentType("application/json;charset=UTF-8");
                    res.getWriter().write("{\"code\":\"UNAUTHORIZED\",\"message\":\"请先登录\",\"data\":null}");
                }).accessDeniedHandler((req, res, ex) -> {
                    res.setStatus(403);
                    res.setContentType("application/json;charset=UTF-8");
                    res.getWriter().write("{\"code\":\"FORBIDDEN\",\"message\":\"请求校验失败，请刷新后重试\",\"data\":null}");
                }));
        return http.build();
    }
}
