package com.bridgemind.diagnostics;

import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.slf4j.LoggerFactory;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.core.read.ListAppender;
import ch.qos.logback.classic.spi.ILoggingEvent;
import java.sql.SQLException;
import java.util.concurrent.Executors;
import static org.junit.jupiter.api.Assertions.*;

class QueryTraceTest {
    @Test void propagatesRequestToWorkerAndRestoresPriorContextOnFailure() throws Exception {
        try(var executor=Executors.newSingleThreadExecutor()) {
            executor.submit(()->MDC.put("agentRequestId","prior")).get();
            MDC.put("agentRequestId","request-123");MDC.put("agentStage","evidence");
            var task=QueryTrace.task("focus.defects",()->{
                assertEquals("request-123",MDC.get("agentRequestId"));
                assertEquals("evidence",MDC.get("agentStage"));
                assertEquals("focus.defects",MDC.get("agentStep"));
                throw new IllegalStateException("private-question");
            });
            MDC.clear();
            assertThrows(java.util.concurrent.ExecutionException.class,()->executor.submit(task).get());
            assertEquals("prior",executor.submit(()->MDC.get("agentRequestId")).get());
            assertNull(executor.submit(()->MDC.get("agentStep")).get());
        } finally {MDC.clear();}
    }
    @Test void logsFailedStatementAndSqlStateWithoutSensitiveMessagesAndPreservesException() {
        Logger logger=(Logger)LoggerFactory.getLogger(QueryTrace.class);
        var appender=new ListAppender<ILoggingEvent>();appender.start();logger.addAppender(appender);
        var sql=new SQLException("private-sql-value","57014",7);
        sql.setNextException(new SQLException("secret-token","08006",8));
        var failure=new IllegalStateException("private-question",sql);
        MDC.put("agentRequestId","request-123");
        try {
            var actual=assertThrows(IllegalStateException.class,()->QueryTrace.query("SOURCE_DB","AgentMapper.focusSnapshot",15,()->{throw failure;}));
            assertSame(failure,actual);
            String logs=appender.list.stream().map(ILoggingEvent::getFormattedMessage).reduce("",(a,b)->a+"\n"+b);
            for(String expected:new String[]{"query start","query failed","request-123","SOURCE_DB","AgentMapper.focusSnapshot","57014","08006","elapsedMs="})assertTrue(logs.contains(expected),expected);
            for(String secret:new String[]{"private-sql-value","secret-token","private-question"})assertFalse(logs.contains(secret));
        } finally {logger.detachAppender(appender);appender.stop();MDC.clear();}
    }
}
