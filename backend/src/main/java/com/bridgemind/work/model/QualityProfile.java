package com.bridgemind.work.model;

import java.time.LocalDateTime;

/**
 * 导入原始行的质量，不将未归属记录算入单桥有效业务统计。
 */
public record QualityProfile(long rawRows, long distinctKeys, long duplicateExcess, long missingIdentifiers,
                             long deletedRows, long mappedRows, long unmatchedRows, long ambiguousRows,
                             long missingBridgeKeys, long missingDates, long futureDates, long missingSyncTimes,
                             long missingDetails, long unknownCodes, long unknownSyncStatus, long earlierRectification,
                             LocalDateTime firstDate, LocalDateTime lastDate, LocalDateTime latestSync) {
}
