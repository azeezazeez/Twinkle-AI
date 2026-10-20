package com.ai.chatbot_backend.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * CSRF protection for the cookie-based session login.
 *
 * Every state-changing request (POST, PUT, PATCH, DELETE) must come from one of
 * our own front-end origins. Browsers always attach an Origin (or Referer) header
 * to cross-site requests and a malicious page cannot forge it, so a request from
 * any other site is rejected with 403 before it reaches a controller.
 *
 * Safe methods (GET, HEAD, OPTIONS) are never blocked; they must not change data.
 * Requests with no Origin and no Referer come from non-browser clients (curl,
 * server-to-server) which cannot be driven by a victim's browser, so they pass.
 */
@Component
@Slf4j
public class CsrfOriginInterceptor implements HandlerInterceptor {

    private static final Set<String> UNSAFE_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final Set<String> trustedOrigins;

    public CsrfOriginInterceptor(
            @Value("${cors.allowed-origins}") String allowedOrigins,
            @Value("${frontend.url}") String frontendUrl) {
        this.trustedOrigins = Arrays.stream((allowedOrigins + "," + frontendUrl).split(","))
                .map(CsrfOriginInterceptor::normalize)
                .filter(origin -> !origin.isEmpty())
                .collect(Collectors.toUnmodifiableSet());
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {

        if (!UNSAFE_METHODS.contains(request.getMethod().toUpperCase())) {
            return true;
        }

        String origin = request.getHeader("Origin");
        String source = (origin != null && !origin.isBlank()) ? origin : originOfReferer(request.getHeader("Referer"));

        // No browser header at all: not a cross-site browser request.
        if (source == null || source.isBlank()) {
            return true;
        }

        if (trustedOrigins.contains(normalize(source))) {
            return true;
        }

        log.warn("CSRF check rejected {} {} from untrusted origin '{}'",
                request.getMethod(), request.getRequestURI(), source);

        response.setStatus(HttpServletResponse.SC_FORBIDDEN);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setContentType("application/json");
        response.getWriter().write(
                "{\"success\":false,\"message\":\"Request blocked: untrusted origin.\"}");
        return false;
    }

    private static String originOfReferer(String referer) {
        if (referer == null || referer.isBlank()) return null;
        try {
            URI uri = URI.create(referer.trim());
            if (uri.getScheme() == null || uri.getHost() == null) return "invalid";
            return uri.getPort() == -1
                    ? uri.getScheme() + "://" + uri.getHost()
                    : uri.getScheme() + "://" + uri.getHost() + ":" + uri.getPort();
        } catch (IllegalArgumentException ex) {
            return "invalid";
        }
    }

    private static String normalize(String value) {
        if (value == null) return "";
        String v = value.trim().toLowerCase();
        while (v.endsWith("/")) v = v.substring(0, v.length() - 1);
        return v;
    }
}
