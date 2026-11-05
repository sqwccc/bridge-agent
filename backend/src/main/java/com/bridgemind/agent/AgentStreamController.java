package com.bridgemind.agent;

import com.bridgemind.common.ApiResponse;
import com.bridgemind.bridge.model.req.BridgeFilter;
import com.bridgemind.work.model.WorkFilter;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.stereotype.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import tools.jackson.databind.json.JsonMapper;
import java.time.LocalDate;
import java.io.InputStream;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

@RestController
@RequestMapping("/api/v1/agent")
public class AgentStreamController {
    private final AgentClassifier classifier;
    private final AgentEvidence evidence;
    private final DifyClient dify;
    private final JsonMapper json;
    private final boolean demo;
    private final AgentMaintenanceAnswerCache answerCache;
    @Value("${MAINTENANCE_ANSWER_CACHE_SECONDS:0}")
    private int maintenanceAnswerCacheSeconds;
    @Value("${bridgemind.agent.enhanced:true}")
    private boolean enhanced = true;
    private static final org.slf4j.Logger LOG = org.slf4j.LoggerFactory.getLogger(AgentStreamController.class);
    private final Semaphore capacity=new Semaphore(2);
    private final ScheduledExecutorService heartbeat=Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon().factory());
    public AgentStreamController(AgentClassifier classifier, AgentEvidence evidence, DifyClient dify, JsonMapper json,
                                 @Value("${bridgemind.dify.data-mode:demo}") String mode) {
        this.classifier=classifier;this.evidence=evidence;this.dify=dify;this.json=json;this.answerCache=new AgentMaintenanceAnswerCache(json);
        if(!Set.of("demo","source").contains(mode))throw new IllegalArgumentException("Invalid data mode");
        demo=mode.equals("demo");
    }
    @jakarta.annotation.PreDestroy void close(){heartbeat.shutdownNow();}
    @GetMapping("/status") public ApiResponse<?> status(){
        return ApiResponse.ok(Map.of("configured",classifier.configured()&&dify.configured(),"dataMode",demo?"demo":"source",
                "ruleAvailable",enhanced,"enhanced",enhanced,"modelConfigured",dify.configured(),"classifierConfigured",classifier.configured()));
    }
    public record Question(@NotBlank @Size(max=2000) String question, @Pattern(regexp="network|bridge") @NotNull String scope,
                           @Size(max=100) String bridgeId, BridgeFilter pageFilters, LocalDate from, LocalDate to,
                           @Size(max=64) String conversationId, @Pattern(regexp="auto|rule") String answerMode) {}
    record Turn(String question, AgentPlan plan, String answer, List<AgentEvidence.Reference> references) {}
    static final class Conversation {
        final String id=UUID.randomUUID().toString();
        final String scope;
        final AtomicBoolean busy=new AtomicBoolean();
        final List<Turn> turns=new ArrayList<>();
        AgentEvidence.Evidence lastEvidence;
        AgentPresentation.Visualization lastChart;
        Conversation(String scope){this.scope=scope;}
    }
    @SuppressWarnings("unchecked")
    private Conversation conversation(HttpSession session, Question body) {
        String scope=body.scope()+":"+Objects.toString(body.bridgeId(),"")+":"+json.writeValueAsString(body.pageFilters());
        synchronized(session){
            var conversations=(LinkedHashMap<String,Conversation>)session.getAttribute("agent-conversations");
            if(conversations==null){conversations=new LinkedHashMap<>();session.setAttribute("agent-conversations",conversations);}
            if(body.conversationId()!=null&&!body.conversationId().isBlank()){
                var c=conversations.get(body.conversationId());
                if(c==null||!c.scope.equals(scope))throw new ResponseStatusException(HttpStatus.CONFLICT,"会话范围已变更，请开启新对话");
                return c;
            }
            if(conversations.size()>=8){
                var removable=conversations.values().stream().filter(c->!c.busy.get()).findFirst();
                if(removable.isEmpty())throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"会话繁忙");
                conversations.remove(removable.get().id);
            }
            var c=new Conversation(scope);conversations.put(c.id,c);return c;
        }
    }
    @PostMapping(value="/ask",produces=MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter ask(@Valid @RequestBody Question body,HttpSession session,HttpServletResponse response){
        if(!enhanced&&(!classifier.configured()||!dify.configured()))throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"尚未配置 Dify 问题分类和回答应用");
        if(body.scope().equals("bridge")&&(body.bridgeId()==null||body.bridgeId().isBlank()))throw new IllegalArgumentException("请选择桥梁");
        if(body.scope().equals("network")&&body.bridgeId()!=null)throw new IllegalArgumentException("总体问答不能携带单桥标识");
        if(body.from()!=null&&body.to()!=null&&body.from().isAfter(body.to()))throw new IllegalArgumentException("日期范围无效");
        var conversation=conversation(session,body);
        if(!conversation.busy.compareAndSet(false,true))throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"上一条回答尚未结束");
        if(!capacity.tryAcquire()){conversation.busy.set(false);throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"当前问答繁忙，请稍后重试");}
        response.setHeader("Cache-Control","no-cache, no-transform");response.setHeader("X-Accel-Buffering","no");
        response.setCharacterEncoding(java.nio.charset.StandardCharsets.UTF_8.name());
        var emitter=new SseEmitter(480000L);
        var active=new AtomicReference<InputStream>();var stopped=new AtomicBoolean();var task=new AtomicReference<Thread>();
        Runnable cancel=()->{stopped.set(true);var input=active.getAndSet(null);try{if(input!=null)input.close();}catch(Exception ignored){}
            var t=task.get();if(t!=null&&t!=Thread.currentThread())t.interrupt();};
        emitter.onCompletion(cancel);emitter.onTimeout(cancel);emitter.onError(e->cancel.run());
        var worker=Thread.ofVirtual().unstarted(()->{
            ScheduledFuture<?> pulse=null;
            long started=System.nanoTime();
            String stage="classification";
            org.slf4j.MDC.put("agentRequestId",conversation.id);org.slf4j.MDC.put("agentStage",stage);
            try{
                send(emitter,"meta",Map.of("conversationId",conversation.id,"dataMode",demo?"demo":"source"));
                pulse=heartbeat.scheduleAtFixedRate(()->{try{send(emitter,"ping",Map.of());}catch(Exception e){cancel.run();}},10,10,TimeUnit.SECONDS);
                send(emitter,"status",Map.of("message","正在理解问题…"));
                var history=List.copyOf(conversation.turns);
                var cacheKey=answerCache.key(session.getId(),body);
                boolean cacheEligible=maintenanceAnswerCacheSeconds>0 && enhanced && !demo && history.isEmpty()
                        && !"rule".equals(body.answerMode()) && dify.configured() && classifier.configured();
                var cached=cacheEligible?answerCache.get(cacheKey,maintenanceAnswerCacheSeconds):null;
                if(cached!=null) {
                    var cachedData=new LinkedHashMap<>(cached.evidence().data());
                    cachedData.put("回答缓存",Map.of("生成时间",cached.generatedAt().toString(),"有效秒数",Math.min(maintenanceAnswerCacheSeconds,1800)));
                    var cachedPack=new AgentEvidence.Evidence(cachedData,cached.evidence().references());
                    send(emitter,"plan",cached.plan());
                    send(emitter,"evidence",cachedPack);
                    if(cached.chart()!=null)send(emitter,"visualization",cached.chart());
                    send(emitter,"source",Map.of("engine","model","message","Dify 模型回答（临时缓存，复用原回答与资料）"));
                    send(emitter,"delta",Map.of("text",cached.text()));
                    conversation.turns.add(new Turn(body.question(),cached.plan(),cached.text().substring(0,Math.min(2000,cached.text().length())),cachedPack.references()));
                    conversation.lastEvidence=cachedPack;conversation.lastChart=cached.chart();
                    send(emitter,"done",Map.of());
                    return;
                }
                var previous=history.isEmpty()?null:history.getLast().plan();
                boolean follow=enhanced&&AgentRules.explanation(body.question())&&previous!=null;
                boolean rule=enhanced&&("rule".equals(body.answerMode())||!dify.configured());
                AgentPlan plan;
                boolean overviewShortcut=enhanced && body.question().strip().matches("(?:整体数据情况|总体数据情况|整体数据概况|数据总体情况|数据概览|数据整体情况)[？?。！!]*");
                if(overviewShortcut){
                    rule=true;plan=AgentRules.classify(body.question(),body.scope(),previous);
                    LOG.info("agent shortcut requestId={} topic=data_overview classifierSkipped=true answer=compact_rule",conversation.id);
                }
                else if(follow)plan=previous;
                else if(rule||enhanced&&!classifier.configured()){
                    rule=true;plan=AgentRules.classify(body.question(),body.scope(),previous);
                }else try{
                    plan=classifier.classify(body.question(),body.scope(),body.pageFilters()==null?Map.of():body.pageFilters(),history,conversation.id);
                }catch(Exception classificationFailure){
                    if(stopped.get()||Thread.currentThread().isInterrupted())return;
                    if(!enhanced)throw classificationFailure;
                    logFailure(conversation.id,"classification-fallback",classificationFailure);
                    rule=true;plan=AgentRules.classify(body.question(),body.scope(),previous);
                }
                if(stopped.get())return;
                stage="planning";org.slf4j.MDC.put("agentStage",stage);
                plan=effectivePlan(plan,body);
                if(!enhanced&&plan.monitoring()!=null)plan=AgentRules.clarify("监测分析增强功能尚未启用。");
                send(emitter,"plan",plan);
                String direct=switch(plan.route()){
                    case "greeting_help" -> "你好，我可以查询总体分布、单桥档案、巡检、病害、维修、历史报警、报告目录和监测数据。规则模式可用快捷问题，或在单桥输入“设备 编码，趋势”“设备 编码1、编码2，相关性”，可追加“，2026-10-01T00:00至2026-10-02T00:00”。可追问“为什么”“一句话”；未指定监测时间时查询最近24小时。";
                    case "out_of_scope" -> "我主要帮助查询和分析桥梁资料，暂不处理这个问题。你可以问“接入桥梁概况”，或选择一座桥查看病害和维修记录。";
                    case "unsupported" -> "当前资料不足以支持这项判断。我可以提供来源评价等级、历史病害与维修、历史报警或报告目录；不能据此推断实时安全、寿命、风险排名或预算金额。";
                    case "clarification_required" -> plan.clarification()==null?"请补充桥梁范围、业务类型或日期；比较和排名请明确指标。":plan.clarification();
                    default -> null;
                };
                List<AgentEvidence.Reference> refs=List.of();
                var answer=new StringBuilder();
                AgentEvidence.Evidence pack=null;
                AgentPresentation.Visualization chart=null;
                if(direct!=null){answer.append(direct);send(emitter,"delta",Map.of("text",direct));}
                else{
                    Object context;
                    if(plan.route().equals("domain_knowledge"))context=Map.of("知识范围","BCI为完好状况评价，BSI为结构状况评价，当前来源为独立等级不是数值分数。Ⅰ类养护用合格/不合格，Ⅱ～Ⅴ类用A～E，类别冲突、缺失、未知编码需单列。设备存在不等于在线，历史报警不等于当前异常。仅解释这些知识与业务字典，其他知识明确资料未提供。",
                            "字典",com.bridgemind.work.service.WorkDictionary.all());
                    else{
                        stage="evidence";org.slf4j.MDC.put("agentStage",stage);
                        LOG.info("agent evidence start requestId={} topic={} scope={} reused={}",conversation.id,plan.topic(),body.bridgeId()==null?"network":"bridge",follow&&conversation.lastEvidence!=null);
                        send(emitter,"status",Map.of("message","正在查询桥梁资料…"));
                        long queryStarted=System.nanoTime();
                        pack=follow&&conversation.lastEvidence!=null?conversation.lastEvidence:evidence.build(plan,body.bridgeId(),demo);
                        context=enhanced?AgentPresentation.modelEvidence(pack,json):pack.data();refs=pack.references();
                        if(stopped.get())return;
                        send(emitter,"evidence",pack);
                        if(enhanced){
                            chart=follow?conversation.lastChart:AgentPresentation.chart(pack,body.question(),json);
                            if(chart!=null)send(emitter,"visualization",chart);
                        }
                        LOG.info("agent evidence durationMs={}",TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-queryStarted));
                    }
                    stage="generation";org.slf4j.MDC.put("agentStage",stage);
                    send(emitter,"status",Map.of("message","正在生成回答…"));
                    String fallback=pack==null?"**结论**：BCI为完好状况评价，BSI为结构状况评价；Ⅰ类合格/不合格与Ⅱ～Ⅴ类A～E分别解释。等级不能折算健康分，设备存在不等于在线。":
                            AgentPresentation.answer(pack,body.question(),chart,json);
                    var modelContext=new LinkedHashMap<String,Object>();modelContext.put("本轮证据",context);
                    modelContext.put("最近三轮上下文",history);modelContext.put("回答格式","一句结论、2至4条依据、数据限制、必要建议；只引用本轮证据中的数值，历史答案仅用于理解追问。图表由后端提供，不输出chart指令。");
                    String serialized=json.writeValueAsString(enhanced?modelContext:context);
                    if(enhanced&&serialized.length()>60000){rule=true;send(emitter,"status",Map.of("message","资料较多，使用规则回答；完整证据可展开查看。"));}
                    if(!rule){
                        try{
                            send(emitter,"source",Map.of("engine","model","message","Dify 模型回答"));
                            dify.stream(body.question(),serialized,conversation.id,(event,text)->{
                                if(stopped.get()||Thread.currentThread().isInterrupted())throw new IllegalStateException("已停止");
                                if(event.equals("replace"))answer.setLength(0);answer.append(text);
                                if(answer.length()>60000)throw new IllegalStateException("回答过长");
                                send(emitter,event,Map.of("text",text));
                            },active);
                        }catch(Exception generationFailure){
                            if(stopped.get()||Thread.currentThread().isInterrupted())return;
                            if(!enhanced)throw generationFailure;
                            rule=true;logFailure(conversation.id,"generation-fallback",generationFailure);
                        }
                    }
                    if(rule){
                        if(stopped.get()||Thread.currentThread().isInterrupted())return;
                        answer.setLength(0);answer.append(fallback);
                        send(emitter,"source",Map.of("engine","rule","message",overviewShortcut?"简版概览（本轮数据库统计，固定格式回答）":"规则回答（使用本轮查询与计算；自动模式下模型不可用时降级）"));
                        send(emitter,"replace",Map.of("text",fallback));
                    }
                }
                if(!stopped.get()){
                    conversation.turns.add(new Turn(body.question(),plan,answer.substring(0,Math.min(2000,answer.length())),refs));
                    conversation.lastEvidence=pack;conversation.lastChart=chart;
                    while(conversation.turns.size()>3)conversation.turns.removeFirst();
                    send(emitter,"done",Map.of());
                    if(cacheEligible && !rule && direct==null)
                        answerCache.put(cacheKey,plan,pack,chart,answer.toString());
                }
            }catch(Exception e){
                if(!stopped.get()){
                    logFailure(conversation.id,stage,e);
                    String message=switch(stage){
                        case "classification" -> "问题分类服务调用失败，请检查 Dify 分类应用连接、密钥和模型配置。";
                        case "planning" -> "问题分类结果无法生成查询计划，请检查分类应用输出配置。";
                        case "evidence" -> "桥梁资料查询失败，回答未完成，请检查后端数据查询日志。";
                        default -> "回答生成失败，请检查 Dify 回答应用连接和模型配置。";
                    };
                    try{send(emitter,"error",Map.of("message",message,"stage",stage,"requestId",conversation.id));}catch(Exception ignored){}
                }
            }finally{LOG.info("agent request requestId={} durationMs={}",conversation.id,TimeUnit.NANOSECONDS.toMillis(System.nanoTime()-started));if(pulse!=null)pulse.cancel(false);cancel.run();conversation.busy.set(false);capacity.release();emitter.complete();org.slf4j.MDC.clear();}
        });
        task.set(worker);worker.start();return emitter;
    }
    private AgentPlan effectivePlan(AgentPlan p,Question b){
        var wf=p.workFilter();
        if(b.from()!=null||b.to()!=null)wf=new WorkFilter(b.from(),b.to(),wf.status(),wf.zone(),wf.damageType(),wf.severity(),wf.maintenanceType(),wf.q(),wf.defectCode(),wf.issuesOnly());
        var filter=p.bridgeFilter();
        if(b.scope().equals("network")&&b.pageFilters()!=null){
            var merged=(tools.jackson.databind.node.ObjectNode)json.valueToTree(b.pageFilters());
            json.valueToTree(filter).properties().forEach(e->{if(!e.getValue().isNull()&&!e.getValue().asText().isEmpty()&&!e.getKey().equals("population"))merged.set(e.getKey(),e.getValue());});
            if(filter.population().equals("normalUse"))merged.put("population","normalUse");
            filter=json.treeToValue(merged,BridgeFilter.class);
        }
        return new AgentPlan(p.route(),p.topic(),filter,wf,p.recordId(),p.level(),p.clarification(),p.monitoring());
    }
    private void send(SseEmitter emitter,String event,Object value){
        try{emitter.send(SseEmitter.event().name(event).data(json.writeValueAsString(value),new MediaType("application","json",java.nio.charset.StandardCharsets.UTF_8)));}
        catch(Exception e){throw new IllegalStateException("连接已断开");}
    }
    private void logFailure(String requestId,String stage,Exception error){
        // Do not log exception messages/bodies: upstream errors may contain credentials or queries.
        String status=error instanceof ResponseStatusException response?String.valueOf(response.getStatusCode().value()):"none";
        LOG.warn("agent failure requestId={} stage={} type={} status={} causes={}",requestId,stage,error.getClass().getSimpleName(),status,com.bridgemind.diagnostics.QueryTrace.failure(error));
    }
}
