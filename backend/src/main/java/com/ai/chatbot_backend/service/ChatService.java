package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.ChatRequest;
import com.ai.chatbot_backend.dto.ChatResponse;

public interface ChatService {

    ChatResponse processMessage(ChatRequest request);
}
