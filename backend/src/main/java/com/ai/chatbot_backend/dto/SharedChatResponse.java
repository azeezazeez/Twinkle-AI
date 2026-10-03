package com.ai.chatbot_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SharedChatResponse {
    private Long sessionId;
    private String sessionName;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<SharedMessageResponse> messages;
}
