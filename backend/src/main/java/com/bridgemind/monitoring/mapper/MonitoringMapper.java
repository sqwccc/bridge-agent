package com.bridgemind.monitoring.mapper;

import java.util.List;
import java.time.LocalDateTime;

import org.apache.ibatis.annotations.Param;
import com.bridgemind.monitoring.model.resp.*;

/**
 * 通过唯一设施编号关系查询监测数据，不进行名称匹配。
 */
public interface MonitoringMapper {
    List<MonitorPointResponse> points(@Param("id") String id);

    List<ThresholdResponse> thresholds(@Param("id") String id, @Param("point") String point, @Param("device") String device, @Param("metric") String metric);

    List<SampleResponse> samples(@Param("id") String id, @Param("point") String point, @Param("device") String device, @Param("metric") String metric, @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    // Internal fast paths: callers must first validate the exact point/device/metric
    // against the bridge snapshot. city is obtained from BridgeService, never the request.
    List<SampleResponse> samplesForPoint(@Param("city") String city, @Param("point") String point,
            @Param("device") String device, @Param("metric") String metric,
            @Param("from") LocalDateTime from, @Param("to") LocalDateTime to);

    List<ThresholdResponse> thresholdsForPoints(@Param("city") String city,
            @Param("points") List<MonitorPointResponse> points);
}
