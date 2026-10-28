package com.bridgemind.agent;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.Map;

@Service
public class DifyClient {
    private final String baseUrl, key;
    private final JsonMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    public DifyClient(@Value("${bridgemind.dify.base-url:http://127.0.0.1:8090/v1}") String baseUrl,
                      @Value("${bridgemind.dify.api-key:}") String key, JsonMapper json) {
        this.baseUrl = baseUrl; this.key = key; this.json = json;
    }
    public boolean configured() { return !key.isBlank(); }
    public void stream(String question, String context, String user, java.util.function.BiConsumer<String, String> events,
                       java.util.concurrent.atomic.AtomicReference<java.io.InputStream> active) throws Exception {
        var payload = Map.of("inputs", Map.of("bridge_context", context), "query", question,
                "response_mode", "streaming", "user", user, "auto_generate_name", false);
        var request = HttpRequest.newBuilder(URI.create(baseUrl.replaceAll("/+$", "") + "/chat-messages"))
                .timeout(Duration.ofSeconds(120)).header("Authorization", "Bearer " + key)
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofInputStream());
        try (var input = response.body()) {
            active.set(input);
            if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
            if (response.statusCode() != 200) throw new java.io.IOException("Dify 服务调用失败");
            var reader = new java.io.BufferedReader(new java.io.InputStreamReader(input, java.nio.charset.StandardCharsets.UTF_8));
            String line; var data = new StringBuilder(); int received = 0; boolean answered = false;
            while ((line = reader.readLine()) != null) {
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                received += line.length();
                if (received > 2_000_000) throw new java.io.IOException("Dify 响应超过限制");
                if (line.startsWith("data:")) data.append(line.substring(5).stripLeading()).append('\n');
                if (!line.isEmpty() || data.isEmpty()) continue;
                var event = json.readTree(data.toString()); data.setLength(0);
                String type = event.path("event").asText();
                if (type.equals("message") || type.equals("agent_message") || type.equals("message_replace")) {
                    String token = event.path("answer").asText("");
                    if (!token.isEmpty()) { answered = true; events.accept(type.equals("message_replace") ? "replace" : "delta", token); }
                } else if (type.equals("message_end")) {
                    if (!answered) throw new java.io.IOException("Dify 未返回答案");
                    return;
                } else if (type.equals("error")) throw new java.io.IOException("Dify 生成失败");
            }
            throw new java.io.IOException("Dify 响应中断");
        } finally { active.set(null); }
    }
    public String ask(String question, String context, String user) {
        if (!configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Dify 尚未配置应用 API Key");
        var payload = Map.of("inputs", Map.of("bridge_context", context), "query", question,
                "response_mode", "blocking", "user", user, "auto_generate_name", false);
        var request = HttpRequest.newBuilder(URI.create(baseUrl.replaceAll("/+$", "") + "/chat-messages"))
                .timeout(Duration.ofSeconds(120)).header("Authorization", "Bearer " + key)
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload))).build();
        try {
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    response.statusCode() == 401 || response.statusCode() == 403 ? "Dify 应用密钥无效或权限不足" : "Dify 调用失败，请检查模型配置、额度和服务状态");
            var body = json.readTree(response.body());
            var answer = body.path("answer").asText("");
            if (answer.isBlank()) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Dify 未返回有效答案，请检查应用输出配置");
            return answer;
        } catch (HttpTimeoutException e) {
            throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "模型响应超时，请稍后重试");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "问答已中断");
        } catch (java.io.IOException | tools.jackson.core.JacksonException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Dify 服务连接或响应异常");
        }
    }
}
