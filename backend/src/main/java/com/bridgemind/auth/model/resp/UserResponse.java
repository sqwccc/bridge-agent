package com.bridgemind.auth.model.resp;

/**
 * 已认证用户的最小公开资料。
 */
public record UserResponse(String username, String displayName) {
}
