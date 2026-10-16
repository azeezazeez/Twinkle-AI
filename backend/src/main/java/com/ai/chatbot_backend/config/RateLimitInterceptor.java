package com.ai.chatbot_backend.config;

import com.ai.chatbot_backend.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;
import java.time.Duration;

/**
 * Per-IP limits on the auth endpoints (stops OTP/email spam and password
 * guessing) and per-user limits on chat endpoints (protects the AI quota).
 */
@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimitService rateLimitService;

    public RateLimitInterceptor(RateLimitService rateLimitService) {
        this.rateLimitService = rateLimitService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {

        String method = request.getMethod();
        if ("OPTIONS".equalsIgnoreCase(method) || "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method)) {
            return true;
        }

        String path = request.getRequestURI();
        String ip = clientIp(request);

        String key;
        int max;
        Duration window;

        if (path.endsWith("/api/auth/login")) {
            key = "ip-login:" + ip;
            max = 20;
            window = Duration.ofMinutes(1);
        } else if (path.endsWith("/api/auth/signup")
                || path.endsWith("/api/auth/request-otp")
                || path.endsWith("/api/auth/resend-otp")
                || path.endsWith("/api/auth/forgot-password")) {
            // These send an email, so keep them tight.
            key = "ip-mail:" + ip;
            max = 8;
            window = Duration.ofMinutes(10);
        } else if (path.endsWith("/api/auth/verify-otp") || path.endsWith("/api/auth/reset-password")) {
            key = "ip-otp:" + ip;
            max = 30;
            window = Duration.ofMinutes(10);
        } else if (path.contains("/api/chat/")) {
            HttpSession session = request.getSession(false);
            Object userId = session == null ? null : session.getAttribute("userId");
            key = "chat:" + (userId != null ? "u" + userId : "ip" + ip);
            max = 60;
            window = Duration.ofMinutes(1);
        } else {
            return true;
        }

        if (rateLimitService.allow(key, max, window)) {
            return true;
        }

        long retryAfter = rateLimitService.retryAfterSeconds(key);
        response.setStatus(429);
        response.setHeader("Retry-After", String.valueOf(retryAfter));
        response.setContentType("application/json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(
                "{\"success\":false,\"message\":\"Too many requests. Please wait a moment and try again.\"}"
        );
        return false;
    }

    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
