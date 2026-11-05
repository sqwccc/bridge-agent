package com.bridgemind.ingest;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.core.type.TypeReference;

/** Provisional flat JSON contract; production activation requires explicit verification. */
public record MonitorMessage(String bsm,String dwbsm,String sbbsm,String jczb,BigDecimal jcz,
        LocalDateTime jccsj,LocalDateTime jcsbsj,String bz,int sbzt,String yskzjbz,String sjtbzt,LocalDateTime tbsj) {
    private static final JsonMapper JSON = new JsonMapper();
    public static MonitorMessage parse(String raw) {
        try {
            Map<String,Object> input=JSON.readValue(raw,new TypeReference<>(){});
            Map<String,Object> m=new HashMap<>();
            input.forEach((k,v)->{String key=k.toLowerCase(Locale.ROOT); if(m.containsKey(key))throw new IllegalArgumentException(); m.put(key,v);});
            String op=text(m,"sjtbzt",16,true);
            if(!Set.of("I","U","D").contains(op))throw new IllegalArgumentException();
            BigDecimal value=new BigDecimal(text(m,"jcz",128,true)).setScale(6,java.math.RoundingMode.UNNECESSARY);
            if(value.precision()>18)throw new IllegalArgumentException();
            int status=Integer.parseInt(text(m,"sbzt",1,true));
            if(status<1||status>6)throw new IllegalArgumentException();
            return new MonitorMessage(text(m,"bsm",64,true),text(m,"dwbsm",64,true),text(m,"sbbsm",64,true),
                text(m,"jczb",32,true),value,time(m,"jccjsj"),time(m,"jcsbsj"),text(m,"bz",255,false),status,
                text(m,"yskzjbz",64,true),op,time(m,"tbsj"));
        } catch(RuntimeException e) { throw new IllegalArgumentException("INVALID_MESSAGE"); }
    }
    private static String text(Map<String,Object> m,String key,int max,boolean required) {
        Object o=m.get(key); String s=o==null?null:o.toString();
        if((required&&(s==null||s.isBlank()))||(s!=null&&s.length()>max))throw new IllegalArgumentException();
        return s;
    }
    private static LocalDateTime time(Map<String,Object> m,String key) {
        var time=LocalDateTime.parse(text(m,key,40,true).replace(' ','T'));
        if(time.getNano()%1000!=0)throw new IllegalArgumentException();
        return time;
    }
}
