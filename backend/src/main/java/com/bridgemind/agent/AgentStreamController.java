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
    private final Semaphore capacity=new Semaphore(2);
    private final ScheduledExecutorService heartbeat=Executors.newSingleThreadScheduledExecutor(Thread.ofPlatform().daemon().factory());
    public AgentStreamController(AgentClassifier classifier, AgentEvidence evidence, DifyClient dify, JsonMapper json,
                                 @Value("${bridgemind.dify.data-mode:demo}") String mode) {
        this.classifier=classifier;this.evidence=evidence;this.dify=dify;this.json=json;
        if(!Set.of("demo","source").contains(mode))throw new IllegalArgumentException("Invalid data mode");
        demo=mode.equals("demo");
    }
    @jakarta.annotation.PreDestroy void close(){heartbeat.shutdownNow();}
    @GetMapping("/status") public ApiResponse<?> status(){
        return ApiResponse.ok(Map.of("configured",classifier.configured()&&dify.configured(),"dataMode",demo?"demo":"source"));
    }
    public record Question(@NotBlank @Size(max=2000) String question, @Pattern(regexp="network|bridge") @NotNull String scope,
                           @Size(max=100) String bridgeId, BridgeFilter pageFilters, LocalDate from, LocalDate to,
                           @Size(max=64) String conversationId) {}
    static final class Conversation {
        final String id=UUID.randomUUID().toString();
        final String scope;
        final AtomicBoolean busy=new AtomicBoolean();
        final List<Object> turns=new ArrayList<>();
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
        if(!classifier.configured()||!dify.configured())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"尚未配置 Dify 问题分类和回答应用");
        if(body.scope().equals("bridge")&&(body.bridgeId()==null||body.bridgeId().isBlank()))throw new IllegalArgumentException("请选择桥梁");
        if(body.scope().equals("network")&&body.bridgeId()!=null)throw new IllegalArgumentException("总体问答不能携带单桥标识");
        if(body.from()!=null&&body.to()!=null&&body.from().isAfter(body.to()))throw new IllegalArgumentException("日期范围无效");
        var conversation=conversation(session,body);
        if(!conversation.busy.compareAndSet(false,true))throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"上一条回答尚未结束");
        if(!capacity.tryAcquire()){conversation.busy.set(false);throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"当前问答繁忙，请稍后重试");}
        response.setHeader("Cache-Control","no-cache, no-transform");response.setHeader("X-Accel-Buffering","no");
        var emitter=new SseEmitter(180000L);
        var active=new AtomicReference<InputStream>();var stopped=new AtomicBoolean();var task=new AtomicReference<Thread>();
        Runnable cancel=()->{stopped.set(true);var input=active.getAndSet(null);try{if(input!=null)input.close();}catch(Exception ignored){}
            var t=task.get();if(t!=null&&t!=Thread.currentThread())t.interrupt();};
        emitter.onCompletion(cancel);emitter.onTimeout(cancel);emitter.onError(e->cancel.run());
        var worker=Thread.ofVirtual().unstarted(()->{
            ScheduledFuture<?> pulse=null;
            try{
                send(emitter,"meta",Map.of("conversationId",conversation.id,"dataMode",demo?"demo":"source"));
                pulse=heartbeat.scheduleAtFixedRate(()->{try{send(emitter,"ping",Map.of());}catch(Exception e){cancel.run();}},10,10,TimeUnit.SECONDS);
                send(emitter,"status",Map.of("message","正在理解问题…"));
                var history=List.copyOf(conversation.turns);
                var plan=classifier.classify(body.question(),body.scope(),body.pageFilters()==null?Map.of():body.pageFilters(),history,conversation.id);
                if(stopped.get())return;
                plan=effectivePlan(plan,body);
                send(emitter,"plan",plan);
                String direct=switch(plan.route()){
                    case "greeting_help" -> "你好，我可以查询系统接入桥梁的总体分布，以及单桥档案、巡检、病害、维修、历史报警和报告目录。可以试试“接入桥梁概况”或“近一年有哪些病害”。";
                    case "out_of_scope" -> "我主要帮助查询和分析桥梁资料，暂不处理这个问题。你可以问“接入桥梁概况”，或选择一座桥查看病害和维修记录。";
                    case "unsupported" -> "当前资料不足以支持这项判断。我可以提供来源评价等级、历史病害与维修、历史报警或报告目录；不能据此推断实时安全、寿命、风险排名或预算金额。";
                    case "clarification_required" -> plan.clarification()==null?"请补充桥梁范围、业务类型或日期；比较和排名请明确指标。":plan.clarification();
                    default -> null;
                };
                List<AgentEvidence.Reference> refs=List.of();
                if(direct!=null)send(emitter,"delta",Map.of("text",direct));
                else{
                    Object context;
                    if(plan.route().equals("domain_knowledge"))context=Map.of("知识范围","BCI为完好状况评价，BSI为结构状况评价，当前来源为独立等级不是数值分数。Ⅰ类养护用合格/不合格，Ⅱ～Ⅴ类用A～E，类别冲突、缺失、未知编码需单列。设备存在不等于在线，历史报警不等于当前异常。仅解释这些知识与业务字典，其他知识明确资料未提供。",
                            "字典",com.bridgemind.work.service.WorkDictionary.all());
                    else{
                        send(emitter,"status",Map.of("message","正在查询桥梁资料…"));
                        var pack=evidence.build(plan,body.bridgeId(),demo);context=pack.data();refs=pack.references();
                        if(stopped.get())return;
                        send(emitter,"evidence",pack);
                    }
                    send(emitter,"status",Map.of("message","正在生成回答…"));
                    dify.stream(body.question(),json.writeValueAsString(context),conversation.id,(event,text)->send(emitter,event,Map.of("text",text)),active);
                }
                if(!stopped.get()){
                    conversation.turns.add(Map.of("question",body.question(),"plan",plan,"references",refs));
                    while(conversation.turns.size()>3)conversation.turns.removeFirst();
                    send(emitter,"done",Map.of());
                }
            }catch(Exception e){
                if(!stopped.get())try{send(emitter,"error",Map.of("message",e instanceof IllegalArgumentException?Objects.toString(e.getMessage(),"查询条件无效"):"查询或模型服务暂时不可用，回答未完成，请稍后重试。"));}catch(Exception ignored){}
            }finally{if(pulse!=null)pulse.cancel(false);cancel.run();conversation.busy.set(false);capacity.release();emitter.complete();}
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
        return new AgentPlan(p.route(),p.topic(),filter,wf,p.recordId(),p.level(),p.clarification());
    }
    private void send(SseEmitter emitter,String event,Object value){
        try{emitter.send(SseEmitter.event().name(event).data(json.writeValueAsString(value),MediaType.APPLICATION_JSON));}
        catch(Exception e){throw new IllegalStateException("连接已断开");}
    }
}
