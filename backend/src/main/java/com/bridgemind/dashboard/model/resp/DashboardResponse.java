package com.bridgemind.dashboard.model.resp;

import java.util.List;
import java.time.LocalDateTime;

/**
 * 同一筛选快照中的统计与点位；无有效坐标的桥梁不出现在 points 中。
 */
public record DashboardResponse(long total, long located, long monitored, LocalDateTime sourceUpdatedAt,
                                List<Group> cities, List<Group> types, List<Group> monitoringTypes,
                                List<Group> technicalGrades, List<Point> points,
                                List<Group> conditionGrades, List<Group> structureGrades, long monitoringDefaulted,
                                long withMonitoringDevices,
                                List<Group> spanTypes, List<Group> maintenanceCategories, List<Group> bridgeStatuses,
                                List<Group> specialTypes,
                                long normalUse, long specialTypesRegistered, long specialFlagProvided,
                                long singleColumnPiers,
                                List<GradeCategory> conditionGradeCategories, List<GradeCategory> structureGradeCategories) {
    public record Group(String code, String label, long count) {
    }

    public record GradeCategory(String code, String label, long total, List<Group> grades) {
    }

    public record Point(String id, String name, String cityCode, double longitude, double latitude,
                        String conditionGradeBucket, String structureGradeBucket) {
    }
}
