package com.bridgemind.alarm.mapper;

import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.alarm.model.resp.AlarmResponse;

import java.util.List;
import java.time.LocalDateTime;

import org.apache.ibatis.annotations.Param;

/**
 * 报警关联严格限制在唯一桥梁归属；处置记录按最新一条关联，防止倍增。
 */
public interface AlarmMapper {
    List<AlarmResponse> list(@Param("filter") BridgeFilter filter, @Param("id") String id, @Param("level") String level, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to, @Param("limit") int limit, @Param("offset") int offset);

    long count(@Param("filter") BridgeFilter filter, @Param("id") String id, @Param("level") String level, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);
}
