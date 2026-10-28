package com.bridgemind.structure;
import com.bridgemind.bridge.service.BridgeService;
import com.bridgemind.bridge.model.resp.*;
import com.bridgemind.monitoring.service.MonitoringService;
import com.bridgemind.monitoring.model.resp.MonitorPointResponse;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static com.bridgemind.structure.StructureConfig.*;

class StructureServiceTest {
    final StructureRepository repo=mock(StructureRepository.class);
    final BridgeService bridges=mock(BridgeService.class);
    final MonitoringService monitor=mock(MonitoringService.class);
    final StructureService service=new StructureService(repo,bridges,monitor);
    final String partId=UUID.randomUUID().toString();
    final Binding binding=new Binding("point","device",null);
    StructureConfig config(long version,List<Part> parts) {return new StructureConfig(version,"girder",parts);}
    Part part(String id,String name,String anchor,List<Binding> bindings){return new Part(id,"上部结构",name,"",anchor,bindings);}
    @Test void customDraftCanBeSavedUnboundWithoutSourcePointQuery() {
        when(repo.load("B")).thenReturn(config(2,List.of()));
        var body=config(2,List.of(part(partId,"自定义",null,List.of())));
        when(repo.save(eq("B"),any(),eq("user"))).thenAnswer(i->i.getArgument(1));
        assertTrue(service.save("B",body,"user").parts().getFirst().bindings().isEmpty());
        verifyNoInteractions(monitor);
    }
    @Test void sharedBindingsRenamesAndNullMetricRemainDistinct() {
        var old=part(partId,"主梁","上部结构:主梁",List.of());
        when(repo.load("B")).thenReturn(config(1,List.of(old)));
        when(monitor.points("B")).thenReturn(List.of(new MonitorPointResponse("point","p","device","d",null,null),new MonitorPointResponse("point","p","device","d","",null)));
        when(repo.save(eq("B"),any(),any())).thenAnswer(i->i.getArgument(1));
        var updated=service.save("B",config(1,List.of(part(partId,"重命名",old.anchor(),List.of(binding,new Binding("point","device",""))),part(UUID.randomUUID().toString(),"自定义",null,List.of(binding)))),"user");
        assertEquals(partId,updated.parts().getFirst().id());
        assertEquals(2,updated.parts().getFirst().bindings().size());
        verify(monitor,times(1)).points("B");
    }
    @Test void crossBridgeAndFabricatedAnchorsAreRejected() {
        when(repo.load("B")).thenReturn(config(1,List.of()));when(monitor.points("B")).thenReturn(List.of());
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.save("B",config(1,List.of(part(partId,"x",null,List.of(binding)))),"user"));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.save("B",config(1,List.of(part(partId,"x","上部结构:主梁",List.of()))),"user"));
        verify(repo,never()).save(any(),any(),any());
    }
    @Test void unavailableExistingBindingCanBeRetainedButNotCopiedToAnotherPart() {
        var old=part(partId,"主梁","上部结构:主梁",List.of(binding));
        when(repo.load("B")).thenReturn(config(1,List.of(old)));when(monitor.points("B")).thenReturn(List.of());
        when(repo.save(eq("B"),any(),any())).thenAnswer(i->i.getArgument(1));
        assertEquals(binding,service.save("B",config(1,List.of(old)),"user").parts().getFirst().bindings().getFirst());
        assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.save("B",config(1,List.of(part(UUID.randomUUID().toString(),"copy",null,List.of(binding)))),"user"));
    }
    @Test void conflictDoesNotOverwrite() {
        when(repo.load("B")).thenReturn(config(2,List.of()));
        var e=assertThrows(org.springframework.web.server.ResponseStatusException.class,()->service.save("B",config(1,List.of()),"user"));
        assertEquals(409,e.getStatusCode().value());verify(repo,never()).save(any(),any(),any());
    }
    @Test void allTemplatesAndWanfuUseStableUnboundParts() {
        for(var type:List.of(1,2,3,4,99)) for(var girder:List.of("连续箱梁","桁架梁","连续刚构")) {
            var b=mock(BridgeResponse.class);when(b.id()).thenReturn("B");when(b.name()).thenReturn("bridge");when(b.type()).thenReturn(type);
            var archive=mock(BridgeArchive.class);when(archive.mainGirderName()).thenReturn(girder);
            var detail=new BridgeDetailResponse(b,archive);var first=StructureTemplates.defaults(detail);
            assertEquals(first,StructureTemplates.defaults(detail));assertTrue(first.parts().size()>=3);
            assertTrue(first.parts().stream().allMatch(p->p.bindings().isEmpty()));
            if(type==1 && girder.contains("桁架"))assertEquals("truss",first.shape());
            if(type==1 && girder.contains("刚构"))assertEquals("rigid",first.shape());
        }
        var b=mock(BridgeResponse.class);when(b.id()).thenReturn("10905200071");when(b.name()).thenReturn("万福大桥");
        var config=StructureTemplates.defaults(new BridgeDetailResponse(b,null));
        assertEquals("suspension",config.shape());assertTrue(config.parts().stream().anyMatch(p->p.anchor().equals("上部结构:支座")));
    }
}
