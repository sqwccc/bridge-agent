package com.bridgemind.agent;

import java.time.*;
import java.util.*;
import java.util.regex.Pattern;
import com.bridgemind.work.model.WorkFilter;

/** Conservative grammar: an unrecognized qualifier must not silently widen a query. */
public final class AgentRules {
    private AgentRules() {}
    public static boolean explanation(String q) {
        return q.strip().matches("(?:为什么|详细(?:一点|点)?|展开|一句话|简要|简单点|有什么建议|怎么办|继续)[？?。！!]*");
    }
    public static AgentPlan clarify(String text) { return new AgentPlan("clarification_required","overview",null,null,null,null,text); }
    public static AgentPlan classify(String text, String scope, AgentPlan previous) {
        String q=text.strip().replaceAll("[？?。！!]+$", "");
        if(q.matches(".*(?:密钥|密码|SQL|忽略规则|寿命|预算|安全裁决|风险排名|健康评分).*"))
            return new AgentPlan("unsupported","overview",null,null,null,null,null);
        if(explanation(q)) return previous==null?clarify("请先查询一个业务主题，再继续追问。"):previous;
        if(q.matches("(?:你好|您好|帮助|你能做什么|使用帮助)")) return new AgentPlan("greeting_help","overview",null,null,null,null,null);
        if(q.matches("(?:BCI|BSI|BCI和BSI)(?:是什么|含义|解释)"))return new AgentPlan("domain_knowledge","overview",null,null,null,null,null);
        var switchTarget=Pattern.compile("^那(.{1,100}?)呢$").matcher(q);
        if(previous!=null&&previous.monitoring()!=null&&switchTarget.matches()){
            var m=previous.monitoring();
            if(m.analysis().equals("correlation"))return clarify("相关性分析请明确两条测点或设备。");
            return new AgentPlan("business_query","monitoring",previous.bridgeFilter(),previous.workFilter(),"","",null,
                    new MonitoringQuery(m.analysis(),List.of(switchTarget.group(1)),m.metric(),m.from(),m.to()));
        }
        // Optional, explicit business date prefix; no fuzzy names or arbitrary filter extraction.
        LocalDate from=null,to=null;
        var dates=Pattern.compile("^(?:查询)?(\\d{4}-\\d{2}-\\d{2})(?:至|到)(\\d{4}-\\d{2}-\\d{2})的?(.*)$").matcher(q);
        try{
            if(dates.matches()){from=LocalDate.parse(dates.group(1));to=LocalDate.parse(dates.group(2));q=dates.group(3);}
            else if(q.startsWith("今年")){to=LocalDate.now(ZoneId.of("Asia/Shanghai"));from=to.withDayOfYear(1);q=q.substring(2);}
            else {
                var recent=Pattern.compile("^(?:近|最近)([1-9][0-9]{0,2})天的?(.*)$").matcher(q);
                if(recent.matches()){to=LocalDate.now(ZoneId.of("Asia/Shanghai"));from=to.minusDays(Integer.parseInt(recent.group(1))-1L);q=recent.group(2);}
            }
        }catch(DateTimeException e){return clarify("日期无法识别，请使用YYYY-MM-DD至YYYY-MM-DD。");}
        String topic=switch(q){
            case "接入桥梁概况","桥梁概况","整体状态如何","各地市接入桥梁数量对比","BCI等级分布","BSI等级分布","Ⅱ至Ⅴ类桥梁的BSI等级分布" -> "overview";
            case "主要病害","病害情况","病害主要集中在哪些部位","病害部位分布","病害月度变化" -> "defects";
            case "维修情况","维修月度变化" -> "maintenance";
            case "巡检情况","巡检月度变化" -> "patrols";
            case "历史报警" -> "alarms";
            case "报告目录" -> "reports";
            case "桥梁档案" -> "archive";
            case "监测配置","测点配置","阈值配置" -> "monitoring";
            case "数据质量" -> "quality";
            default -> null;
        };
        if(topic!=null){
            if((from!=null||to!=null)&&!Set.of("patrols","defects","maintenance","alarms").contains(topic))return clarify("这个主题不支持业务日期前缀；监测分析请明确开始和结束时间。");
            try{
                var wf=new WorkFilter(from,to,null,null,null,null,null,null,null,false);
                if(topic.equals("alarms")&&from!=null&&java.time.temporal.ChronoUnit.DAYS.between(from,to)>30)return clarify("报警查询日期最多31天。");
                var filter=q.equals("Ⅱ至Ⅴ类桥梁的BSI等级分布")?new com.bridgemind.bridge.model.req.BridgeFilter(null,null,null,null,null,null,null,null,null,null,null,null,null,null,"II_V"):null;
                return new AgentPlan("business_query",topic,filter,wf,null,null,null);
            }catch(IllegalArgumentException e){return clarify("请检查开始和结束日期。");}
        }
        var metricQuestion=Pattern.compile("^(?:各测点)?(位移|变形|应变|温度|裂缝|索力|湿度|风速)(趋势|峰值对比|阈值|数据质量)$").matcher(q);
        if(metricQuestion.matches()){
            if(!scope.equals("bridge"))return clarify("请先进入单桥问答，再选择指标与测点。");
            if(from!=null)return clarify("监测分析请明确开始和结束时间，或省略时间查询最近24小时。");
            String analysis=switch(metricQuestion.group(2)){case "趋势"->"trend";case "峰值对比"->"compare";case "阈值"->"thresholds";default->"quality";};
            return new AgentPlan("business_query","monitoring",null,null,null,null,null,new MonitoringQuery(analysis,List.of(),metricQuestion.group(1),null,null));
        }
        // Rule monitoring syntax is intentionally visible in help; model handles freer language.
        var m=Pattern.compile("^(?:分析)?(?:测点|设备)\\s*([^，；]+?)[，；](概况|趋势|峰值对比|相关性|阈值|数据质量|异常点)(?:[，；](\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2})?)至(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(?::\\d{2})?))?$").matcher(q);
        if(m.matches()){
            if(!scope.equals("bridge"))return clarify("请先进入单桥问答，再选择测点或设备。");
            if(from!=null)return clarify("监测分析请使用明确的开始和结束时间，而非业务日期前缀。");
            String kind=switch(m.group(2)){case "趋势"->"trend";case "峰值对比"->"compare";case "相关性"->"correlation";case "阈值"->"thresholds";case "数据质量"->"quality";case "异常点"->"anomaly";default->"summary";};
            try{return new AgentPlan("business_query","monitoring",null,null,null,null,null,new MonitoringQuery(kind,
                    Arrays.stream(m.group(1).split("[、,]")).map(String::strip).toList(),"",
                    m.group(3)==null?null:LocalDateTime.parse(m.group(3)),m.group(4)==null?null:LocalDateTime.parse(m.group(4))));
            }catch(IllegalArgumentException|DateTimeException e){return clarify("请明确一至四个设备和不超过31天的完整时间范围。");}
        }
        return clarify("规则模式未能完整识别条件。可使用快捷问题，或在单桥输入“设备 编码，趋势”；比较用“设备 编码1、编码2，峰值对比”，可追加“，2026-10-01T00:00至2026-10-02T00:00”。复杂条件请使用页面筛选或自动模式。");
    }
}
