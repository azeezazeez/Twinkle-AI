package com.ai.chatbot_backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class ChatRequest {
    @NotBlank(message = "Message cannot be empty")
    @Size(max = 30000, message = "Message is too long")
    private String message;
    private Long sessionId;
    @Size(max = 120, message = "Invalid model")
    private String model;

    @Size(max = 12, message = "Invalid language")
    private String language;
 
    @Size(max = 8000, message = "Live context is too long")
    private String liveContext;

    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getLiveContext() { return liveContext; }
    public void setLiveContext(String liveContext) { this.liveContext = liveContext; }
}
