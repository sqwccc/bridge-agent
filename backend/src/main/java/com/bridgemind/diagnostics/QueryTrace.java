package com.bridgemind.diagnostics;

import org.slf4j.*;
import java.util.*;
import java.util.concurrent.Callable;
import java.util.function.Supplier;
import java.sql.SQLException;

/** Metadata-only diagnostics: never include exception messages, SQL text or parameters. */
public final class QueryTrace {
    private static final Logger LOG=LoggerFactory.getLogger(QueryTrace.class);
    private QueryTrace() {}
    public static String context(){return "requestId="+Objects.toString(MDC.get("agentRequestId"),"none")+" stage="+Objects.toString(MDC.get("agentStage"),"none")+" step="+Objects.toString(MDC.get("agentStep"),"none");}
    public static String failure(Throwable error) {
        var result=new ArrayList<String>();var seen=Collections.newSetFromMap(new IdentityHashMap<Throwable,Boolean>());var queue=new ArrayDeque<Throwable>();queue.add(error);
        while(!queue.isEmpty()&&result.size()<12){var e=queue.remove();if(!seen.add(e))continue;
            String s=e.getClass().getName();if(e instanceof SQLException sql){s+="[sqlState="+sql.getSQLState()+",vendorCode="+sql.getErrorCode()+"]";if(sql.getNextException()!=null)queue.add(sql.getNextException());}
            for(var frame:e.getStackTrace())if(frame.getClassName().startsWith("com.bridgemind.")){s+="@"+frame.getClassName()+"."+frame.getMethodName()+":"+frame.getLineNumber();break;}
            result.add(s);if(e.getCause()!=null)queue.add(e.getCause());
        }return String.join(" <- ",result);
    }
    public static <T> T query(String source,String statement,Integer timeout,Callable<T> work) throws Throwable {
        String id=UUID.randomUUID().toString();long start=System.nanoTime();
        LOG.info("query start {} queryId={} datasource={} statement={} timeoutSeconds={}",context(),id,source,statement,timeout);
        try{T value=work.call();LOG.info("query complete {} queryId={} datasource={} statement={} elapsedMs={} rows={}",context(),id,source,statement,(System.nanoTime()-start)/1000000,value instanceof Collection<?> c?c.size():-1);return value;}
        catch(Throwable e){LOG.warn("query failed {} queryId={} datasource={} statement={} elapsedMs={} causes={}",context(),id,source,statement,(System.nanoTime()-start)/1000000,failure(e));throw e;}
    }
    public static <T> T jdbc(String statement,Supplier<T> work){try{return query("APP_DB",statement,30,work::get);}catch(RuntimeException e){throw e;}catch(Error e){throw e;}catch(Throwable e){throw new IllegalStateException("QUERY_FAILED",e);}}
    public static <T> Callable<T> task(String step,Callable<T> work){var context=MDC.getCopyOfContextMap();long queued=System.nanoTime();
        return ()->{var prior=MDC.getCopyOfContextMap();if(context==null)MDC.clear();else MDC.setContextMap(context);MDC.put("agentStep",step);
            long start=System.nanoTime();LOG.info("evidence step start {} queueMs={}",context(),(start-queued)/1000000);
            try{T result=work.call();LOG.info("evidence step complete {} elapsedMs={}",context(),(System.nanoTime()-start)/1000000);return result;}
            catch(Exception e){LOG.warn("evidence step failed {} elapsedMs={} causes={}",context(),(System.nanoTime()-start)/1000000,failure(e));throw e;}
            finally{if(prior==null)MDC.clear();else MDC.setContextMap(prior);}};
    }
}
