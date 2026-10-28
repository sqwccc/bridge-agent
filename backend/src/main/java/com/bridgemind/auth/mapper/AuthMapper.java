package com.bridgemind.auth.mapper;

import com.bridgemind.auth.model.entity.UserEntity;
import org.apache.ibatis.annotations.Param;

/**
 * 仅连接业务库，管理独立登录账号。
 */
public interface AuthMapper {
    UserEntity find(@Param("username") String username);

    int create(@Param("username") String username, @Param("hash") String hash, @Param("displayName") String displayName);
}
