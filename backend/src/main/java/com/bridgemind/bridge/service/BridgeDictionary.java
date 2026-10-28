package com.bridgemind.bridge.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 来源释义依据省市数据对接 FAQ 2026 版；另提供展示用的其他分类。
 * 评价字段存储的是等级编码，不是指数分值。
 */
public final class BridgeDictionary {
    private BridgeDictionary() {
    }

    public record Option(String code, String label) {
    }

    private static List<Option> options(String... pairs) {
        var result = new java.util.ArrayList<Option>();
        for (int i = 0; i < pairs.length; i += 2) result.add(new Option(pairs[i], pairs[i + 1]));
        return List.copyOf(result);
    }

    public static final Map<String, List<Option>> VALUES;

    static {
        var values = new LinkedHashMap<String, List<Option>>();
        values.put("types", options("1", "梁式桥", "2", "拱式桥", "3", "悬索桥", "4", "斜拉桥", "5", "组合结构", "6", "其他特殊结构桥梁", "99", "其他"));
        // 0 是本系统合并后的筛选分组，不声明来源字典中的0为合法监测类型。
        values.put("monitoringTypes", options("1", "标准化监测", "2", "轻量化监测", "0", "其他"));
        values.put("maintenanceCategories", options("1", "Ⅰ类养护", "2", "Ⅱ类养护", "3", "Ⅲ类养护", "4", "Ⅳ类养护", "5", "Ⅴ类养护", "98", "未知", "99", "其他"));
        values.put("spanTypes", options("1", "特大桥", "2", "大桥", "3", "中桥", "4", "小桥", "5", "涵洞", "98", "未知", "99", "其他"));
        values.put("bridgeStatuses", options("0", "正常使用", "1", "维修施工", "2", "限载通行", "3", "交通封闭", "4", "已经拆除", "98", "未知", "99", "其他"));
        values.put("grades", options("1", "Ⅰ类：合格", "2", "Ⅰ类：不合格", "3", "Ⅱ～Ⅴ类：A级", "4", "Ⅱ～Ⅴ类：B级", "5", "Ⅱ～Ⅴ类：C级", "6", "Ⅱ～Ⅴ类：D级", "7", "Ⅱ～Ⅴ类：E级"));
        values.put("transferred", options("0", "未移交", "1", "已移交"));
        values.put("demolished", options("0", "未拆除", "1", "已拆除"));
        values.put("demolitionStatuses", options("0", "未处理", "1", "处理中", "2", "已处理"));
        values.put("specialTypes", options("1", "特大桥", "2", "特殊结构桥梁", "3", "特别重要桥梁"));
        values.put("bridgeClasses", options("1", "主线桥", "2", "高架桥", "3", "匝道桥", "4", "立交桥", "5", "人行天桥", "6", "其他", "98", "未知"));
        values.put("useClasses", options("1", "车行桥", "2", "人行桥", "98", "未知", "99", "其他"));
        values.put("roadGrades", options("1", "快速路", "2", "主干路", "3", "次干路", "4", "支路", "5", "街坊路", "98", "未知", "99", "其他"));
        values.put("maintenanceLevels", options("1", "Ⅰ等", "2", "Ⅱ等", "3", "Ⅲ等", "98", "未知", "99", "其他"));
        values.put("materials", options("1", "圬工", "2", "RC", "3", "PC", "4", "钢", "5", "钢管砼", "6", "钢混组合", "7", "其他材料"));
        values.put("mainGirders", options("1", "双曲拱", "2", "Ⅰ形梁", "3", "Ⅱ形梁", "4", "T梁", "5", "T形刚构", "6", "刚架拱", "7", "桁架梁", "8", "空心板梁", "9", "肋板梁", "10", "肋拱", "11", "连续T梁", "12", "连续刚构", "13", "连续箱梁", "14", "门式刚构", "15", "实心板梁", "16", "系杆拱", "17", "箱形拱", "18", "箱形梁", "19", "斜拉桥", "20", "斜腿刚构", "21", "悬臂梁桥", "22", "悬索桥", "23", "整体现浇板", "24", "组合式梁", "25", "其他拱桥", "26", "其他桥", "98", "未知"));
        values.put("loadGrades", options("1", "城-A级", "2", "城-B级", "3", "公路-Ⅰ级", "4", "公路-Ⅱ级", "5", "汽车-10级", "6", "汽车-15级", "7", "汽车-20级", "8", "汽车-超20级", "9", "[72年前规范]汽-6", "10", "[72年前规范]汽-8", "11", "[72年前规范]汽-10", "12", "[72年前规范]汽-13", "13", "[72年前规范]汽-15", "14", "[72年前规范]汽-18", "15", "[72年前规范]汽-26", "16", "其他", "98", "未知"));
        values.put("loadLimits", options("1", "2 t", "2", "6 t", "3", "10 t", "4", "15 t", "5", "20 t", "6", "30 t", "7", "40 t"));
        VALUES = java.util.Collections.unmodifiableMap(values);
    }

    public static String normalize(String code) {
        return code == null || code.isBlank() ? null : code.strip();
    }

    /** 展示和筛选共用归并编码；来源原值仍由桥梁响应保留。 */
    public static int typeGroup(Integer value) {
        return value != null && value >= 1 && value <= 6 ? value : 99;
    }

    public static int monitoringGroup(Integer value) {
        return value != null && (value == 1 || value == 2) ? value : 0;
    }

    public static String label(String dictionary, Object raw) {
        String code = normalize(raw == null ? null : raw.toString());
        if (code == null) return "未提供";
        return VALUES.get(dictionary).stream().filter(o -> o.code().equals(code)).map(Option::label)
                .findFirst().orElse("未识别编码（" + code + "）");
    }

    public static boolean validGrade(String raw) {
        String code = normalize(raw);
        return code != null && VALUES.get("grades").stream().anyMatch(o -> o.code().equals(code));
    }
}
