package com.bridgemind.auth.controller;

import com.bridgemind.auth.model.req.LoginRequest;
import com.bridgemind.auth.model.resp.UserResponse;
import com.bridgemind.auth.service.AuthService;
import com.bridgemind.common.ApiResponse;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.*;
import org.springframework.security.core.*;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

/**
 * JSON 登录入口；登录成功更换 Session ID，退出销毁整个 Session。
 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    @Value("${bridgemind.preview-enabled:false}")
    private boolean previewEnabled;

    @GetMapping("/config")
    public ApiResponse<?> config() {
        return ApiResponse.ok(Map.of("previewEnabled", previewEnabled));
    }

    private final AuthenticationManager manager;
    private final SecurityContextRepository repository;
    private final AuthService service;

    public AuthController(AuthenticationManager manager, SecurityContextRepository repository, AuthService service) {
        this.manager = manager;
        this.repository = repository;
        this.service = service;
    }

    @GetMapping("/csrf")
    public ApiResponse<?> csrf(CsrfToken token) {
        return ApiResponse.ok(Map.of("token", token.getToken(), "headerName", token.getHeaderName()));
    }

    @PostMapping("/login")
    public ApiResponse<UserResponse> login(@Valid @RequestBody LoginRequest body, HttpServletRequest req, HttpServletResponse res) {
        try {
            var auth = manager.authenticate(UsernamePasswordAuthenticationToken.unauthenticated(body.username(), body.password()));
            req.getSession();
            req.changeSessionId();
            var context = SecurityContextHolder.createEmptyContext();
            context.setAuthentication(auth);
            SecurityContextHolder.setContext(context);
            repository.saveContext(context, req, res);
            return ApiResponse.ok(new UserResponse(auth.getName(), service.displayName(auth.getName())));
        } catch (AuthenticationException e) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "账号或密码错误");
        }
    }

    @GetMapping("/me")
    public ApiResponse<UserResponse> me(Authentication auth) {
        return ApiResponse.ok(new UserResponse(auth.getName(), service.displayName(auth.getName())));
    }

    @PostMapping("/logout")
    public ApiResponse<?> logout(HttpServletRequest req, HttpServletResponse res, Authentication auth) {
        new SecurityContextLogoutHandler().logout(req, res, auth);
        return ApiResponse.ok(null);
    }
}
