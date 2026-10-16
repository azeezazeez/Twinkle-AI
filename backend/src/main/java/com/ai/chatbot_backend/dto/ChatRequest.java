package com.ai.chatbot_backend.dto;

import jakarta.validation.constraints.NotBlank;

public class ChatRequest {
    @NotBlank(message = "Message cannot be empty")
    private String message;
    private Long sessionId;
    private String model;

    private String language;
 
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
