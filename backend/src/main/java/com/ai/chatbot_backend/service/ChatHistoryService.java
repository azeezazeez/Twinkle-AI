package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.ChatMessage;
import com.ai.chatbot_backend.dto.ChatSession;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.exception.AIServiceException;
import com.ai.chatbot_backend.repository.ChatMessageRepository;
import com.ai.chatbot_backend.repository.ChatSessionRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatHistoryService {

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;

    // ─── Session existence check ──────────────────────────────────────────────
    // FIX: Added so ChatController can validate a session ID belongs to
    // the current user before using it — prevents the 500 "Session not found"
    // error on Android Chrome when the server restarts and old IDs are stale.
    public boolean sessionExistsForUser(Long sessionId, User user) {
        return chatSessionRepository.existsByIdAndUserId(sessionId, user.getId());
    }

    // ─── Create session ───────────────────────────────────────────────────────
    @Transactional
    public ChatSession createNewSession(User user, String sessionName) {
        ChatSession session = new ChatSession();
        session.setUserId(user.getId());
        session.setSessionName(sessionName != null ? sessionName : "New Chat");
        session.setCreatedAt(LocalDateTime.now());
        session.setUpdatedAt(LocalDateTime.now());
        return chatSessionRepository.save(session);
    }

    // ─── Rename session ───────────────────────────────────────────────────────
    @Transactional
    public ChatSession renameSession(Long sessionId, String newName) {
        ChatSession session = chatSessionRepository.findById(sessionId)
                .orElseThrow(() -> new AIServiceException(
                        "Session not found with id: " + sessionId));
        session.setSessionName(newName);
        session.setUpdatedAt(LocalDateTime.now());
        return chatSessionRepository.save(session);
    }

    // ─── Save message ─────────────────────────────────────────────────────────
    @Transactional
    public ChatMessage saveMessage(Long sessionId, String role, String content) {
        return saveMessage(sessionId, role, content, null);
    }

    @Transactional
    public ChatMessage saveMessage(
            Long sessionId, String role, String content, String attachmentData) {
        ChatSession session = chatSessionRepository.findById(sessionId)
                .orElseThrow(() -> new AIServiceException(
                        "Session not found: " + sessionId));

        ChatMessage message = new ChatMessage();
        message.setSessionId(sessionId);
        message.setRole(role);
        message.setContent(content);
        message.setTimestamp(LocalDateTime.now());
        message.setAttachmentData(attachmentData);

        ChatMessage saved = chatMessageRepository.save(message);
        session.setUpdatedAt(LocalDateTime.now());
        chatSessionRepository.save(session);
        return saved;
    }

    // ─── Get messages ─────────────────────────────────────────────────────────
    public List<ChatMessage> getSessionMessages(Long sessionId) {
        return chatMessageRepository.findBySessionIdOrderByTimestampAsc(sessionId);
    }

    // ─── Get user sessions ────────────────────────────────────────────────────
    public List<ChatSession> getUserSessions(User user) {
        return chatSessionRepository.findByUserIdOrderByUpdatedAtDesc(user.getId());
    }

    // ─── Delete session ───────────────────────────────────────────────────────
    @Transactional
    public void deleteSession(Long sessionId) {
        if (!chatSessionRepository.existsById(sessionId)) {
            log.warn("Session not found with id: {}", sessionId);
            return;
        }
        chatMessageRepository.deleteBySessionId(sessionId);
        chatSessionRepository.deleteById(sessionId);
        log.info("Deleted session: {}", sessionId);
    }

    // ─── Clear all user sessions ──────────────────────────────────────────────
    @Transactional
    public void clearUserSessions(User user) {
        List<ChatSession> sessions = chatSessionRepository
                .findByUserIdOrderByUpdatedAtDesc(user.getId());
        for (ChatSession session : sessions) {
            chatMessageRepository.deleteBySessionId(session.getId());
        }
        chatSessionRepository.deleteByUserId(user.getId());
        log.info("Cleared all sessions for user: {}", user.getUsername());
    }
}
