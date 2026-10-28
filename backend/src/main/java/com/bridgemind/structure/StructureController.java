package com.bridgemind.structure;
import com.bridgemind.common.ApiResponse;
import org.springframework.web.bind.annotation.*;
import java.security.Principal;
@RestController
@RequestMapping("/api/v1/bridges/{id}/structure-config")
public class StructureController {
    private final StructureService service;
    public StructureController(StructureService service) { this.service=service; }
    @GetMapping public ApiResponse<?> get(@PathVariable String id) { return ApiResponse.ok(service.get(id)); }
    @PutMapping public ApiResponse<?> save(@PathVariable String id,@RequestBody StructureConfig body,Principal user) {
        return ApiResponse.ok(service.save(id,body,user == null ? "anonymous" : user.getName()));
    }
}
