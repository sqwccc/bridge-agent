package com.bridgemind.handler;

import com.bridgemind.common.ApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;

/**
 * 不向客户端泄露数据库地址、SQL 和凭据；缺测与来源故障使用不同状态。
 */
@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<?> status(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(ApiResponse.error("REQUEST_FAILED", e.getReason()));
    }

    @ExceptionHandler({IllegalArgumentException.class, MethodArgumentNotValidException.class, MethodArgumentTypeMismatchException.class})
    ResponseEntity<?> invalid(Exception e) {
        return ResponseEntity.badRequest().body(ApiResponse.error("INVALID_REQUEST", "请求参数无效，请检查日期、页码和筛选条件"));
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<?> database(DataAccessException e) {
        LOG.warn("数据库查询不可用，异常类型 {}", e.getClass().getSimpleName());
        return ResponseEntity.status(503).body(ApiResponse.error("SOURCE_UNAVAILABLE", "数据服务暂不可用，请稍后重试"));
    }
}
