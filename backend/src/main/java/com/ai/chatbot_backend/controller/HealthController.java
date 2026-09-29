package com.ai.chatbot_backend.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class HealthController {

    @GetMapping("/")
    public ResponseEntity<Map<String, Object>> root() {
        Map<String, Object> response = new LinkedHashMap<>();

        response.put("status", "UP");
        response.put("service", "Twinkle AI Backend");
        response.put("message", "Twinkle AI backend is running");

        return ResponseEntity.ok(response);
    }

    @GetMapping("/health")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("OK");
    }

    @GetMapping("/api/health")
    public ResponseEntity<Map<String, Object>> apiHealth() {
        Map<String, Object> response = new LinkedHashMap<>();

        response.put("status", "UP");
        response.put("service", "Twinkle AI Backend");

        return ResponseEntity.ok(response);
    }
}
