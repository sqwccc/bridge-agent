package com.bridgemind.report.mapper;

import com.bridgemind.report.model.entity.ReportRecord;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 只返回能经显式设施编码关联至本桥的报告。
 */
public interface ReportMapper {
    List<ReportRecord> list(@Param("id") String id);
}
