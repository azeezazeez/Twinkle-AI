package com.ai.chatbot_backend.dto;

import lombok.Data;

@Data
public class ChatResponse {
    private String response;
    private Long sessionId;
    private Long userMessageId;
    private String error;
}