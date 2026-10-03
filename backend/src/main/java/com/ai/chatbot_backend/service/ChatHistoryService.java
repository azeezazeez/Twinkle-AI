package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.ChatMessage;
import com.ai.chatbot_backend.dto.ChatSession;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.exception.AIServiceException;
import com.ai.chatbot_backend.repository.ChatMessageRepository;
import com.ai.chatbot_backend.repository.ChatSessionRepository;
import com.ai.chatbot_backend.repository.SharedChatRepository;

import lombok.RequiredArgsConstructor;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;


@Service
@RequiredArgsConstructor
public class ChatHistoryService {

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final SharedChatRepository sharedChatRepository;

    // ============================================================
    // SESSION CREATION
    // ============================================================

    @Transactional
    public ChatSession createNewSession(User user, String sessionName) {

        if (user == null || user.getId() == null) {
            throw new AIServiceException("User is required");
        }

        ChatSession session = new ChatSession();

        session.setUserId(user.getId());

        if (sessionName == null || sessionName.isBlank()) {
            session.setSessionName("New Chat");
        } else {
            session.setSessionName(sessionName.trim());
        }

        LocalDateTime now = LocalDateTime.now();

        session.setCreatedAt(now);
        session.setUpdatedAt(now);

        return chatSessionRepository.save(session);
    }

    // ============================================================
    // SESSION CHECK
    // ============================================================

    @Transactional(readOnly = true)
    public boolean sessionExistsForUser(
            Long sessionId,
            User user
    ) {

        if (sessionId == null || user == null || user.getId() == null) {
            return false;
        }

        return chatSessionRepository.existsByIdAndUserId(
                sessionId,
                user.getId()
        );
    }

    // ============================================================
    // USER SESSIONS
    // ============================================================

    @Transactional(readOnly = true)
    public List<ChatSession> getUserSessions(User user) {

        if (user == null || user.getId() == null) {
            return List.of();
        }

        return chatSessionRepository
                .findByUserIdOrderByUpdatedAtDesc(user.getId());
    }

    // ============================================================
    // SESSION MESSAGES
    // ============================================================

    @Transactional(readOnly = true)
    public List<ChatMessage> getSessionMessages(Long sessionId) {

        if (sessionId == null) {
            return List.of();
        }

        return chatMessageRepository
                .findBySessionIdOrderByTimestampAsc(sessionId);
    }

    // ============================================================
    // SAVE MESSAGE
    // ============================================================

    @Transactional
    public ChatMessage saveMessage(
            Long sessionId,
            String role,
            String content
    ) {

        return saveMessage(
                sessionId,
                role,
                content,
                null
        );
    }

    // ============================================================
    // SAVE MESSAGE WITH ATTACHMENTS
    // ============================================================

    @Transactional
    public ChatMessage saveMessage(
            Long sessionId,
            String role,
            String content,
            String attachmentData
    ) {

        if (sessionId == null) {
            throw new AIServiceException("Session ID is required");
        }

        if (!chatSessionRepository.existsById(sessionId)) {
            throw new AIServiceException("Session not found");
        }

        if (role == null || role.isBlank()) {
            throw new AIServiceException("Message role is required");
        }

        ChatMessage message = new ChatMessage();

        message.setSessionId(sessionId);
        message.setRole(role);
        message.setContent(content == null ? "" : content);
        message.setTimestamp(LocalDateTime.now());
        message.setAttachmentData(attachmentData);

        ChatMessage saved = chatMessageRepository.save(message);

        touchSession(sessionId);

        return saved;
    }

    // ============================================================
    // UPDATE SESSION TIMESTAMP
    // ============================================================

    private void touchSession(Long sessionId) {

        chatSessionRepository.findById(sessionId)
                .ifPresent(session -> {

                    session.setUpdatedAt(
                            LocalDateTime.now()
                    );

                    chatSessionRepository.save(session);
                });
    }

    // ============================================================
    // RENAME SESSION
    // ============================================================

    @Transactional
    public ChatSession renameSession(
            Long sessionId,
            String name
    ) {

        if (sessionId == null) {
            throw new AIServiceException("Session ID is required");
        }

        if (name == null || name.isBlank()) {
            throw new AIServiceException("Chat name cannot be empty");
        }

        ChatSession session =
                chatSessionRepository.findById(sessionId)
                        .orElseThrow(() ->
                                new AIServiceException(
                                        "Session not found"
                                )
                        );

        session.setSessionName(name.trim());
        session.setUpdatedAt(LocalDateTime.now());

        return chatSessionRepository.save(session);
    }

