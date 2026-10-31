package com.bridgemind.agent;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import java.util.*;

/** Fact-backed data overview and proposed maintenance tasks. No work orders are written. */
public final class AgentFocusPresentation {
    private AgentFocusPresentation() {}
    private static String t(JsonNode n,String key){return n.path(key).isNull()||n.path(key).isMissingNode()?"未提供":n.path(key).asText();}
    private static JsonNode total(JsonNode root,String kind){
        for(var row:root.path(kind).path("全量聚合"))if(row.path("dimension").asText().equals("total"))return row;
        return root.path("__missing");
    }
    private static final List<String> ORDER=List.of("verify_severe","follow_pending","verify_closure","review_deferred","complete_status");
    private static String[] task(String code){return switch(code){
        case "verify_severe" -> new String[]{"优先核实来源严重/紧急记录","对照病害发生时间、现场现状及最新处理记录，核实是否仍需处理；确认后提交专业评估和处置审批","养护管理单位协调检测单位（建议角色）","现场复核记录、现状照片、处置意见及审批依据"};
        case "follow_pending" -> new String[]{"衔接待处理及在办事项","按构件和病害类型整理待办，核实已列计划和维修进度，避免重复安排；具体措施经现场确认后制定","养护管理单位（建议角色）","任务清单、关联病害ID、拟议措施及进度记录"};
        case "verify_closure" -> new String[]{"抽核完成及验收证据","核对来源标记完成/验收的病害是否具备对应维修、复检和验收材料；状态或编号匹配不直接视为闭环","养护与验收人员（建议角色）","维修记录、复检结果、验收凭证及可追溯关联"};
        case "review_deferred" -> new String[]{"复核暂不处理事项","核实暂不处理的原因与当前适用性，记录后续观察或复核条件","养护管理单位（建议角色）","暂缓依据、复核结论及后续跟踪条件"};
        default -> new String[]{"补齐未知处理状态","回查病害记录、责任归属和后续处理情况，更新前先核实原始资料","资料管理人员（建议角色）","核实后的状态、来源时间与关联凭证"};
    };}
    private static List<Map<String,Object>> tasks(JsonNode root){
        var result=new ArrayList<Map<String,Object>>();
        for(String code:ORDER)for(var group:root.path("养护编排").path("分组统计"))if(group.path("code").asText().equals(code)&&group.path("count").asLong()>0){
            var s=task(code);result.add(Map.of("name",s[0],"count",group.path("count").asLong(),"action",s[1],"role",s[2],"acceptance",s[3]));
        }
        if(result.isEmpty())result.add(Map.of("name","建立资料与例行检查基线","count",0,"action","当前查询范围未查到病害记录；先核对覆盖范围、最新检查资料和未录入事项，不能据此认定无需养护。","role","养护管理单位（建议角色）","acceptance","确认的数据范围、最新检查记录及待补资料清单"));
        return result;
    }
    public static AgentPresentation.Visualization chart(AgentEvidence.Evidence evidence,JsonMapper json){
        var root=json.valueToTree(evidence.data());boolean plan=root.path("重点问答").asText().equals("maintenance_plan");
        var rows=new ArrayList<Map<String,Object>>();var series=new ArrayList<AgentPresentation.Series>();
        if(plan){
            rows.addAll(tasks(root));
            series.add(new AgentPresentation.Series("name","核查顺序",""));series.add(new AgentPresentation.Series("count","来源病害数","条"));
            series.add(new AgentPresentation.Series("action","建议任务",""));series.add(new AgentPresentation.Series("role","建议负责角色",""));series.add(new AgentPresentation.Series("acceptance","完成凭证",""));
        }else{
            for(String kind:List.of("patrols","defects","maintenance")){
                var s=total(root,kind);rows.add(Map.of("name",label(kind),"count",t(s,"count"),"period",t(s,"first_date")+" 至 "+t(s,"last_date"),"note","来源记录条数，不等于桥梁数；按日期筛选"));
            }
            var c=root.path("监测数据覆盖");rows.add(Map.of("name","监测读数","count",t(c,"reading_count"),"period",t(c,"first_time")+" 至 "+t(c,"last_time"),"note","历史覆盖，不代表当前在线；可能包含非数值记录"));
            series.add(new AgentPresentation.Series("name","数据类型",""));series.add(new AgentPresentation.Series("count","数量","条"));series.add(new AgentPresentation.Series("period","实际数据起止",""));series.add(new AgentPresentation.Series("note","口径",""));
        }
        var wf=root.path("执行条件").path("workFilter");String period=wf.path("from").isNull()&&wf.path("to").isNull()?"业务及读数：全部历史；档案/配置：当前快照":t(wf,"from")+" 至 "+t(wf,"to")+"；档案/配置仍为当前快照";
        return new AgentPresentation.Visualization("table",plan?"养护工作建议清单（待复核与审批）":"整体数据情况一览",t(root,"范围说明"),period,"本次后端受控聚合；养护顺序不是风险排名",false,List.copyOf(series),List.copyOf(rows),evidence.references());
    }
    private static String label(String kind){return switch(kind){case "patrols"->"巡检";case "defects"->"病害";default->"维修";};}
    public static String answer(AgentEvidence.Evidence evidence,String question,JsonMapper json){
        var root=json.valueToTree(evidence.data());boolean plan=root.path("重点问答").asText().equals("maintenance_plan");
        var c=root.path("监测数据覆盖");var lines=new ArrayList<String>();
        lines.add(plan?"**养护方案（工作建议草案）**：根据当前查询范围内的病害、维修、巡检与监测资料，按下列顺序核实和编排；具体措施须在现场确认后审批，尚未创建任务。":
                "**整体数据情况**：当前范围覆盖 "+t(c,"scope_bridge_count")+" 座桥梁，巡检 "+t(total(root,"patrols"),"count")+" 条、病害 "+t(total(root,"defects"),"count")+" 条、维修 "+t(total(root,"maintenance"),"count")+" 条、监测读数 "+t(c,"reading_count")+" 条。");
        lines.add("**范围与时间**："+t(root,"范围说明"));
        lines.add("**数据底数与覆盖**");
        for(String kind:List.of("patrols","defects","maintenance")){var s=total(root,kind);lines.add("- "+label(kind)+"："+t(s,"count")+" 条；实际时间 "+t(s,"first_date")+" 至 "+t(s,"last_date")+"；最新来源同步 "+t(s,"latest_sync")+"。");}
        lines.add("- 监测：配置通道 "+t(c,"channel_count")+" 个；有历史读数的桥梁 "+t(c,"bridges_with_readings")+" 座、通道 "+t(c,"channels_with_readings")+" 个；读数 "+t(c,"reading_count")+" 条，实际时间 "+t(c,"first_time")+" 至 "+t(c,"last_time")+"。不能将这些数量作为当前在线数量。");
        if(plan){
            lines.add("**分阶段任务（建议）**");int i=0;
            for(var task:tasks(root))lines.add(++i+". **"+task.get("name")+"**（匹配来源病害 "+task.get("count")+" 条）："+task.get("action")+" 建议角色："+task.get("role")+"；完成凭证："+task.get("acceptance")+"。");
            var candidates=root.path("养护编排").path("核查候选");
            if(!candidates.isEmpty()){
                lines.add("**先核实这些记录**（最多5条候选，不是全部清单或风险排名）");
                for(var item:candidates)lines.add("- "+t(item,"bridgeName")+" / "+t(item,"id")+"："+t(item,"zoneName")+"，"+t(item,"damageTypeName")+"，来源程度“"+t(item,"severityName")+"”、处理状态“"+t(item,"statusName")+"”，发生时间 "+t(item,"occurredAt")+"。");
            }
            lines.add("**待补资料与闭环**：核实最新现场检查、病害与维修关联、复检及验收材料；形成任务—执行记录—复检—验收凭证的追溯链。建议角色不是已分配责任人，来源完成状态不等于本次已验证闭环。材料、工法、工期和预算未提供，不补造。");
        }else{
            lines.add("**重点缺口**");
            for(var row:root.path("patrols").path("全量聚合"))if(row.path("dimension").asText().equals("resultProvided")&&row.path("code").asText().equals("no"))lines.add("- 巡检检查结果未填写："+t(row,"count")+" 条，不能按正常处理。");
            var network=root.path("总体统计");
            for(String metric:List.of("conditionGradeCategories","structureGradeCategories"))for(var category:network.path(metric)){
                if(category.path("code").asText().equals("unknown")){lines.add("- "+(metric.startsWith("condition")?"BCI":"BSI")+"养护类别未明确："+t(category,"total")+" 座。");continue;}
                for(var grade:category.path("grades"))if(grade.path("code").asText().equals("other"))lines.add("- "+(metric.startsWith("condition")?"BCI":"BSI")+" "+t(category,"label")+"其他/缺失/冲突："+t(grade,"count")+" 座。");
            }
            lines.add("**下一步**：先核对最近一次业务和读数时间、补齐检查结果与评价资料；需要安排养护时可继续问“养护方案”。");
        }
        lines.add("**说明**："+t(root,"综合查询边界"));
        if(!evidence.references().isEmpty())lines.add("来源："+String.join(" ",evidence.references().stream().map(r->"["+r.id()+"]").toList()));
        if(question.strip().matches("一句话[？?。！!]*"))return lines.getFirst();
        return String.join("\n\n",lines);
    }
}
