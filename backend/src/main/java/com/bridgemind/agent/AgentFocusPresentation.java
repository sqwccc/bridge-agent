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
    /** Proposed actions, separate from source facts and historical record status. */
    private static List<String> maintenanceAdvice(JsonNode root){
        var lines=new ArrayList<String>();
        var descriptions=new StringBuilder();
        for(var list:List.of(root.path("养护编排").path("核查候选"),root.path("defects").path("最新样本")))
            for(var item:list)for(String field:List.of("description","itemName","damageTypeName","location"))
                descriptions.append(item.path(field).asText("")).append(' ');
        String text=descriptions.toString();
        lines.add("**① 优先复核与处置准备**");
        lines.add("- 对本轮待核实病害建立专项台账，逐条记录桥梁、部位、发生时间、处理状态与现场照片；先确认历史记录对应的问题是否仍存在，再确定处置优先级。");
        if(text.matches("(?s).*(支座|伸缩缝|位移|变形).*"))
            lines.add("- 针对本轮样本涉及的支座、伸缩缝或变形问题，现场复核位移、间隙及限位构造，记录卡阻、脱空、偏位等检查结果；如具备同部位温度和位移序列，再绘制温度—位移曲线辅助复核，不直接认定温度效应或约束异常。");
        lines.add("**② 近期维修养护**");
        if(text.contains("裂缝"))
            lines.add("- 针对本轮裂缝样本，核实位置、宽度及变化记录，设置可追溯观测标志并持续复测；将稳定性、成因和修补措施适用性提交专业复核后确定方案，不仅凭宽度或扩展趋势直接选定封闭、灌浆工法。");
        if(text.matches("(?s).*(铺装|栏杆|石材|脱落|破损).*"))
            lines.add("- 针对本轮铺装、栏杆、石材或破损样本，核对松动、脱落部位及影响范围，建立修复清单；经现场确认后安排维修，完成后留存前后影像、复检结果和验收凭证。");
        lines.add("- 将核实后的待办与现有维修计划逐项关联，明确建议责任角色、计划节点与验收材料，避免重复派工；来源已完成或已验收的记录仍应抽核闭环凭证。");
        if(root.path("监测数据覆盖").path("channel_count").asLong()>0)
            lines.add("- 核查监测通道的单位、标定和阈值资料；如确认应变通道量纲异常，完成采集标定与复核后再纳入分析；如确认阈值缺失，按批准的监测方案补齐。本轮覆盖统计未给出异常或缺阈值通道数量，不能据此列出数量。");
        lines.add("**③ 常规养护与年度跟踪**");
        if(text.matches("(?s).*(主缆|吊索|索力|锚头).*"))
            lines.add("- 针对本轮涉及的缆索或锚固部位，核实防腐、锚头及除湿设施的适用性和检查记录；需要索力复核时，先取得索长、线密度、有效索频及方法适用性资料，再由专业人员复算并与批准控制值比对。");
        lines.add("- 按定检和现场复核结论安排桥面铺装、伸缩缝及适用构件的常规检查，是否更换或修复以确认后的清单为准，不预设已经需要更换。");
        lines.add("- 归档本年度病害、维修、复检和验收记录；具备可比的跨期监测数据时形成变化曲线，经审核更新构件评价资料，不能把单次快照或来源等级编码直接当作生命周期评分。");
        lines.add("以上为拟议行动，阶段不等于已批准工期；具体观测周期与完成节点由现场复核和任务审批确定。");
        return lines;
    }
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
            lines.addAll(maintenanceAdvice(root));
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
