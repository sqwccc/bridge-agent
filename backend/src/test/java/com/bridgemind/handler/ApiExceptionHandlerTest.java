package com.bridgemind.handler;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 来源故障不得伪装成零数据，也不能泄露异常中的连接详情。
 */
class ApiExceptionHandlerTest {
    @Test
    void dataFailureReturns503WithoutInternalDetails() {
        var result = new ApiExceptionHandler().database(new DataAccessResourceFailureException("private-host secret-query"));
        assertEquals(503, result.getStatusCode().value());
        assertFalse(result.getBody().toString().contains("private-host"));
        assertTrue(result.getBody().toString().contains("SOURCE_UNAVAILABLE"));
    }
}
