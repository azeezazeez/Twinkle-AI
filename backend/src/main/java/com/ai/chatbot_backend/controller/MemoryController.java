package com.ai.chatbot_backend.controller;

import com.ai.chatbot_backend.dto.UserMemory;
import com.ai.chatbot_backend.service.MemoryService;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/memory")
public class MemoryController {

    private final MemoryService memoryService;

    public MemoryController(MemoryService memoryService) {
        this.memoryService = memoryService;
    }

    private Long currentUserId(HttpSession session) {
        Object id = session.getAttribute("userId");
        return id instanceof Long ? (Long) id : null;
    }

    private ResponseEntity<?> unauthorized() {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Please sign in to manage memory."));
    }

    private Map<String, Object> toMap(UserMemory m) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("id", m.getId());
        map.put("content", m.getContent());
        map.put("createdAt", m.getCreatedAt() == null ? null : m.getCreatedAt().toString());
        return map;
    }

    private Map<String, Object> snapshot(Long userId) {
        List<Map<String, Object>> items = new ArrayList<>();
        for (UserMemory m : memoryService.list(userId)) items.add(toMap(m));
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("enabled", memoryService.getOrCreateSettings(userId).isEnabled());
        body.put("memories", items);
        return body;
    }

    @GetMapping
    public ResponseEntity<?> get(HttpSession session) {
        Long userId = currentUserId(session);
        if (userId == null) return unauthorized();
        return ResponseEntity.ok(snapshot(userId));
    }

    @PutMapping("/settings")
    public ResponseEntity<?> setEnabled(@RequestBody Map<String, Object> body, HttpSession session) {
        Long userId = currentUserId(session);
        if (userId == null) return unauthorized();
        Object raw = body == null ? null : body.get("enabled");
        if (raw == null) {
            return ResponseEntity.badRequest().body(Map.of("error", "enabled is required."));
        }
        memoryService.setEnabled(userId, Boolean.parseBoolean(String.valueOf(raw)));
        return ResponseEntity.ok(snapshot(userId));
    }

    @PostMapping
    public ResponseEntity<?> add(@RequestBody Map<String, String> body, HttpSession session) {
        Long userId = currentUserId(session);
        if (userId == null) return unauthorized();
        String content = body == null ? null : body.get("content");
        if (content == null || content.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Memory cannot be empty."));
        }
        memoryService.add(userId, content);
        return ResponseEntity.ok(snapshot(userId));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable Long id, HttpSession session) {
        Long userId = currentUserId(session);
        if (userId == null) return unauthorized();
        if (!memoryService.delete(userId, id)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", "Memory not found."));
        }
        return ResponseEntity.ok(snapshot(userId));
    }

    @DeleteMapping
    public ResponseEntity<?> clear(HttpSession session) {
        Long userId = currentUserId(session);
        if (userId == null) return unauthorized();
        memoryService.clearAll(userId);
        return ResponseEntity.ok(snapshot(userId));
    }
}
