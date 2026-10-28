package com.bridgemind.report.service;

import com.bridgemind.report.model.entity.ReportRecord;

import java.util.*;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 支持来源单地址、URL 列表和 JSON 列表；不按文件名中的普通逗号盲目拆分。
 */
public final class ReportAttachments {
    private static final JsonMapper JSON = JsonMapper.builder().build();

    private ReportAttachments() {
    }

    public static boolean empty(String raw) {
        return raw == null || raw.isBlank() || raw.strip().equalsIgnoreCase("null");
    }

    public static List<ReportRecord> expand(ReportRecord r) {
        if (empty(r.path()))
            return r.source().equals("BRIDGE_ATTACHMENT") ? List.of() : List.of(r.attachment("", null, null));
        var files = new ArrayList<ReportRecord>();
        String raw = r.path().strip();
        if (raw.startsWith("[")) {
            try {
                JsonNode list = JSON.readTree(raw);
                if (!list.isArray()) return List.of(r);
                int index = 0;
                for (JsonNode file : list) {
                    String path = file.isTextual() ? file.asText() : text(file, "url", "fileUrl", "wjurldz", "path", "lj");
                    String name = file.isObject() ? text(file, "name", "fileName", "mc") : null;
                    files.add(r.attachment("~" + index++, name, path == null ? raw : path));
                }
                if (files.isEmpty() && !r.source().equals("BRIDGE_ATTACHMENT"))
                    return List.of(r.attachment("", null, null));
                return List.copyOf(files);
            } catch (RuntimeException error) {
                return List.of(r);
            }
        }
        String[] paths = raw.split(",(?=(?:https?://|/))");
        for (int i = 0; i < paths.length; i++)
            files.add(r.attachment(paths.length == 1 ? "" : "~" + i, null, paths[i].strip()));
        return List.copyOf(files);
    }

    private static String text(JsonNode node, String... keys) {
        for (String key : keys) {
            var value = node.get(key);
            if (value != null && value.isTextual() && !value.asText().isBlank()) return value.asText();
        }
        return null;
    }

    public static boolean pathSyntax(String raw) {
        if (empty(raw)) return false;
        try {
            var uri = java.net.URI.create(raw);
            if (uri.getScheme() != null && !Set.of("http", "https").contains(uri.getScheme())) return false;
            return !raw.contains("\\") && !raw.contains("[") && !raw.contains("{") && uri.getPath() != null
                    && ((uri.isAbsolute() && uri.getHost() != null) || raw.startsWith("/") || uri.getPath().matches(".*\\.[a-zA-Z0-9]{1,8}$"));
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
