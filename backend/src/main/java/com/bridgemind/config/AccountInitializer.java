package com.bridgemind.config;

import com.bridgemind.auth.mapper.AuthMapper;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * 显式 init-account Profile 才创建账号；不覆盖现有账号和密码。
 */
@Component
@Profile("init-account")
public class AccountInitializer implements ApplicationRunner {
    private final AuthMapper mapper;
    private final PasswordEncoder encoder;
    private final Environment env;
    private final org.springframework.context.ConfigurableApplicationContext context;

    public AccountInitializer(AuthMapper mapper, PasswordEncoder encoder, Environment env, org.springframework.context.ConfigurableApplicationContext context) {
        this.mapper = mapper;
        this.encoder = encoder;
        this.env = env;
        this.context = context;
    }

    public void run(ApplicationArguments args) {
        String username = env.getRequiredProperty("INIT_USERNAME"), password = env.getRequiredProperty("INIT_PASSWORD");
        if (!username.matches("[A-Za-z0-9_.-]{3,64}") || password.length() < 12 || password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > 72)
            throw new IllegalArgumentException("账号需 3–64 个英文字符；密码需至少 12 字符且不超过 72 UTF-8 字节");
        if (mapper.find(username) == null)
            mapper.create(username, encoder.encode(password), env.getProperty("INIT_DISPLAY_NAME", "桥梁运维人员"));
        System.out.println("账号初始化完成，未更改已有账号。");
        org.springframework.boot.SpringApplication.exit(context, () -> 0);
    }
}
