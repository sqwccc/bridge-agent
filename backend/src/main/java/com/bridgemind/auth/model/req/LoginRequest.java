package com.bridgemind.auth.model.req;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * 登录凭据仅在请求中传递，不写日志。
 */
public record LoginRequest(@NotBlank @Size(max = 64) String username, @NotBlank @Size(max = 72) String password) {
}
