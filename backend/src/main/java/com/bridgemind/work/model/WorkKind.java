package com.bridgemind.work.model;

/**
 * 路径中的业务类型只允许固定集合，SQL 不接收来源表名。
 */
public enum WorkKind {
    patrols, defects, maintenance;

    public static WorkKind parse(String value) {
        try {
            return valueOf(value);
        } catch (RuntimeException e) {
            throw new IllegalArgumentException("记录类型不支持");
        }
    }
}
