package com.bridgemind.structure;
import com.bridgemind.bridge.model.resp.BridgeDetailResponse;
import java.util.*;
import static com.bridgemind.structure.StructureConfig.*;

public final class StructureTemplates {
    public static final List<String> ZONES = List.of("上部结构", "下部结构", "桥面系");
    public static StructureConfig defaults(BridgeDetailResponse detail) {
        var b=detail.bridge();
        boolean wanfu="10905200071".equals(b.id()) && "万福大桥".equals(b.name());
        var type=b.type();
        String girder=detail.archive()==null ? "" : detail.archive().mainGirderName();
        String shape=wanfu ? "suspension" : Objects.equals(type,3) ? "suspension" : Objects.equals(type,4) ? "stay" : Objects.equals(type,2) ? "arch" : Objects.equals(type,1) ? (girder.contains("桁架") ? "truss" : girder.contains("刚构") ? "rigid" : "girder") : "unknown";
        String upper = switch(shape) {
            case "arch" -> "主拱圈|拱上构造";
            case "truss" -> "桁架|主梁";
            case "suspension" -> wanfu ? "索塔|主缆|吊索|加劲梁|支座" : "索塔|主缆|吊索|主梁";
            case "stay" -> "索塔|斜拉索|主梁";
            case "unknown" -> "上部结构";
            default -> "主梁";
        };
        String lower=wanfu ? "索塔基础|桥墩|桥台" : shape.equals("unknown") ? "下部结构" : shape.equals("rigid") ? "桥墩|桥台|基础" : "桥墩|桥台|基础|支座";
        String deck=shape.equals("unknown") ? "桥面系" : "桥面|伸缩缝";
        var parts=new ArrayList<Part>();
        var groups=List.of(upper,lower,deck);
        for(int z=0;z<3;z++) for(String name:groups.get(z).split("\\|")) {
            String zone=ZONES.get(z), anchor=zone+":"+name;
            String id=UUID.nameUUIDFromBytes((b.id()+":"+shape+":"+anchor).getBytes(java.nio.charset.StandardCharsets.UTF_8)).toString();
            parts.add(new Part(id,zone,name,"",anchor,List.of()));
        }
        return new StructureConfig(0,shape,List.copyOf(parts));
    }
}
