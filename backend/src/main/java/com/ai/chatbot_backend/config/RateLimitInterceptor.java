package com.ai.chatbot_backend.config;

import com.ai.chatbot_backend.service.RateLimitService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.nio.charset.StandardCharsets;
import java.time.Duration;


@Component
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimitService rateLimitService;
    private final ClientIpResolver clientIpResolver;

    public RateLimitInterceptor(RateLimitService rateLimitService, ClientIpResolver clientIpResolver) {
        this.rateLimitService = rateLimitService;
        this.clientIpResolver = clientIpResolver;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {

        String method = request.getMethod();
        if ("OPTIONS".equalsIgnoreCase(method) || "GET".equalsIgnoreCase(method) || "HEAD".equalsIgnoreCase(method)) {
            return true;
        }

        String path = request.getRequestURI();
        String ip = clientIpResolver.resolve(request);

        HttpSession session = request.getSession(false);
        Object userId = session == null ? null : session.getAttribute("userId");
        String who = userId != null ? "u" + userId : "ip" + ip;

        // Each rule: key, max, window. A request may hit more than one rule.
        if (path.endsWith("/api/auth/login")) {
            if (!check(response, "ip-login:" + ip, 20, Duration.ofMinutes(1))) return false;

        } else if (path.endsWith("/api/auth/signup")
                || path.endsWith("/api/auth/request-otp")
                || path.endsWith("/api/auth/resend-otp")
                || path.endsWith("/api/auth/forgot-password")) {
            // These send an email, so keep them tight.
            if (!check(response, "ip-mail:" + ip, 8, Duration.ofMinutes(10))) return false;

        } else if (path.endsWith("/api/auth/verify-otp") || path.endsWith("/api/auth/reset-password")) {
            if (!check(response, "ip-otp:" + ip, 30, Duration.ofMinutes(10))) return false;

        } else if (path.contains("/api/chat/")) {
            if (userId != null) {
                if (!check(response, "chat:" + who, 60, Duration.ofMinutes(1))) return false;
            } else {
                // Anonymous: much tighter per IP, plus a global ceiling so rotating IPs
                // cannot drain the AI quota.
                if (!check(response, "chat-anon:" + ip, 10, Duration.ofMinutes(1))) return false;
                if (!check(response, "chat-anon-global", 120, Duration.ofMinutes(1))) return false;
            }

        } else if (path.contains("/api/rag/")) {
            // Uploads are expensive (parsing + embeddings), questions cost model calls.
            if (path.endsWith("/api/rag/documents")) {
                if (!check(response, "rag-upload:" + who, 10, Duration.ofMinutes(10))) return false;
            } else if (path.endsWith("/api/rag/ask")) {
                if (!check(response, "rag-ask:" + who, 30, Duration.ofMinutes(1))) return false;
            } else {
                if (!check(response, "rag:" + who, 60, Duration.ofMinutes(1))) return false;
            }

        } else if (path.contains("/api/live/")) {
            // Each call mints a Gemini Live token.
            if (!check(response, "live-token:" + who, 6, Duration.ofMinutes(10))) return false;

        } else if (path.contains("/api/i18n/") || path.contains("/api/autocorrect")) {
            if (!check(response, "aux:" + who, 60, Duration.ofMinutes(1))) return false;
            if (userId == null && !check(response, "aux-anon-global", 300, Duration.ofMinutes(1))) return false;

        } else if (path.contains("/api/memory/")) {
            if (!check(response, "memory:" + who, 60, Duration.ofMinutes(1))) return false;
        }

        return true;
    }

    private boolean check(HttpServletResponse response, String key, int max, Duration window) throws Exception {
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
}
