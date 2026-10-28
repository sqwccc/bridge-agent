/** 长度/宽度单位米，坐标使用来源值；技术等级不映射成健康等级。 */
export interface Bridge {
  id: string;
  code: string;
  name: string;
  cityCode: string;
  city: string;
  type: number | null;
  spanType: number | null;
  monitoringType: number | null;
  road: string | null;
  length: number | null;
  width: number | null;
  longitude: number | null;
  latitude: number | null;
  technicalGrade: string | null;
  inspectionDate: string | null;
  completedDate: string | null;
  manager: string | null;
  maintainer: string | null;
  sourceUpdatedAt: string | null;
  typeName: string;
  conditionGrade: string | null;
  conditionGradeName: string;
  structureGrade: string | null;
  structureGradeName: string;
  maintenanceCategory: number | null;
  maintenanceCategoryName: string;
  bridgeStatus: number | null;
  bridgeStatusName: string;
  transferred: number | null;
  transferredName: string;
  demolished: number | null;
  demolishedName: string;
  demolitionStatus: number | null;
  demolitionStatusName: string;
  reportedMonitoringType: number | null;
  effectiveMonitoringType: number | null;
  effectiveMonitoringTypeName: string;
  monitoringTypeBasis:
    "REPORTED" | "DEVICE_DEFAULT" | "UNRECOGNIZED" | "MISSING";
  monitoringSystemBuilt: boolean | null;
  hasMonitoringDevices: boolean;
  inspectionReportPresent: boolean;
  conditionGradeStatus: FieldStatus;
  structureGradeStatus: FieldStatus;
  inspectionDateStatus: FieldStatus;
  inspectionReportStatus: FieldStatus;
  dataIssues: { field: string; code: string; message: string }[];
  specialBridge: number | null;
  specialTypesRaw: string | null;
  specialTypeCodes: string[];
  specialTypeNames: string[];
  singleColumnPier: boolean | null;
  spanTypeName: string;
  normalUse: boolean;
  archive?: BridgeArchive;
}

export interface BridgeArchive {
  districtCode: string | null;
  bridgeClassName: string;
  useClassName: string;
  roadGradeName: string;
  maintenanceLevelName: string;
  spanCount: number | null;
  spanArrangement: string | null;
  maxSpan: number | null;
  deckArea: number | null;
  materialName: string;
  mainGirderName: string;
  loadGradeName: string;
  designLoad: string | null;
  actualLoad: string | null;
  loadLimitName: string;
  singleColumnPier: boolean | null;
  singleColumnPierCount: string | null;
  constructionUnit: string | null;
  designUnit: string | null;
  supervisionUnit: string | null;
  contractor: string | null;
  overview: string | null;
  reconstructionDate: string | null;
  costTenThousand: number | null;
  archiveCode: string | null;
  drawingStatus: string | null;
  electronicArchive: string | null;
  sourceUpdatedAt: string | null;
}

export interface FieldStatus {
  status: "PRESENT" | "ALLOWED_EMPTY" | "MISSING" | "UNDETERMINED";
  reason: string;
}

export interface DictionaryOption {
  code: string;
  label: string;
}

export type BridgeDictionaries = Record<string, DictionaryOption[]>;

export interface Group {
  code: string;
  label: string;
  count: number;
}

export interface Point {
  id: string;
  name: string;
  cityCode: string;
  longitude: number;
  latitude: number;
  conditionGradeBucket: string;
  structureGradeBucket: string;
}

export interface GradeCategory {
  code: "I" | "II_V" | "unknown";
  label: string;
  total: number;
  grades: Group[];
}

export interface Dashboard {
  total: number;
  located: number;
  monitored: number;
  sourceUpdatedAt: string | null;
  cities: Group[];
  types: Group[];
  monitoringTypes: Group[];
  technicalGrades: Group[];
  points: Point[];
  conditionGrades: Group[];
  structureGrades: Group[];
  conditionGradeCategories: GradeCategory[];
  structureGradeCategories: GradeCategory[];
  monitoringDefaulted: number;
  withMonitoringDevices: number;
  spanTypes: Group[];
  maintenanceCategories: Group[];
  bridgeStatuses: Group[];
  specialTypes: Group[];
  normalUse: number;
  specialTypesRegistered: number;
  specialFlagProvided: number;
  singleColumnPiers: number;
}

export interface Alarm {
  id: string;
  bridgeId: string;
  bridgeName: string;
  cityCode: string;
  time: string;
  name: string;
  metric: string;
  level: string;
  value: number | null;
  threshold: string | null;
  handlingStatus: string | null;
  handledAt: string | null;
}

export interface MonitorPoint {
  pointId: string;
  pointName: string;
  deviceId: string;
  deviceName: string;
  metric: string | null;
  unit: string | null;
  metricName: string;
  unitBasis: string;
  deviceType: string | null;
  deviceModel: string | null;
  sourceDeviceStatus: number | null;
  sourceUpdatedAt: string | null;
}

export interface Threshold {
  id: string;
  pointId: string;
  deviceId: string;
  metric: string | null;
  metricName: string;
  unit: string | null;
  level: number | null;
  levelName: string;
  upper: number | null;
  lower: number | null;
  legacyThreshold: string | null;
  note: string | null;
  sourceUpdatedAt: string | null;
  boundaryConvention: string;
  extremePlaceholder: boolean;
  dataIssues: string[];
}

export interface Sample {
  time: string;
  rawValue: string;
  value: number | null;
}

export interface Report {
  id: string;
  name: string;
  type: string;
  time: string | null;
  status: string;
  pdf: boolean;
  source: string;
  sourceLabel: string;
  inspectionId: string | null;
  inspectionType: number | null;
  inspectionTypeName: string;
  inspectionDate: string | null;
  sourceUpdatedAt: string | null;
  requirementStatus: string;
  statusReason: string;
  attachmentKind: "IMAGE" | "ATTACHMENT" | "REPORT";
  attachmentScope: "BRIDGE" | "TASK";
  taskId: string | null;
  relatedBridgeCount: number | null;
}

export const num = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("zh-CN");
export const time = (value: string | null | undefined) =>
  value ? value.replace("T", " ").slice(0, 19) : "未提供";

/** 日期控件固定解释为北京时间，避免浏览器时区影响来源查询窗口。 */
export function localTime(date: Date) {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return parts.replace(" ", "T");
}
