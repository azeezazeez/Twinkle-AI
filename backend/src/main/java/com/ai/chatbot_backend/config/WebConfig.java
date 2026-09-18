package com.ai.chatbot_backend.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

import java.util.Arrays;

@Configuration
public class WebConfig {

    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public CorsFilter corsFilter() {

        CorsConfiguration configuration = new CorsConfiguration();

        // Frontend origins
        configuration.setAllowedOrigins(Arrays.asList(
                "https://nexus-smart-ai.vercel.app",
                "https://twinkleai.vercel.app",
                "https://Twinkle-smart-ai.vercel.app",
                "http://localhost:5173",
                "http://localhost:3000",
                "http://127.0.0.1:5173"
        ));

        // HTTP methods
        configuration.setAllowedMethods(Arrays.asList(
                "GET",
                "POST",
                "PUT",
                "PATCH",
                "DELETE",
                "OPTIONS",
                "HEAD"
        ));

        // Request headers
        configuration.setAllowedHeaders(Arrays.asList(
                "Origin",
                "Accept",
                "Content-Type",
                "Authorization",
                "X-Requested-With",
                "Cache-Control",
                "Pragma"
        ));

        // Response headers exposed to browser
        configuration.setExposedHeaders(Arrays.asList(
                "Authorization",
                "Content-Type",
                "Set-Cookie"
        ));

        // Required for HttpSession cookies
        configuration.setAllowCredentials(true);

        // Cache preflight response
        configuration.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration("/**", configuration);

        return new CorsFilter(source);
    }
}
