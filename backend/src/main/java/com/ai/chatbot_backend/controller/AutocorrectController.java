package com.ai.chatbot_backend.controller;

import com.ai.chatbot_backend.service.AutocorrectService;
import com.ai.chatbot_backend.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/autocorrect")
public class AutocorrectController {

    private static final int MAX_REQUESTS_PER_MINUTE = 120;

    private final AutocorrectService autocorrectService;
    private final RateLimitService rateLimitService;

    public AutocorrectController(AutocorrectService autocorrectService, RateLimitService rateLimitService) {
        this.autocorrectService = autocorrectService;
        this.rateLimitService = rateLimitService;
    }

    @PostMapping
    public ResponseEntity<?> correct(@RequestBody Map<String, String> body,
                                     HttpServletRequest request,
                                     HttpSession session) {
        String text = body == null ? null : body.get("text");
        if (text == null || text.isBlank() || text.length() > AutocorrectService.MAX_TEXT_LENGTH) {
            return ResponseEntity.badRequest().body(Map.of("error", "Invalid text."));
        }

        Object userId = session.getAttribute("userId");
        String key = "autocorrect:" + (userId != null ? "u" + userId : "ip" + clientIp(request));
        if (!rateLimitService.allow(key, MAX_REQUESTS_PER_MINUTE, Duration.ofMinutes(1))) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS)
                    .body(Map.of("error", "Too many requests."));
        }

        String corrected = autocorrectService.correct(text);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("corrected", corrected);
        response.put("changed", !corrected.equals(text));
        return ResponseEntity.ok(response);
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) return forwarded.split(",")[0].trim();
        return request.getRemoteAddr();
    }
}
