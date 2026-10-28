package com.bridgemind.bridge.controller;

import com.bridgemind.bridge.service.BridgeDictionary;
import com.bridgemind.common.ApiResponse;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/dictionaries")
public class BridgeDictionaryController {
    @GetMapping("/bridges")
    public ApiResponse<?> bridges() {
        return ApiResponse.ok(BridgeDictionary.VALUES);
    }
}
