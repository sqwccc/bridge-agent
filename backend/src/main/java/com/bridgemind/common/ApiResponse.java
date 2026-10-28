package com.bridgemind.common;

/**
 * HTTP 状态表达协议结果，code 表达稳定的业务结果。
 */
public record ApiResponse<T>(String code, String message, T data) {
    public static <T> ApiResponse<T> ok(T data) {
        return new ApiResponse<>("OK", "成功", data);
    }

    public static ApiResponse<Void> error(String code, String message) {
        return new ApiResponse<>(code, message, null);
    }
}
