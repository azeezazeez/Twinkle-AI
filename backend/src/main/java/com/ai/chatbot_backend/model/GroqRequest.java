package com.ai.chatbot_backend.model;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;
import java.util.Map;

/**
 * Request model for the Groq / OpenAI-compatible chat completions API.
 *
 * Serializes to:
 * {
 *   "model":    "llama3-8b-8192",
 *   "messages": [ {"role": "user", "content": "Hello"}, ... ],
 *   "stream":   false
 * }
 */
public class GroqRequest {

    private String model;

    /**
     * Conversation history + current user message.
     * Each entry must have "role" ("system" | "user" | "assistant")
     * and "content" keys.
     */
    private List<Map<String, String>> messages;

    private boolean stream;

    // ── Constructors ────────────────────────────────────────────────────────

    public GroqRequest() {}

    public GroqRequest(String model, List<Map<String, String>> messages, boolean stream) {
        this.model    = model;
        this.messages = messages;
        this.stream   = stream;
    }

    // ── Getters & Setters ────────────────────────────────────────────────────

    @JsonProperty("model")
    public String getModel() {
        return model;
    }

    public void setModel(String model) {
        this.model = model;
    }

    @JsonProperty("messages")
    public List<Map<String, String>> getMessages() {
        return messages;
    }

    public void setMessages(List<Map<String, String>> messages) {
        this.messages = messages;
    }

    @JsonProperty("stream")
    public boolean isStream() {
        return stream;
    }

    public void setStream(boolean stream) {
        this.stream = stream;
    }
}