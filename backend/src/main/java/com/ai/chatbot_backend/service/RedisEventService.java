package com.ai.chatbot_backend.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class RedisEventService {

    private final StringRedisTemplate redisTemplate;

    private static final String USER_EVENTS_CHANNEL = "user-events";

    public void sendUserEvent(String eventType, String email) {
        try {
            String message = eventType + ":" + email + ":" + System.currentTimeMillis();
            redisTemplate.convertAndSend(USER_EVENTS_CHANNEL, message);
            log.info("✅ Redis event sent: {}", message);
        } catch (Exception e) {
            log.error("❌ Failed to send Redis event: {}", e.getMessage(), e);
        }
    }
}