    // ============================================================
    // DELETE SESSION
    // ============================================================

    @Transactional
    public void deleteSession(Long sessionId) {

        if (sessionId == null) {
            return;
        }

        /*
         * Shared chats reference the session.
         * Delete those records first.
         */
        sharedChatRepository.deleteBySessionId(sessionId);

        /*
         * Chat messages reference the session.
         * Delete them before deleting the session.
         */
        chatMessageRepository.deleteBySessionId(sessionId);

        chatSessionRepository.deleteById(sessionId);
    }

    // ============================================================
    // DELETE ALL USER SESSIONS
    // ============================================================

    @Transactional
    public void clearUserSessions(User user) {

        if (user == null || user.getId() == null) {
            return;
        }

        List<ChatSession> sessions =
                chatSessionRepository
                        .findByUserIdOrderByUpdatedAtDesc(
                                user.getId()
                        );

        for (ChatSession session : sessions) {

            if (session.getId() == null) {
                continue;
            }

            sharedChatRepository.deleteBySessionId(
                    session.getId()
            );

            chatMessageRepository.deleteBySessionId(
                    session.getId()
            );
        }

        chatSessionRepository.deleteByUserId(
                user.getId()
        );
    }

    // ============================================================
    // LIVE TALK - SAVE TURN
    // ============================================================

    @Transactional
    public ChatSession saveLiveTurn(
            User user,
            Long sessionId,
            String userTranscript,
            String assistantTranscript
    ) {

        if (user == null || user.getId() == null) {
            throw new AIServiceException("User is required");
        }

        ChatSession session;

        if (sessionId == null) {

            session = createNewSession(
                    user,
                    "Live Talk"
            );

        } else {

            session =
                    chatSessionRepository.findById(sessionId)
                            .orElseThrow(() ->
                                    new AIServiceException(
                                            "Session not found"
                                    )
                            );

            if (!user.getId().equals(session.getUserId())) {
                throw new AIServiceException(
                        "You do not have access to this chat"
                );
            }
        }

        if (userTranscript != null
                && !userTranscript.isBlank()) {

            saveMessage(
                    session.getId(),
                    "user",
                    userTranscript.trim()
            );
        }

        if (assistantTranscript != null
                && !assistantTranscript.isBlank()) {

            saveMessage(
                    session.getId(),
                    "assistant",
                    assistantTranscript.trim()
            );
        }

        return chatSessionRepository
                .findById(session.getId())
                .orElse(session);
    }

    // ============================================================
    // LIVE TALK - SAVE COMPLETE CONVERSATION
    // ============================================================

    @Transactional
    public ChatSession saveLiveConversation(
            User user,
            String userTranscript,
            String assistantTranscript
    ) {

        return saveLiveTurn(
                user,
                null,
                userTranscript,
                assistantTranscript
        );
    }

    // ============================================================
    // PROFILE STATISTICS
    // ============================================================

    @Transactional(readOnly = true)
    public Map<String, Object> getProfileStats(User user) {

        Map<String, Object> stats = new HashMap<>();

        if (user == null || user.getId() == null) {

            stats.put("totalChats", 0);
            stats.put("totalMessages", 0);

            return stats;
        }

        List<ChatSession> sessions =
                chatSessionRepository
                        .findByUserIdOrderByUpdatedAtDesc(
                                user.getId()
                        );

        long totalMessages = 0;

        for (ChatSession session : sessions) {

            if (session.getId() == null) {
                continue;
            }

            totalMessages +=
                    chatMessageRepository
                            .findBySessionIdOrderByTimestampAsc(
                                    session.getId()
                            )
                            .size();
        }

        stats.put(
                "totalChats",
                sessions.size()
        );

        stats.put(
                "totalMessages",
                totalMessages
        );

        stats.put(
                "username",
                user.getUsername()
        );

        stats.put(
                "email",
                user.getEmail()
        );

        stats.put(
                "createdAt",
                user.getCreatedAt()
        );

        return stats;
    }
}
