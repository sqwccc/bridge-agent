package com.bridgemind.structure;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.monitoring.service.MonitoringService;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import java.util.*;
import static com.bridgemind.structure.StructureConfig.*;

@Service
public class StructureService {
    private final StructureRepository repository;
    private final BridgeService bridges;
    private final MonitoringService monitoring;
    public StructureService(StructureRepository repository, BridgeService bridges, MonitoringService monitoring) {
        this.repository=repository;this.bridges=bridges;this.monitoring=monitoring;
    }
    public StructureConfig get(String id) {
        bridges.requireExists(id);
        var saved=repository.load(id);
        return saved!=null ? saved : StructureTemplates.defaults(bridges.detail(id));
    }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
    public StructureConfig save(String id, StructureConfig input, String actor) {
        var current=get(id);
        if(input.version()!=current.version()) throw new ResponseStatusException(HttpStatus.CONFLICT,"配置版本已更新，请重新加载；当前草稿尚未保存");
        if(input.parts()==null || input.parts().size()>200) throw invalid("每座桥最多配置200个部件");
        var previous=new HashMap<String,Part>();current.parts().forEach(p->previous.put(p.id(),p));
        // One source lookup for the entire save, not one per part/binding.
        Set<Binding> valid=new HashSet<>();
        if(input.parts().stream().anyMatch(p->p!=null && p.bindings()!=null && !p.bindings().isEmpty()))
            monitoring.points(id).forEach(p->valid.add(new Binding(p.pointId(),p.deviceId(),p.metric())));
        var ids=new HashSet<String>();var names=new HashSet<String>();var clean=new ArrayList<Part>();
        int total=0;
        for(var part:input.parts()) {
            if(part==null || !StructureTemplates.ZONES.contains(part.zone())) throw invalid("部位无效");
            String name=part.name()==null ? "" : part.name().strip();
            String description=part.description()==null ? "" : part.description().strip();
            if(name.isEmpty() || name.length()>80 || description.length()>1000) throw invalid("部件名称为1～80字，说明最多1000字");
            if(!names.add(part.zone()+":"+name)) throw invalid("同一部位的部件名称不能重复");
            String partId=part.id()==null ? UUID.randomUUID().toString() : part.id();
            try { UUID.fromString(partId); } catch(IllegalArgumentException e) { throw invalid("部件标识无效"); }
            if(!ids.add(partId)) throw invalid("部件标识重复");
            var old=previous.get(partId);
            if(old==null && part.anchor()!=null) throw invalid("自定义部件不能创建图形关联");
            if(old!=null && (!Objects.equals(old.anchor(),part.anchor()) || (old.anchor()!=null && !old.zone().equals(part.zone())))) throw invalid("默认部件的图形关联和部位不可修改");
            if(part.bindings()==null || part.bindings().size()>500 || (total+=part.bindings().size())>2000) throw invalid("绑定数量超出限制");
            var unique=new LinkedHashSet<Binding>();
            for(var binding:part.bindings()) {
                if(binding==null || binding.pointId()==null || binding.deviceId()==null) throw invalid("测点标识不完整");
                // Preserve existing unavailable references for repair, but reject new cross-bridge or invalid references.
                if(!valid.contains(binding) && (old==null || !old.bindings().contains(binding))) throw invalid("所选设备指标不属于本桥或已失效，请重新选择");
                unique.add(binding);
            }
            clean.add(new Part(partId,part.zone(),name,description,part.anchor(),List.copyOf(unique)));
        }
        return repository.save(id,new StructureConfig(input.version(),current.shape(),List.copyOf(clean)),actor);
    }
}
