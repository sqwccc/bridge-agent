package com.bridgemind.auth.controller;

import com.bridgemind.common.ApiResponse;
import java.util.Map;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

/** 保留旧前端配置兼容接口及无需登录的 CSRF 获取接口。 */
@RestController
@RequestMapping("/api/v1/auth")
public class AuthController {
    @GetMapping("/config")
    public ApiResponse<?> config() {
        return ApiResponse.ok(Map.of("previewEnabled", true, "loginRequired", false));
    }

    @GetMapping("/csrf")
    public ApiResponse<?> csrf(CsrfToken token) {
        return ApiResponse.ok(Map.of("token", token.getToken(), "headerName", token.getHeaderName()));
    }
}
