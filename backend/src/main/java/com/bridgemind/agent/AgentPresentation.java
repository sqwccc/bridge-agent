package com.bridgemind.agent;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;

/** Builds one chart and a deterministic answer from the same immutable evidence. */
public final class AgentPresentation {
    private AgentPresentation() {}
    public record Series(String key,String label,String unit) {}
    public record Visualization(String type,String title,String scope,String period,String source,
                                boolean truncated,List<Series> series,List<Map<String,Object>> rows,List<AgentEvidence.Reference> references) {}
    private static String text(JsonNode n,String key){return n.path(key).asText("");}
    private static Map<String,Object> row(String name,Object value){return Map.of("name",name,"value",value);}
    public static Visualization chart(AgentEvidence.Evidence evidence,String question,JsonMapper json){
        var root=json.valueToTree(evidence.data());
        var monitor=root.path("监测分析");
        String scope=text(root,"范围说明"),period="当前档案快照；业务日期见查询条件",source="本次后端全量统计";
        var rows=new ArrayList<Map<String,Object>>();var series=new ArrayList<Series>();String title="",type="bar";
        if(!monitor.isMissingNode()){
            if(!text(monitor,"status").equals("available"))return null;
            scope="桥梁 "+text(monitor,"bridgeId");period=text(monitor,"from")+" 至 "+text(monitor,"to")+"（Asia/Shanghai）";source=text(monitor,"source");
            var channels=monitor.path("channels");String analysis=text(monitor,"analysis");
            if(analysis.equals("correlation")){
                var correlation=monitor.path("correlation");if(!text(correlation,"status").equals("available"))return null;
                title="30分钟桶均值相关性（非因果）";type="scatter";
                int i=0;for(var c:channels){var p=c.path("point");series.add(new Series(i++==0?"x":"y",text(p,"deviceId"),text(p,"unit")));}
                for(var pair:correlation.path("pairs"))rows.add(Map.of("x",pair.path("x").asDouble(),"y",pair.path("y").asDouble()));
            }else if(analysis.equals("thresholds")){
                type="table";title="独立阈值区间（不自动生成报警）";
                series.add(new Series("name","来源记录",""));series.add(new Series("lower","下限",""));series.add(new Series("upper","上限",""));series.add(new Series("level","来源级别",""));
                for(var c:channels)for(var t:c.path("thresholds"))rows.add(Map.of("name",text(c.path("point"),"deviceId")+" / "+text(t,"id"),"lower",t.path("lower").isNull()?"未提供":text(t,"lower"),"upper",t.path("upper").isNull()?"未提供":text(t,"upper"),"level",text(t,"levelName")));
            }else if(analysis.equals("compare")){
                title="同指标绝对峰值对比";for(var c:channels)if(c.path("statistics").has("peak"))rows.add(row(text(c.path("point"),"deviceId"),c.path("statistics").path("peak").asDouble()));
                series.add(new Series("value","绝对峰值",text(channels.path(0).path("point"),"unit")));
            }else{
                type="line";title="监测时程（无效读数保留断点）";
                // Different units are never overlaid on a shared numeric axis.
                var first=channels.path(0);String unit=text(first.path("point"),"unit");String metric=text(first.path("point"),"metric");
                var byTime=new TreeMap<String,Map<String,Object>>();int i=0;
                for(var c:channels){var p=c.path("point");if(i>0&&(!unit.equals(text(p,"unit"))||!metric.equals(text(p,"metric"))))continue;
                    String key="v"+i++;series.add(new Series(key,text(p,"deviceId"),text(p,"unit")));
                    for(var s:c.path("samples")){String time=text(s,"time");if(time.isEmpty())continue;
                        var r=byTime.computeIfAbsent(time,k->{var v=new LinkedHashMap<String,Object>();v.put("name",k);v.put("time",java.time.LocalDateTime.parse(k).atZone(java.time.ZoneId.of("Asia/Shanghai")).toInstant().toEpochMilli());return v;});
                        // Conflicting readings at one timestamp are shown as a gap, not silently overwritten.
                        if(r.containsKey(key))r.put(key,null);else r.put(key,s.path("value").isNumber()?s.path("value").asDouble():null);
                    }
                }rows.addAll(byTime.values());
                if(channels.size()>series.size())title+="；主图仅显示首个指标，其余见统计";
                if(rows.stream().noneMatch(r->series.stream().anyMatch(s->r.get(s.key()) instanceof Number)))return null;
            }
        }else{
            var network=root.path("总体统计");
            if(!network.isMissingNode()){
                boolean bsi=question.toUpperCase(Locale.ROOT).contains("BSI"),bci=question.toUpperCase(Locale.ROOT).contains("BCI");
                if(bsi||bci){title=(bsi?"BSI":"BCI")+"等级分布（按养护类别）";
                    for(var category:network.path(bsi?"structureGradeCategories":"conditionGradeCategories")){
                        if(question.contains("Ⅱ至Ⅴ")&&!text(category,"code").equals("II_V"))continue;
                        if(text(category,"code").equals("unknown")){rows.add(row(text(category,"label"),category.path("total").asLong()));continue;}
                        for(var grade:category.path("grades"))rows.add(row(text(category,"label")+" / "+text(grade,"label"),grade.path("count").asLong()));
                    }
                }else{title="各地市接入桥梁数量";for(var city:network.path("cities"))rows.add(row(text(city,"label"),city.path("count").asLong()));}
                series.add(new Series("value","桥梁数","座"));
            }else for(String kind:List.of("defects","maintenance","patrols")){
                var group=root.path(kind);if(group.isMissingNode())continue;
                String dim=question.matches(".*(?:月|趋势|变化).*" )?"month":kind.equals("defects")?"zone":"month";
                title=(kind.equals("defects")?"病害":kind.equals("maintenance")?"维修":"巡检")+(dim.equals("month")?"月度记录数":"部位分布");
                var wf=root.path("执行条件").path("workFilter");period=(wf.path("from").isNull()?"全部历史":text(wf,"from"))+" 至 "+(wf.path("to").isNull()?"最新来源记录":text(wf,"to"));
                for(var item:group.path("全量聚合"))if(text(item,"dimension").equals(dim)){
                    String code=text(item,"code");String label=dim.equals("zone")?switch(code){case "1"->"桥面系及附属结构";case "2"->"上部结构下部结构合并";case "3"->"人行天桥及地下通道附属设施";case "99"->"其他";default->"未提供/未识别（"+code+"）";}:code.equals("missing")?"日期未提供":code;
                    rows.add(row(label,item.path("count").asLong()));
                }series.add(new Series("value","记录数","条"));break;
            }
        }
        if(rows.isEmpty())return null;
        return new Visualization(type,title,scope,period,source,false,List.copyOf(series),List.copyOf(rows),evidence.references());
    }

