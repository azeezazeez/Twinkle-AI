package com.ai.chatbot_backend.dto;

public class ChatResponse {
    private String response;
    private Long sessionId;
    private Long userMessageId;
    private Long tokenCount;
    private String error;

    public String getResponse() { return response; }
    public void setResponse(String response) { this.response = response; }
    public Long getSessionId() { return sessionId; }
    public void setSessionId(Long sessionId) { this.sessionId = sessionId; }
    public Long getUserMessageId() { return userMessageId; }
    public void setUserMessageId(Long userMessageId) { this.userMessageId = userMessageId; }
    public Long getTokenCount() { return tokenCount; }
    public void setTokenCount(Long tokenCount) { this.tokenCount = tokenCount; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
}
