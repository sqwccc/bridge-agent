package com.bridgemind.config;

import com.zaxxer.hikari.HikariDataSource;
import org.apache.ibatis.session.SqlSessionFactory;
import org.mybatis.spring.SqlSessionFactoryBean;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import javax.sql.DataSource;

/**
 * 两个显式连接池与 Mapper 扫描边界；Flyway 仅使用主业务数据源。
 */
@Configuration
@MapperScan(basePackages = "com.bridgemind.auth.mapper", sqlSessionFactoryRef = "appSqlSessionFactory")
public class DataSourceConfig {
    @Bean
    @Primary
    DataSource dataSource(Environment env) {
        return pool(env, "spring.datasource", false);
    }

    @Bean
    DataSource sourceDataSource(Environment env) {
        return pool(env, "bridgemind.source", true);
    }

    private HikariDataSource pool(Environment env, String prefix, boolean readOnly) {
        HikariDataSource pool = new HikariDataSource();
        pool.setJdbcUrl(env.getRequiredProperty(prefix + ".url"));
        pool.setUsername(env.getRequiredProperty(prefix + ".username"));
        pool.setPassword(env.getRequiredProperty(prefix + ".password"));
        pool.setReadOnly(readOnly);
        if (readOnly) pool.setSchema(env.getProperty("bridgemind.source.schema", "qiaoliang"));
        pool.setMaximumPoolSize(readOnly ? 6 : 4);
        pool.setConnectionTimeout(5000);
        pool.setInitializationFailTimeout(-1);
        pool.setPoolName(readOnly ? "bridge-source-readonly" : "bridge-app");
        return pool;
    }

    @Bean
    @Primary
    SqlSessionFactory appSqlSessionFactory(@Qualifier("dataSource") DataSource ds) throws Exception {
        return factory(ds, "classpath*:mapper/auth/*.xml");
    }

    @Bean
    SqlSessionFactory sourceSqlSessionFactory(@Qualifier("sourceDataSource") DataSource ds) throws Exception {
        return factory(ds, "classpath*:mapper/source/**/*.xml");
    }

    private SqlSessionFactory factory(DataSource ds, String location) throws Exception {
        SqlSessionFactoryBean bean = new SqlSessionFactoryBean();
        bean.setDataSource(ds);
        bean.setMapperLocations(new PathMatchingResourcePatternResolver().getResources(location));
        var config = new org.apache.ibatis.session.Configuration();
        config.setMapUnderscoreToCamelCase(true);
        config.setCallSettersOnNulls(true);
        config.setDefaultStatementTimeout(15);
        bean.setConfiguration(config);
        return bean.getObject();
    }

    @Configuration
    @MapperScan(basePackages = {"com.bridgemind.agent.mapper", "com.bridgemind.bridge.mapper", "com.bridgemind.monitoring.mapper", "com.bridgemind.alarm.mapper", "com.bridgemind.report.mapper", "com.bridgemind.work.mapper"}, sqlSessionFactoryRef = "sourceSqlSessionFactory")
    static class SourceMappers {
    }
}
