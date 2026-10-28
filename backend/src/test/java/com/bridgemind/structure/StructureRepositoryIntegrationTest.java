package com.bridgemind.structure;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.core.io.ClassPathResource;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static com.bridgemind.structure.StructureConfig.*;

@EnabledIfSystemProperty(named="bridgemind.appIntegration",matches="true")
class StructureRepositoryIntegrationTest {
    static DriverManagerDataSource admin, data;
    static String schema="bm_structure_test_"+UUID.randomUUID().toString().replace("-","");
    static StructureRepository repository;
    @BeforeAll static void setup() throws Exception {
        var env=new HashMap<String,String>();
        for(String line:Files.readAllLines(Path.of("../.env.local"))) if(!line.isBlank()&&!line.strip().startsWith("#")&&line.contains("=")) {var p=line.split("=",2);env.put(p[0].strip(),p[1].strip().replaceAll("^[\"']|[\"']$",""));}
        admin=new DriverManagerDataSource(env.get("APP_DB_URL"),env.get("APP_DB_USER"),env.get("APP_DB_PASSWORD"));
        try(var c=admin.getConnection();var statement=c.createStatement()){statement.execute("CREATE SCHEMA "+schema);}
        data=new DriverManagerDataSource(env.get("APP_DB_URL"),env.get("APP_DB_USER"),env.get("APP_DB_PASSWORD")) {
            @Override public Connection getConnection() throws SQLException {var c=super.getConnection();c.setSchema(schema);return c;}
        };
        try(var c=data.getConnection()){ScriptUtils.executeSqlScript(c,new ClassPathResource("db/migration/V2__bridge_structure.sql"));}
        repository=new StructureRepository(data);
    }
    @AfterAll static void cleanup() throws Exception {
        if(admin!=null && schema.matches("bm_structure_test_[a-f0-9]{32}"))try(var c=admin.getConnection();var s=c.createStatement()){s.execute("DROP SCHEMA IF EXISTS "+schema+" CASCADE");}
    }
    Part part(String name){return new Part(UUID.randomUUID().toString(),"上部结构",name,"note",null,List.of(new Binding("p","d",null),new Binding("p","d","")));}
    @Test void persistsIsolatesRollsBackAndChecksConcurrentVersion() throws Exception {
        var p=part("one");var saved=repository.save("B",new StructureConfig(0,"girder",List.of(p)),"test");
        assertEquals(saved,repository.load("B"));assertNull(repository.load("OTHER"));
        assertThrows(org.springframework.dao.DataAccessException.class,()->repository.save("B",new StructureConfig(1,"girder",List.of(p,part("one"))),"test"));
        assertEquals(saved,repository.load("B")); // Deletion and version update rolled back together.
        var start=new CountDownLatch(1);
        try(var executor=Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<Boolean> update=()->{start.await();try{repository.save("B",new StructureConfig(1,"girder",List.of(p)),"test");return true;}catch(org.springframework.web.server.ResponseStatusException e){assertEquals(409,e.getStatusCode().value());return false;}};
            var a=executor.submit(update);var b=executor.submit(update);start.countDown();
            assertNotEquals(a.get(15,TimeUnit.SECONDS),b.get(15,TimeUnit.SECONDS));
        }
        assertEquals(2,repository.load("B").version());
        repository.save("B",new StructureConfig(2,"girder",List.of()),"test");
        assertTrue(repository.load("B").parts().isEmpty());
    }
}
