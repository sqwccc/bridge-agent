package com.bridgemind.diagnostics;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.session.*;
import org.apache.ibatis.cache.CacheKey;
import org.apache.ibatis.mapping.BoundSql;

@Intercepts({
 @Signature(type=Executor.class,method="query",args={MappedStatement.class,Object.class,RowBounds.class,ResultHandler.class}),
 @Signature(type=Executor.class,method="query",args={MappedStatement.class,Object.class,RowBounds.class,ResultHandler.class,CacheKey.class,BoundSql.class})
})
public class QueryTraceInterceptor implements Interceptor {
    private final String source;
    public QueryTraceInterceptor(String source){this.source=source;}
    public Object intercept(Invocation invocation) throws Throwable {
        var statement=(MappedStatement)invocation.getArgs()[0];
        // Only agent requests: avoid noisy polling logs from unrelated dashboard traffic.
        if(org.slf4j.MDC.get("agentRequestId")==null)return invocation.proceed();
        Integer timeout=statement.getTimeout()!=null?statement.getTimeout():statement.getConfiguration().getDefaultStatementTimeout();
        return QueryTrace.query(source,statement.getId(),timeout,()->{try{return invocation.proceed();}catch(Exception e){throw e;}catch(Throwable t){throw new IllegalStateException("QUERY_INVOCATION_FAILED",t);}});
    }
}
