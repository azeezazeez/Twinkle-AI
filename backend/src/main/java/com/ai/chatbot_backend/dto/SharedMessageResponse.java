package com.ai.chatbot_backend.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SharedMessageResponse {
    private Long id;
    private Long sessionId;
    private String role;
    private String content;
    private LocalDateTime timestamp;
    private List<String> attachments;
}