    public static String answer(AgentEvidence.Evidence evidence,String question,Visualization chart,JsonMapper json){
        var root=json.valueToTree(evidence.data());var lines=new ArrayList<String>();
        if(text(root,"数据模式").contains("合成"))lines.add("**合成联调样例，不代表真实桥梁。**");
        if(root.has("需要选择桥梁"))return "**需要补充条件**："+text(root,"需要选择桥梁");
        var m=root.path("监测分析");
        if(!m.isMissingNode()){
            if(!text(m,"status").equals("available"))return "**结论**："+text(m,"message")+"\n\n请查看候选测点与查询范围。";
            boolean anyReadings=false;
            for(var c:m.path("channels"))if(c.path("statistics").path("validCount").asInt()>0)anyReadings=true;
            lines.add(text(m,"analysis").equals("thresholds")?"**结论**：已读取所选通道的独立阈值区间，来源边界规则未定义，不能直接生成报警。":
                    anyReadings?"**结论**：已分析 "+m.path("channels").size()+" 路通道的历史读数；以下为数据侧结果，不代表结构安全结论。":
                            "**结论**：所选时段没有可计算的有效读数，无法据此判定正常或异常。");
            lines.add("- 时间："+text(m,"from")+" 至 "+text(m,"to")+"（Asia/Shanghai）。");
            for(var c:m.path("channels")){
                var p=c.path("point");var s=c.path("statistics");String label=text(p,"deviceId"),unit=text(p,"unit");
                if(s.isMissingNode()){lines.add("- "+label+"：来源阈值区间 "+c.path("thresholds").size()+" 条，详见阈值表。");continue;}
                if(!s.has("peak")){lines.add("- "+label+"：没有可计算的有效读数，不能判定正常或异常。");continue;}
                lines.add("- "+label+"：有效样本 "+text(s,"validCount")+"，非有效样本 "+text(s,"invalidCount")+"；范围 "+text(s,"min")+"～"+text(s,"max")+unit+"，均值 "+text(s,"mean")+unit+"，绝对峰值 "+text(s,"peak")+unit+"（"+text(s,"peakTime")+"）。");
                if(unit.isEmpty())lines.add("- 该通道单位未提供，不能跨通道进行量纲比较。");
                if(s.has("slopePerHour"))lines.add("- 真实时间拟合斜率 "+text(s,"slopePerHour")+unit+"/h，R²="+text(s,"rSquared")+"；只描述当前区间变化。");
                else lines.add("- 趋势："+text(s,"trendUnavailable")+"。");
                lines.add("- 统计异常："+(s.has("anomalyCount")?text(s,"anomalyCount")+" 个（稳健Z>3.5）":text(s,"anomalyUnavailable"))+"；重复时间记录 "+text(s,"duplicateTimes")+" 条。");
                if(c.path("thresholds").isEmpty())lines.add("- 未配置阈值，不作超限判定。");
                for(var t:c.path("thresholdComparisons"))lines.add("- 区间 "+text(t,"id")+"（"+text(t,"levelName")+"）："+(t.has("below")?"低于下限 "+text(t,"below")+"，高于上限 "+text(t,"above")+"，恰在边界 "+text(t,"onBoundary")+" 个样本；这些不是报警计数。":"上下限缺失、无效或含占位值，未参与比较。"));
            }
            if(m.has("correlation")){var c=m.path("correlation");lines.add("- 相关性：有效配对 "+text(c,"pairedCount")+" 组；"+(c.has("r")?"Pearson r="+text(c,"r")+"，相关不等于因果。":"样本不足或方差为零，不能可靠计算。"));}
            lines.add("**数据限制**："+text(m,"limitations"));
            lines.add("**建议**：核对读数、阈值配置与采集条件；需要工程判断时结合现场检查资料。");
        }else{
            lines.add(root.has("总体统计")?"**结论**：当前范围接入桥梁 "+root.path("总体统计").path("total").asText()+" 座；仅代表系统接入范围。":"**结论**：已查询当前范围的来源资料；统计不等于当前安全状态。");
            if(root.has("总体统计"))lines.add("- 当前范围接入桥梁 "+root.path("总体统计").path("total").asText()+" 座。");
            for(String kind:List.of("defects","maintenance","patrols"))for(var row:root.path(kind).path("全量聚合"))if(text(row,"dimension").equals("total"))lines.add("- "+switch(kind){case "defects"->"病害";case "maintenance"->"维修";default->"巡检";}+"记录 "+text(row,"count")+" 条；业务时间 "+text(row,"first_date")+" 至 "+text(row,"last_date")+"。");
            if(root.has("历史报警"))lines.add("- 匹配历史报警 "+root.path("历史报警").path("total").asText()+" 条；样本不是全量等级分布。");
            if(root.has("报告目录"))lines.add("- 来源报告目录 "+root.path("报告目录").path("total").asText()+" 项，未读取正文。");
            if(root.has("监测配置")){var c=root.path("监测配置");lines.add("- 测点设备组合 "+text(c,"测点设备组合数")+" 个，阈值区间 "+text(c,"阈值区间总数")+" 条；未查询读数，不判断在线状态。");}
            if(root.has("档案"))lines.add("- 已读取当前桥梁档案；请通过下方来源链接查看完整字段。");
            if(chart!=null) {lines.add("- "+chart.title()+"（"+chart.period()+"）：");for(var r:chart.rows().stream().limit(20).toList())if(r.containsKey("value"))lines.add("  - "+r.get("name")+"："+r.get("value")+chart.series().getFirst().unit());if(chart.rows().size()>20)lines.add("- 正文仅列前20组，完整分组见图表数据表。");}
            lines.add("**范围与限制**："+text(root,"范围说明")+" 未查到记录不等于没有发生；未提供检查结果不等于正常。");
            lines.add("**建议**：通过下方来源核对记录明细；可继续追问“为什么”或“一句话”。");
        }
        if(!evidence.references().isEmpty())lines.add("依据："+String.join(" ",evidence.references().stream().map(r->"["+r.id()+"]").toList()));
        String answer=String.join("\n\n",lines);
        if(question.strip().matches("一句话[？?。！!]*"))return lines.stream().filter(s->s.startsWith("**结论**")).findFirst().orElse(answer)+" 请结合本轮证据与数据限制阅读。";
        if(question.strip().matches("为什么[？?。！!]*"))return "**依据说明**：结论来自本轮后端查询与确定性计算，非模型推测。监测使用真实时间拟合、独立区间比较和30分钟桶相关性；业务数量来自全量聚合。\n\n"+answer;
        return answer;
    }

    /** Keep raw samples out of model input; charts use them only on the client. */
    public static Object modelEvidence(AgentEvidence.Evidence evidence,JsonMapper json){
        var tree=json.valueToTree(evidence.data());
        for(var c:tree.path("监测分析").path("channels"))if(c instanceof tools.jackson.databind.node.ObjectNode obj)obj.remove("samples");
        var correlation=tree.path("监测分析").path("correlation");
        if(correlation instanceof tools.jackson.databind.node.ObjectNode obj)obj.remove("pairs");
        return tree;
    }
}
