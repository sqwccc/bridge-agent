/** 地图、等级柱状图与概览统一使用来源评价分组的配色。 */
export const gradeColors: Record<string, string> = {
  "1": "#22c55e",
  "2": "#ef4444",
  "3": "#22c55e",
  "4": "#4a90f7",
  "5": "#f5c534",
  "6": "#f5772a",
  "7": "#ef4444",
  other: "#7693ad",
};
export const gradeColor = (bucket?: string) =>
  gradeColors[bucket || "other"] || gradeColors.other;
