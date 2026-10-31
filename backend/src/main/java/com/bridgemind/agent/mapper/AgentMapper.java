package com.bridgemind.agent.mapper;

import org.apache.ibatis.annotations.Param;
import com.bridgemind.work.model.*;
import java.util.*;

public interface AgentMapper {
    List<Map<String, Object>> summary(@Param("bridgeIds") List<String> bridgeIds, @Param("kind") String kind, @Param("filter") WorkFilter filter);
    List<WorkRecord> examples(@Param("bridgeIds") List<String> bridgeIds, @Param("kind") String kind, @Param("filter") WorkFilter filter);
    Map<String,Object> monitoringCoverage(@Param("bridgeIds") List<String> bridgeIds, @Param("filter") WorkFilter filter);
    List<Map<String,Object>> maintenancePriorities(@Param("bridgeIds") List<String> bridgeIds, @Param("kind") String kind, @Param("filter") WorkFilter filter);
    List<WorkRecord> maintenanceCandidates(@Param("bridgeIds") List<String> bridgeIds, @Param("kind") String kind, @Param("filter") WorkFilter filter);
}
