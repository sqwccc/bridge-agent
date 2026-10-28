package com.bridgemind.report.service;

import com.bridgemind.report.mapper.ReportMapper;
import com.bridgemind.report.model.entity.ReportRecord;
import com.bridgemind.report.model.resp.ReportResponse;
import com.bridgemind.bridge.service.BridgeService;

import java.net.*;
import java.net.http.*;
import java.time.Duration;
import java.util.*;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * 附件只从管理员配置的来源地址读取，禁重定向，限制响应体，避免任意地址代理。
 */
@Service
public class ReportService {
    private final ReportMapper mapper;
    private final BridgeService bridges;
    private final String baseUrl;
    private final int maxBytes;
    private final HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();

    public ReportService(ReportMapper mapper, BridgeService bridges, @Value("${bridgemind.files.base-url:}") String baseUrl, @Value("${bridgemind.files.max-bytes:20971520}") int maxBytes) {
        this.mapper = mapper;
        this.bridges = bridges;
        this.baseUrl = baseUrl;
        this.maxBytes = maxBytes;
    }

    public List<ReportResponse> list(String id) {
        var bridge = bridges.require(id);
        var records = records(id);
        var tasksWithFiles = records.stream().filter(r -> r.source().startsWith("TASK_") && !ReportAttachments.empty(r.path())).map(ReportRecord::taskId).collect(java.util.stream.Collectors.toSet());
        return records.stream().sorted(Comparator.comparing(ReportRecord::time, Comparator.nullsLast(Comparator.reverseOrder())).thenComparing(ReportRecord::id))
                .map(r -> {
                    String status = status(r);
                    String requirement = ReportAttachments.empty(r.path()) ? "MISSING" : "PRESENT";
                    String reason = switch (status) {
                        case "MISSING_ATTACHMENT" -> "有检测记录，未提供可关联附件";
                        case "SOURCE_NOT_CONFIGURED" -> "已提供附件地址，文件来源未配置";
                        case "UNSUPPORTED_SOURCE" -> "已提供附件信息，但格式或地址不支持读取";
                        default -> "已提供附件地址，读取时继续校验文件";
                    };
                    if (status.equals("MISSING_ATTACHMENT") && r.source().equals("BASE_INSPECTION") && bridge != null) {
                        var missing = bridge.missingInspectionReportStatus();
                        requirement = missing.status();
                        reason = missing.reason();
                    }
                    boolean task = r.source().equals("TASK_ATTACHMENT") || r.source().equals("TASK_FILE");
                    if (status.equals("MISSING_ATTACHMENT") && r.source().equals("REGULAR_INSPECTION"))
                        reason = tasksWithFiles.contains(r.taskId()) ? "本桥定检记录未提供独立附件；该任务的共享附件另列" : "有本桥定检记录，未提供可关联独立附件";
                    if (status.equals("MISSING_ATTACHMENT") && task) reason = "有任务附件记录，未提供文件地址";
                    String sourceLabel = switch (r.source()) {
                        case "BASE_INSPECTION" -> "桥梁底数（报告提供情况）";
                        case "PERIODIC_INSPECTION" -> "定期检测记录";
                        case "REGULAR_INSPECTION" -> "常规定检及附件信息";
                        case "BRIDGE_ATTACHMENT" -> "桥梁附件字段";
                        case "TASK_ATTACHMENT" -> "共享定检任务附件";
                        case "TASK_FILE" -> "共享任务文件";
                        default -> "来源未明确";
                    };
                    String inspectionTypeName = r.inspectionType() == null ? "来源未明确" : switch (r.inspectionType()) {
                        case 1 -> "常规定期检测";
                        case 2 -> "结构定期检测";
                        default -> "来源类型 " + r.inspectionType();
                    };
                    String extension = extension(r.path());
                    return new ReportResponse(r.id(), r.name(), r.type(), r.time(), status, extension.equals("pdf"), r.source(), sourceLabel, r.inspectionId(), r.inspectionType(), inspectionTypeName,
                            r.sourceUpdatedAt(), requirement, reason, Set.of("png", "jpg", "jpeg", "gif", "webp").contains(extension) ? "IMAGE" : r.source().equals("BRIDGE_ATTACHMENT") || task ? "ATTACHMENT" : "REPORT",
                            task ? "TASK" : "BRIDGE", r.taskId(), r.relatedBridgeCount());
                }).toList();
    }

    private List<ReportRecord> records(String id) {
        return mapper.list(id).stream().flatMap(r -> ReportAttachments.expand(r).stream()).toList();
    }

