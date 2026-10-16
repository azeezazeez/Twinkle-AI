package com.ai.chatbot_backend.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatEvent {
    private Long userId;
    private Long sessionId;
    private String role;
    private String content;
    private String eventType;
    private LocalDateTime timestamp;
}