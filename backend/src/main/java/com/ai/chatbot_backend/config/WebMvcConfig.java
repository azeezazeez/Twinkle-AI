package com.ai.chatbot_backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final RateLimitInterceptor rateLimitInterceptor;

    private final SessionRevocationInterceptor sessionRevocationInterceptor;

    public WebMvcConfig(RateLimitInterceptor rateLimitInterceptor,
                        SessionRevocationInterceptor sessionRevocationInterceptor) {
        this.rateLimitInterceptor = rateLimitInterceptor;
        this.sessionRevocationInterceptor = sessionRevocationInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // Runs first so a revoked session ("Log out of all devices") is rejected everywhere.
        registry.addInterceptor(sessionRevocationInterceptor)
                .addPathPatterns("/api/**");

        registry.addInterceptor(rateLimitInterceptor)
                .addPathPatterns("/api/auth/**", "/api/chat/**");
    }
}
