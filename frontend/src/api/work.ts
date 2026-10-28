import type { Report } from "./types";
import type { Page } from "./client";

export type WorkKind = "patrols" | "defects" | "maintenance";
export const workLabels: Record<WorkKind, string> = {
  patrols: "巡检记录",
  defects: "检测病害",
  maintenance: "维修养护",
};

export interface WorkRecord {
  id: string;
  kind: WorkKind;
  cityCode: string;
  bridgeId: string;
  bridgeName: string;
  sourceBridgeKey: string;
  occurredAt: string | null;
  sourceUpdatedAt: string | null;
  syncStatus: string | null;
  taskId: string | null;
  code: string | null;
  unit: string | null;
  itemText: string | null;
  method: string | null;
  content: string | null;
  result: string | null;
  hazard: string | null;
  zone: number | null;
  item: number | null;
  damageType: number | null;
  origin: number | null;
  severity: number | null;
  status: number | null;
  description: string | null;
  quantity: string | null;
  location: string | null;
  maintenanceType: number | null;
  rectifiedDate: string | null;
  note: string | null;
  zoneName: string;
  itemName: string;
  damageTypeName: string;
  originName: string;
  severityName: string;
  statusName: string;
  maintenanceTypeName: string;
  attachmentProvided: boolean;
  dataIssues: string[];
}

export interface WorkDetail {
  record: WorkRecord;
  attachments: Report[];
  relatedRecords: Page<WorkRecord>;
  relationStatus: string;
  relationReason: string;
}

export type WorkDictionaries = Record<string, Record<string, string>>;

export interface QualityProfile {
  rawRows: number;
  distinctKeys: number;
  duplicateExcess: number;
  missingIdentifiers: number;
  deletedRows: number;
  mappedRows: number;
  unmatchedRows: number;
  ambiguousRows: number;
  missingBridgeKeys: number;
  missingDates: number;
  futureDates: number;
  missingSyncTimes: number;
  missingDetails: number;
  unknownCodes: number;
  unknownSyncStatus: number;
  earlierRectification: number;
  firstDate: string | null;
  lastDate: string | null;
  latestSync: string | null;
}

export interface QualityAssessment {
  kind: WorkKind;
  city: string;
  scope: "RAW_IMPORT";
  basis: string;
  checkedAt: string;
  cacheSeconds: number;
  profile: QualityProfile;
  issueLabels: Record<string, string>;
  relations: {
    duplicateDefectCodes: number;
    uniqueMaintenance: number;
    unmatchedMaintenance: number;
    ambiguousMaintenance: number;
    missingReferenceKeys: number;
  } | null;
}

export interface QualityIssue {
  id: string | null;
  cityCode: string | null;
  sourceBridgeKey: string | null;
  bridgeId: string | null;
  occurredAt: string | null;
  sourceUpdatedAt: string | null;
  syncStatus: string | null;
  issues: string[];
}
