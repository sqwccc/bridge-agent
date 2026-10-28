package com.bridgemind.bridge.mapper;

import java.util.List;

import org.apache.ibatis.annotations.Param;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.bridge.model.resp.BridgeResponse;

/**
 * 来源数据访问：所有语句只读，分页固定排序。
 */
public interface BridgeMapper {
    List<BridgeResponse> all(@Param("filter") BridgeFilter filter);

    List<BridgeResponse> page(@Param("filter") BridgeFilter filter, @Param("limit") int limit, @Param("offset") int offset);

    long count(@Param("filter") BridgeFilter filter);

    BridgeResponse find(@Param("id") String id);

    boolean exists(@Param("id") String id);

    /** Internal lookup: BridgeService must validate visibility with require() first. */
    com.bridgemind.bridge.model.resp.BridgeArchive archiveForVisible(@Param("id") String id);

    com.bridgemind.bridge.model.resp.BridgeArchive archive(@Param("id") String id);

    List<com.bridgemind.dashboard.model.resp.DashboardResponse.Group> cities();
}
