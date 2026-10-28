package com.bridgemind.work.mapper;

import com.bridgemind.work.model.*;

import java.util.List;

import org.apache.ibatis.annotations.Param;

public interface WorkMapper {
    List<WorkRecord> list(@Param("bridgeId") String bridgeId, @Param("kind") String kind, @Param("filter") WorkFilter filter, @Param("limit") int limit, @Param("offset") int offset);

    long count(@Param("bridgeId") String bridgeId, @Param("kind") String kind, @Param("filter") WorkFilter filter);

    WorkRecord find(@Param("bridgeId") String bridgeId, @Param("kind") String kind, @Param("recordId") String recordId);
}
