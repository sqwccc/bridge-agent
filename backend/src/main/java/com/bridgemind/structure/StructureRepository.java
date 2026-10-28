package com.bridgemind.structure;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.stereotype.Repository;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import javax.sql.DataSource;
import java.util.*;
import static com.bridgemind.structure.StructureConfig.*;

@Repository
public class StructureRepository {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate write, read;
    public StructureRepository(@Qualifier("dataSource") DataSource ds) {
        jdbc=new JdbcTemplate(ds);
        var manager=new JdbcTransactionManager(ds);
        write=new TransactionTemplate(manager);
        read=new TransactionTemplate(manager);read.setReadOnly(true);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }
    public StructureConfig load(String bridgeId) {
        return read.execute(status -> {
            var headers=jdbc.query("SELECT version,shape FROM bm_structure_config WHERE bridge_id=?",(r,n)->new StructureConfig(r.getLong(1),r.getString(2),List.of()),bridgeId);
            if(headers.isEmpty()) return null;
            var bindings=new HashMap<String,List<Binding>>();
            jdbc.query("SELECT part_id,point_id,device_id,metric FROM bm_structure_binding WHERE bridge_id=? ORDER BY ordinal", r->{
                bindings.computeIfAbsent(r.getString(1),k->new ArrayList<>()).add(new Binding(r.getString(2),r.getString(3),r.getString(4)));
            },bridgeId);
            var parts=jdbc.query("SELECT id,zone,name,description,anchor FROM bm_structure_part WHERE bridge_id=? ORDER BY ordinal",(r,n)->
                new Part(r.getString(1),r.getString(2),r.getString(3),r.getString(4),r.getString(5),List.copyOf(bindings.getOrDefault(r.getString(1),List.of()))),bridgeId);
            return new StructureConfig(headers.getFirst().version(),headers.getFirst().shape(),List.copyOf(parts));
        });
    }
    public StructureConfig save(String bridgeId, StructureConfig config, String actor) {
        return write.execute(status -> {
            jdbc.update("INSERT INTO bm_structure_config(bridge_id,version,shape,updated_by) VALUES (?,0,?,?) ON CONFLICT DO NOTHING",bridgeId,config.shape(),actor);
            int changed=jdbc.update("UPDATE bm_structure_config SET version=version+1,updated_at=now(),updated_by=? WHERE bridge_id=? AND version=?",actor,bridgeId,config.version());
            if(changed!=1) throw new ResponseStatusException(HttpStatus.CONFLICT,"配置已被其他用户修改，请重新加载后编辑；当前草稿尚未保存");
            jdbc.update("DELETE FROM bm_structure_part WHERE bridge_id=?",bridgeId);
            var partRows=new ArrayList<Object[]>();
            var bindingRows=new ArrayList<Object[]>();
            int ordinal=0;
            for(var part:config.parts()) {
                partRows.add(new Object[]{bridgeId,part.id(),part.zone(),part.name(),part.description(),part.anchor(),ordinal++});
                int seq=0;
                for(var binding:part.bindings()) bindingRows.add(new Object[]{bridgeId,part.id(),seq++,binding.pointId(),binding.deviceId(),binding.metric()});
            }
            if(!partRows.isEmpty()) jdbc.batchUpdate("INSERT INTO bm_structure_part(bridge_id,id,zone,name,description,anchor,ordinal) VALUES (?,?,?,?,?,?,?)",partRows);
            if(!bindingRows.isEmpty()) jdbc.batchUpdate("INSERT INTO bm_structure_binding(bridge_id,part_id,ordinal,point_id,device_id,metric) VALUES (?,?,?,?,?,?)",bindingRows);
            return new StructureConfig(config.version()+1,config.shape(),config.parts());
        });
    }
}
