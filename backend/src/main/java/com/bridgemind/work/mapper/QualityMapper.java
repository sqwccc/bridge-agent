package com.bridgemind.work.mapper;

import com.bridgemind.work.model.*;

import java.util.List;

import org.apache.ibatis.annotations.Param;

public interface QualityMapper {
    QualityProfile profile(@Param("kind") String kind, @Param("city") String city);

    List<QualityIssue> issues(@Param("kind") String kind, @Param("city") String city, @Param("issue") String issue, @Param("limit") int limit, @Param("offset") int offset);

    long issueCount(@Param("kind") String kind, @Param("city") String city, @Param("issue") String issue);

    QualityRelations relations(@Param("city") String city);
}
