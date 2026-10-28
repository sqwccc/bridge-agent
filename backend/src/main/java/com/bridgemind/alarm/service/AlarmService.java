package com.bridgemind.alarm.service;

import com.bridgemind.alarm.mapper.AlarmMapper;
import com.bridgemind.alarm.model.resp.AlarmResponse;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.common.PageResponse;
import com.bridgemind.monitoring.service.MonitoringService;

import java.time.LocalDateTime;
import java.time.Duration;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;

import org.springframework.stereotype.Service;

/**
 * 来源报警只读列表，不推断恢复状态或健康分值。
 */
@Service
public class AlarmService {
    private final AlarmMapper mapper;
    private final BridgeService bridges;
    private record Query(BridgeFilter filter, String id, String level, LocalDateTime from, LocalDateTime to, int page, int size) {}
    private final Cache<Query, PageResponse<AlarmResponse>> pages = Caffeine.newBuilder()
            .maximumSize(128).expireAfterWrite(Duration.ofSeconds(30)).build();

    public AlarmService(AlarmMapper mapper, BridgeService bridges) {
        this.mapper = mapper;
        this.bridges = bridges;
    }

    public PageResponse<AlarmResponse> list(BridgeFilter filter, String id, String level, LocalDateTime from, LocalDateTime to, int page, int size) {
        if (from != null || to != null) MonitoringService.validateRange(from, to);
        if (page < 1 || page > 100000 || size < 1 || size > 100 || (level != null && !level.isEmpty() && !level.matches("[123]")))
            throw new IllegalArgumentException();
        if (id != null && !id.isBlank()) bridges.require(id);
        return pages.get(new Query(filter, id, level, from, to, page, size), key -> {
            var rows = mapper.list(filter, id, level, from, to, size, (page - 1) * size);
            // 空首页的总数为零；翻过最后一页时才补查总数。
            long total = rows.isEmpty() ? (page == 1 ? 0 : mapper.count(filter, id, level, from, to)) : rows.getFirst().matchingTotal();
            return new PageResponse<>(java.util.List.copyOf(rows), total, page, size);
        });
    }
}
