package com.bridgemind.common;

import java.util.List;

/**
 * 稳定排序的分页结果；页码从 1 开始。
 */
public record PageResponse<T>(List<T> items, long total, int page, int size) {
}
