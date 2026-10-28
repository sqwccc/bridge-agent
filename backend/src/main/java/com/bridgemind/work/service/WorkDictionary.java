package com.bridgemind.work.service;

import java.util.*;

/**
 * 字典依据来源字段说明；未定义编码保留原值，不转换成正常或已完成。
 */
public final class WorkDictionary {
    private WorkDictionary() {
    }

    public static final Map<Integer, String> ZONES = Map.of(1, "桥面系及附属结构", 2, "上部结构、下部结构", 3, "人行天桥及地下通道附属设施", 99, "其他");
    public static final Map<Integer, String> ITEMS = numbered("桥面铺装|伸缩装置|排水设施|人行道铺装|栏杆、防撞护栏|防护网、声屏障|挡土墙、护坡、调治构造物|上部结构、下部结构|人行天桥及地下通道附属设施");
    public static final Map<Integer, String> DAMAGES = numbered("平整性及裂缝|坑槽|拥包|车辙|积水|沉陷|碎边|桥头跳车|连接松动|异常变形|破损|脱落|漏水|阻塞|是否造成明显跳车|泄水孔堵塞|排水设施缺损|裂缝|松动或变形|残缺|污秽|缺失|露筋|锈蚀|断裂|松动|缺损|变形|开裂|塌陷|倾斜|异常变化|缺陷|沉降|位移");
    public static final Map<Integer, String> SEVERITIES = numbered("无|轻微|中等|严重|紧急");
    public static final Map<Integer, String> ORIGINS = numbered("日常巡查|定期检测|特殊检测");
    public static final Map<Integer, String> DEFECT_STATUSES = numbered("待处理|维修中|列入计划|维修完成|已验收|暂不处理");
    public static final Map<Integer, String> REPAIR_STATUSES = numbered("待处理|整改中|列入计划|整改完成|已验收|暂不处理");
    public static final Map<Integer, String> MAINTENANCE_TYPES = numbered("保养小修|中修工程|大修工程");

    private static Map<Integer, String> numbered(String names) {
        var result = new LinkedHashMap<Integer, String>();
        String[] values = names.split("\\|");
        for (int i = 0; i < values.length; i++) result.put(i + 1, values[i]);
        return Collections.unmodifiableMap(result);
    }

    public static String label(Map<Integer, String> dict, Integer code) {
        return code == null ? "未提供" : dict.getOrDefault(code, code == 99 && (dict == ITEMS || dict == DAMAGES) ? "其他" : "未识别编码 " + code);
    }

    public static Map<String, Map<Integer, String>> all() {
        return Map.of("zones", ZONES, "items", ITEMS, "damages", DAMAGES, "severities", SEVERITIES, "origins", ORIGINS,
                "defectStatuses", DEFECT_STATUSES, "repairStatuses", REPAIR_STATUSES, "maintenanceTypes", MAINTENANCE_TYPES);
    }
}
