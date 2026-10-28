package com.bridgemind.bridge.service;

import com.bridgemind.bridge.mapper.BridgeMapper;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.model.resp.BridgeResponse;
import com.bridgemind.common.PageResponse;

import java.util.List;
import java.util.Comparator;
import java.util.stream.Collectors;
import java.time.Duration;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.bridgemind.dashboard.model.resp.DashboardResponse.Group;

import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

/**
 * 单桥存在性与筛选规则的统一入口，其他模块通过此服务查询桥梁。
 */
@Service
public class BridgeService {
    private final BridgeMapper mapper;
    // 相同条件的并发请求共用一次加载；按完成写入时间过期，失败不缓存。
    private final Cache<BridgeFilter, List<BridgeResponse>> snapshots;

    @org.springframework.beans.factory.annotation.Autowired
    public BridgeService(BridgeMapper mapper) {
        this(mapper, Caffeine.newBuilder().maximumSize(64).expireAfterWrite(Duration.ofSeconds(30)).build());
    }

    BridgeService(BridgeMapper mapper, Cache<BridgeFilter, List<BridgeResponse>> snapshots) {
        this.mapper = mapper;
        this.snapshots = snapshots;
    }

    public List<BridgeResponse> all(BridgeFilter filter) {
        return snapshots.get(filter, key -> List.copyOf(mapper.all(key)));
    }

    public com.bridgemind.bridge.model.resp.BridgeDetailResponse detail(String id) {
        var bridge = require(id);
        return new com.bridgemind.bridge.model.resp.BridgeDetailResponse(bridge, mapper.archiveForVisible(id));
    }

    public List<com.bridgemind.dashboard.model.resp.DashboardResponse.Group> cities() {
        return all(new BridgeFilter(null, null, null, null)).stream()
                .collect(Collectors.groupingBy(BridgeResponse::cityCode)).entrySet().stream()
                .map(e -> new Group(e.getKey(), e.getValue().getFirst().city(), e.getValue().size()))
                .sorted(Comparator.comparingLong(Group::count).reversed().thenComparing(Group::code)).toList();
    }

    public PageResponse<BridgeResponse> page(BridgeFilter filter, int page, int size) {
        if (page < 1 || page > 100000 || size < 1 || size > 100) throw new IllegalArgumentException();
        // 大屏已需要完整点位快照；清单复用同一快照，避免重复列表及 count 查询。
        var rows = all(filter);
        int start = Math.min(rows.size(), (page - 1) * size);
        return new PageResponse<>(List.copyOf(rows.subList(start, Math.min(rows.size(), start + size))), rows.size(), page, size);
    }

    public BridgeResponse require(String id) {
        var result = all(new BridgeFilter(null, null, null, null)).stream()
                .filter(b -> id.equals(b.id())).findFirst().orElse(null);
        if (result == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "桥梁不存在、已删除或无有效关联监测设备");
        return result;
    }

    public void requireExists(String id) {
        require(id);
    }
}
