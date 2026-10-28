package com.bridgemind.agent;

import com.bridgemind.common.ApiResponse;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.Semaphore;

@RestController
@RequestMapping("/api/v1/bridges/{bridgeId}/agent")
public class AgentController {
    private final AgentContext context;
    private final DifyClient dify;
    private final boolean demo;
    private final Semaphore capacity = new Semaphore(2);
    public AgentController(AgentContext context, DifyClient dify,
            @Value("${bridgemind.dify.data-mode:demo}") String mode) {
        if (!Set.of("demo", "source").contains(mode)) throw new IllegalArgumentException("DIFY_DATA_MODE must be demo or source");
        this.context = context; this.dify = dify; this.demo = mode.equals("demo");
    }
    @GetMapping("/status")
    public ApiResponse<?> status() {
        return ApiResponse.ok(Map.of("configured", dify.configured(), "dataMode", demo ? "demo" : "source"));
    }
    public record Question(@NotBlank @Size(max=2000) String question, LocalDate from, LocalDate to) {}
    @PostMapping("/ask")
    public ApiResponse<?> ask(@PathVariable String bridgeId, @Valid @RequestBody Question body, HttpSession session) {
        if (!dify.configured()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "请先配置 Dify 应用和 DeepSeek 模型");
        if (!capacity.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "当前问答繁忙，请稍后重试");
        try {
            // No client-controlled conversation id; each question gets a fresh bridge snapshot.
            String user;
            synchronized (session) {
                user = (String) session.getAttribute("agent-user");
                if (user == null) { user = UUID.randomUUID().toString(); session.setAttribute("agent-user", user); }
            }
            String data = context.build(bridgeId, demo, body.from(), body.to());
            return ApiResponse.ok(Map.of("answer", dify.ask(body.question(), data, user),
                    "dataMode", demo ? "demo" : "source", "context", data));
        } finally { capacity.release(); }
    }
}
