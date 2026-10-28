package com.bridgemind.work.model;

/**
 * 同市同桥的最新有效记录，病害编号重复不会展开计作多次维修。
 */
public record QualityRelations(long duplicateDefectCodes, long uniqueMaintenance, long unmatchedMaintenance,
                               long ambiguousMaintenance, long missingReferenceKeys) {
}
