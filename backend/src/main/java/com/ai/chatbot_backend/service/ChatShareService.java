package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.ChatMessage;
import com.ai.chatbot_backend.dto.SharedMessageResponse;
import com.ai.chatbot_backend.dto.ChatSession;
import com.ai.chatbot_backend.dto.SharedChat;
import com.ai.chatbot_backend.dto.SharedChatResponse;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.exception.AIServiceException;
import com.ai.chatbot_backend.repository.ChatMessageRepository;
import com.ai.chatbot_backend.repository.ChatSessionRepository;
import com.ai.chatbot_backend.repository.SharedChatRepository;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ChatShareService {

    private static final int TOKEN_BYTES = 32;

    private final SharedChatRepository sharedChatRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final ObjectMapper objectMapper;

    private final SecureRandom secureRandom = new SecureRandom();

    @Transactional
    public SharedChat createOrGetShare(Long sessionId, User user) {
        ChatSession chatSession = chatSessionRepository.findById(sessionId)
                .orElseThrow(() -> new AIServiceException("Session not found"));

        if (!user.getId().equals(chatSession.getUserId())) {
            throw new AIServiceException("You do not have access to this chat");
        }

        return sharedChatRepository.findFirstBySessionIdAndRevokedFalse(sessionId)
                .orElseGet(() -> {
                    SharedChat sharedChat = new SharedChat();
                    sharedChat.setSessionId(sessionId);
                    sharedChat.setShareToken(generateUniqueToken());
                    sharedChat.setCreatedAt(LocalDateTime.now());
                    sharedChat.setRevoked(false);
                    return sharedChatRepository.save(sharedChat);
                });
    }

    @Transactional(readOnly = true)
    public SharedChatResponse getSharedChat(String token) {
        if (token == null || token.isBlank()) {
            throw new AIServiceException("Invalid share link");
        }

        SharedChat sharedChat = sharedChatRepository
                .findByShareTokenAndRevokedFalse(token)
                .orElseThrow(() -> new AIServiceException("Shared chat not found or no longer available"));

        ChatSession session = chatSessionRepository.findById(sharedChat.getSessionId())
                .orElseThrow(() -> new AIServiceException("Shared chat not found"));

        List<ChatMessage> messages = chatMessageRepository
                .findBySessionIdOrderByTimestampAsc(session.getId());

        List<SharedMessageResponse> messageResponses = messages.stream()
                .map(this::toSharedMessage)
                .collect(Collectors.toList());

        return new SharedChatResponse(
                session.getId(),
                session.getSessionName(),
                session.getCreatedAt(),
                session.getUpdatedAt(),
                messageResponses
        );
    }


    private SharedMessageResponse toSharedMessage(ChatMessage message) {
        return new SharedMessageResponse(
                message.getId(),
                message.getSessionId(),
                message.getRole(),
                message.getContent(),
                message.getTimestamp(),
                parseAttachments(message.getAttachmentData())
        );
    }

    private List<String> parseAttachments(String attachmentData) {
        if (attachmentData == null || attachmentData.isBlank()) {
            return List.of();
        }

        try {
            return objectMapper.readValue(attachmentData, new TypeReference<List<String>>() {});
        } catch (Exception ignored) {
            return List.of();
        }
    }

    @Transactional
    public void deleteSharesForSession(Long sessionId) {
        sharedChatRepository.deleteBySessionId(sessionId);
    }

    private String generateUniqueToken() {
        String token;
        do {
            byte[] bytes = new byte[TOKEN_BYTES];
            secureRandom.nextBytes(bytes);
            token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        } while (sharedChatRepository.findByShareTokenAndRevokedFalse(token).isPresent());

        return token;
    }
}
