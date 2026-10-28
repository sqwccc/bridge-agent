package com.bridgemind.auth.model.entity;

/**
 * 本系统账号持久化对象，不作为接口响应返回。
 */
public record UserEntity(long id, String username, String passwordHash, String displayName, boolean enabled) {
}