    private static String extension(String raw) {
        if (raw == null) return "";
        try {
            String path = URI.create(raw).getPath();
            return path != null && path.contains(".") ? path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT) : "";
        } catch (IllegalArgumentException e) {
            return "";
        }
    }

    private String status(ReportRecord r) {
        if (ReportAttachments.empty(r.path())) return "MISSING_ATTACHMENT";
        if (!ReportAttachments.pathSyntax(r.path())) return "UNSUPPORTED_SOURCE";
        if (baseUrl.isBlank()) return "SOURCE_NOT_CONFIGURED";
        try {
            resolveAllowed(baseUrl, r.path());
            return "AVAILABLE";
        } catch (IllegalArgumentException e) {
            return "UNSUPPORTED_SOURCE";
        }
    }

    /**
     * 业务记录附件复用报告的地址限制、文件校验及可用状态。
     */
    public List<ReportResponse> attachments(ReportRecord source) {
        if (ReportAttachments.empty(source.path())) return List.of();
        return ReportAttachments.expand(source).stream().filter(r -> !ReportAttachments.empty(r.path())).map(r -> {
            String state = status(r), ext = extension(r.path());
            return new ReportResponse(r.id(), r.name(), r.type(), r.time(), state, ext.equals("pdf"), r.source(), r.type(), r.inspectionId(), null,
                    "业务记录附件", r.sourceUpdatedAt(), "PRESENT", switch (state) {
                case "SOURCE_NOT_CONFIGURED" -> "已提供附件信息，文件来源未配置";
                case "UNSUPPORTED_SOURCE" -> "附件格式或地址不支持读取";
                default -> "已提供附件地址，读取时继续校验文件";
            }, Set.of("png", "jpg", "jpeg", "gif", "webp").contains(ext) ? "IMAGE" : "ATTACHMENT", "BRIDGE", null, null);
        }).toList();
    }

    public FileContent attachmentFile(ReportRecord source, String attachmentId) {
        var record = ReportAttachments.expand(source).stream().filter(r -> r.id().equals(attachmentId)).findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "附件不存在"));
        return readFile(record);
    }

    public record FileContent(String name, byte[] bytes, boolean pdf, String mediaType) {
    }

    private static String imageType(byte[] b) {
        if (b.length >= 8 && b[0] == (byte) 0x89 && b[1] == 'P' && b[2] == 'N' && b[3] == 'G' && b[4] == 13 && b[5] == 10 && b[6] == 26 && b[7] == 10)
            return "image/png";
        if (b.length >= 3 && b[0] == (byte) 0xff && b[1] == (byte) 0xd8 && b[2] == (byte) 0xff) return "image/jpeg";
        if (b.length >= 6 && Set.of("GIF87a", "GIF89a").contains(new String(b, 0, 6, java.nio.charset.StandardCharsets.US_ASCII)))
            return "image/gif";
        if (b.length >= 12 && new String(b, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF") && new String(b, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP"))
            return "image/webp";
        return null;
    }

    public FileContent file(String id, String reportId) {
        bridges.require(id);
        var report = records(id).stream().filter(r -> r.id().equals(reportId)).findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "报告不存在"));
        return readFile(report);
    }

    private FileContent readFile(ReportRecord report) {
        if (!status(report).equals("AVAILABLE"))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "附件缺失或来源未配置");
        try {
            var request = HttpRequest.newBuilder(resolveAllowed(baseUrl, report.path())).timeout(Duration.ofSeconds(20)).GET().build();
            var response = client.send(request, HttpResponse.BodyHandlers.ofInputStream());
            try (var stream = response.body()) {
                if (response.statusCode() != 200)
                    throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "来源附件不可访问");
                byte[] bytes = stream.readNBytes(maxBytes + 1);
                if (bytes.length > maxBytes)
                    throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "报告超过下载大小限制");
                boolean pdf = bytes.length >= 5 && new String(bytes, 0, 5, java.nio.charset.StandardCharsets.US_ASCII).equals("%PDF-");
                String image = imageType(bytes);
                if (report.path().toLowerCase(Locale.ROOT).endsWith(".pdf") && !pdf)
                    throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "来源未返回有效 PDF");
                if (Set.of("png", "jpg", "jpeg", "gif", "webp").contains(extension(report.path())) && image == null)
                    throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "来源未返回支持的图片文件");
                String path = URI.create(report.path()).getPath();
                String extension = path.contains(".") ? path.substring(path.lastIndexOf('.')) : "";
                if (!extension.matches("\\.[a-zA-Z0-9]{1,8}")) extension = "";
                return new FileContent(report.name().replaceAll("[\\r\\n\\\\/]", "_") + extension, bytes, pdf, pdf ? "application/pdf" : image != null ? image : "application/octet-stream");
            }
        } catch (java.io.IOException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "附件服务连接失败");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "附件下载中断");
        }
    }

    /**
     * 仅同源且在配置路径之下的 HTTP(S) URL 可访问；拒绝编码绕过和路径回退。
     */
    public static URI resolveAllowed(String baseUrl, String path) {
        URI base = URI.create(baseUrl.endsWith("/") ? baseUrl : baseUrl + "/");
        if (!Set.of("http", "https").contains(base.getScheme()) || base.getHost() == null || base.getUserInfo() != null)
            throw new IllegalArgumentException();
        if (path.contains("\\") || path.contains("%") || path.contains("..") || path.startsWith("//"))
            throw new IllegalArgumentException();
        URI target = base.resolve(path).normalize();
        if (!Objects.equals(base.getScheme(), target.getScheme()) || !Objects.equals(base.getHost(), target.getHost()) || base.getPort() != target.getPort() || target.getUserInfo() != null || target.getQuery() != null || target.getFragment() != null || !target.getPath().startsWith(base.getPath()))
            throw new IllegalArgumentException();
        return target;
    }
}
