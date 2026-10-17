package com.ai.chatbot_backend.config;

import com.ai.chatbot_backend.service.AccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;


@Component
@Slf4j
public class SessionRevocationInterceptor implements HandlerInterceptor {

    private final StringRedisTemplate redis;

    public SessionRevocationInterceptor(StringRedisTemplate redis) {
        this.redis = redis;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {

        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        HttpSession session = request.getSession(false);
        if (session == null) {
            return true;
        }

        boolean revoked = false;
        try {
            Object userId = session.getAttribute("userId");
            if (userId instanceof Number id) {
                String value = redis.opsForValue().get(AccountService.revocationKey(id.longValue()));
                revoked = value != null && session.getCreationTime() <= Long.parseLong(value);
            }
        } catch (Exception e) {
            // Never lock everybody out because Redis hiccuped.
            log.warn("Session revocation check skipped: {}", e.getMessage());
            return true;
        }

        if (!revoked) {
            return true;
        }

        try {
            session.invalidate();
        } catch (IllegalStateException ignored) {
            // already invalidated
        }

        // Login / signup / OTP endpoints must still work with a stale cookie.
        if (request.getRequestURI().contains("/api/auth/")) {
            return true;
        }

        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write("{\"success\":false,\"message\":\"Session expired. Please log in again.\"}");
        return false;
    }
}
