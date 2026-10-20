package com.ai.chatbot_backend.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private final CsrfOriginInterceptor csrfOriginInterceptor;

    private final RateLimitInterceptor rateLimitInterceptor;

    private final SessionRevocationInterceptor sessionRevocationInterceptor;

    public WebMvcConfig(CsrfOriginInterceptor csrfOriginInterceptor,
                        RateLimitInterceptor rateLimitInterceptor,
                        SessionRevocationInterceptor sessionRevocationInterceptor) {
        this.csrfOriginInterceptor = csrfOriginInterceptor;
        this.rateLimitInterceptor = rateLimitInterceptor;
        this.sessionRevocationInterceptor = sessionRevocationInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // CSRF: reject state-changing requests that do not come from our own front end.
        registry.addInterceptor(csrfOriginInterceptor)
                .addPathPatterns("/api/**");

        // Runs next so a revoked session ("Log out of all devices") is rejected everywhere.
        registry.addInterceptor(sessionRevocationInterceptor)
                .addPathPatterns("/api/**");

        registry.addInterceptor(rateLimitInterceptor)
                .addPathPatterns("/api/auth/**", "/api/chat/**");
    }
}
