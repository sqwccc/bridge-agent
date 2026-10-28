package com.bridgemind.auth.service;

import com.bridgemind.auth.mapper.AuthMapper;
import org.springframework.security.core.userdetails.*;
import org.springframework.stereotype.Service;

/**
 * 账号认证只读取业务库，不依赖来源桥梁库可用性。
 */
@Service
public class AuthService implements UserDetailsService {
    private final AuthMapper mapper;

    public AuthService(AuthMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public UserDetails loadUserByUsername(String username) {
        var user = mapper.find(username);
        if (user == null) throw new UsernameNotFoundException("账号或密码错误");
        return User.withUsername(user.username()).password(user.passwordHash()).roles("VIEWER").disabled(!user.enabled()).build();
    }

    public String displayName(String username) {
        return mapper.find(username).displayName();
    }
}
