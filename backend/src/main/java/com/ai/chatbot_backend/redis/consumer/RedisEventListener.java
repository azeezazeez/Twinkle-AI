package com.ai.chatbot_backend.redis.consumer;

import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.connection.Message;
import org.springframework.data.redis.connection.MessageListener;
import org.springframework.stereotype.Service;

@Service
@Slf4j
public class RedisEventListener implements MessageListener {

    @Override
    public void onMessage(Message message, byte[] pattern) {
        try {
            String body = new String(message.getBody());
            log.info("📨 Redis event received: {}", body);

            String[] parts = body.split(":");
            if (parts.length >= 2) {
                String eventType = parts[0];
                String email = parts[1];
                log.info("✅ Processing event - Type: {}, Email: {}", eventType, email);
            }
        } catch (Exception e) {
            log.error("❌ Error processing Redis event: {}", e.getMessage(), e);
        }
    }
}