package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.ChatMessage;
import com.ai.chatbot_backend.dto.ChatSession;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.exception.AIServiceException;
import com.ai.chatbot_backend.repository.ChatMessageRepository;
import com.ai.chatbot_backend.repository.ChatSessionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ChatHistoryService {

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;

    @Transactional
    public ChatSession createNewSession(User user, String sessionName) {
        if (user == null || user.getId() == null) {
            throw new AIServiceException("User is required to create a chat session");
        }

        LocalDateTime now = LocalDateTime.now();

        ChatSession session = new ChatSession();
        session.setUserId(user.getId());
        session.setSessionName(
                sessionName == null || sessionName.isBlank()
                        ? "New Chat"
                        : sessionName.trim()
        );
        session.setCreatedAt(now);
        session.setUpdatedAt(now);

        return chatSessionRepository.save(session);
    }

    @Transactional(readOnly = true)
    public List<ChatSession> getUserSessions(User user) {
        if (user == null || user.getId() == null) {
            return List.of();
        }

        return chatSessionRepository.findByUserIdOrderByUpdatedAtDesc(user.getId());
    }

    @Transactional(readOnly = true)
    public boolean sessionExistsForUser(Long sessionId, User user) {
        return sessionId != null
                && user != null
                && user.getId() != null
                && chatSessionRepository.existsByIdAndUserId(
                        sessionId,
                        user.getId()
                );
    }

    @Transactional(readOnly = true)
    public List<ChatMessage> getSessionMessages(Long sessionId) {
        if (sessionId == null) {
            return List.of();
        }

        return chatMessageRepository.findBySessionIdOrderByTimestampAsc(sessionId);
    }

    @Transactional
    public ChatMessage saveMessage(
            Long sessionId,
            String role,
            String content
    ) {
        return saveMessage(sessionId, role, content, null);
    }

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

        if (role == null || role.isBlank()) {
            throw new AIServiceException("Message role is required");
        }

        ChatSession session = chatSessionRepository.findById(sessionId)
                .orElseThrow(
                        () -> new AIServiceException("Chat session not found")
                );

        ChatMessage message = new ChatMessage();

        message.setSessionId(sessionId);
        message.setRole(role.trim());
        message.setContent(content == null ? "" : content);
        message.setTimestamp(LocalDateTime.now());
        message.setAttachmentData(attachmentData);

        ChatMessage saved = chatMessageRepository.save(message);

        session.setUpdatedAt(LocalDateTime.now());
        chatSessionRepository.save(session);

        return saved;
    }

    /**
     * Persists one complete Gemini Live Talk turn and, on the first turn,
     * permanently gives the session a meaningful sidebar title.
     *
     * The title is intentionally generated here on the backend rather than
     * only in React. That makes the database the source of truth, so the name
     * survives refresh, logout/login, a collapsed sidebar, and a new browser.
     */
    @Transactional
    public ChatSession saveLiveTurn(
            User user,
            Long sessionId,
            String userTranscript,
            String assistantTranscript
    ) {
        if (user == null || user.getId() == null) {
            throw new AIServiceException("User is required to save Live Talk");
        }

        ChatSession session;

        if (sessionId == null) {
            session = createNewSession(user, "New Chat");
        } else {
            session = chatSessionRepository.findById(sessionId)
                    .orElseThrow(
                            () -> new AIServiceException(
                                    "Live Talk session not found"
                            )
                    );

            if (!user.getId().equals(session.getUserId())) {
                throw new AIServiceException(
                        "You do not have access to this Live Talk session"
                );
            }
        }

        String userText = normalizeTranscript(userTranscript);
        String assistantText = normalizeTranscript(assistantTranscript);

        if (!userText.isEmpty()) {
            ChatMessage userMessage = new ChatMessage();

            userMessage.setSessionId(session.getId());
            userMessage.setRole("user");
            userMessage.setContent(userText);
            userMessage.setTimestamp(LocalDateTime.now());

            chatMessageRepository.save(userMessage);
        }

        if (!assistantText.isEmpty()) {
            ChatMessage assistantMessage = new ChatMessage();

            assistantMessage.setSessionId(session.getId());
            assistantMessage.setRole("assistant");
            assistantMessage.setContent(assistantText);
            assistantMessage.setTimestamp(LocalDateTime.now());

            chatMessageRepository.save(assistantMessage);
        }

        // Do not leave Live Talk sessions as "New Chat"
        // or the generic "Live Talk" label.
        //
        // Only assign the title once, using the first meaningful
        // user turn.
        if (isUntitledLiveSession(session)) {
            String titleSource =
                    !userText.isEmpty()
                            ? userText
                            : assistantText;

            String liveTitle = buildLiveTalkTitle(titleSource);

            if (!liveTitle.isBlank()) {
                session.setSessionName(liveTitle);
            }
        }

        session.setUpdatedAt(LocalDateTime.now());

        return chatSessionRepository.save(session);
    }

    /**
     * Compatibility endpoint used by the older /chat/live-save API.
     * It uses the same persistent naming logic as /chat/live/turn.
     */
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

    @Transactional
    public ChatSession renameSession(
            Long sessionId,
            String name
    ) {
        if (sessionId == null) {
            throw new AIServiceException("Session ID is required");
        }

        String trimmed = name == null
                ? ""
                : name.trim();

        if (trimmed.isEmpty()) {
            throw new AIServiceException(
                    "Session name cannot be empty"
            );
        }

        ChatSession session = chatSessionRepository.findById(sessionId)
                .orElseThrow(
                        () -> new AIServiceException("Session not found")
                );

        session.setSessionName(trimmed);
        session.setUpdatedAt(LocalDateTime.now());

        return chatSessionRepository.save(session);
    }

    @Transactional
    public void deleteSession(Long sessionId) {
        if (sessionId == null) {
            return;
        }

        chatMessageRepository.deleteBySessionId(sessionId);
        chatSessionRepository.deleteById(sessionId);
    }

    @Transactional
    public void clearUserSessions(User user) {
        if (user == null || user.getId() == null) {
            return;
        }

        List<ChatSession> sessions =
                chatSessionRepository
                        .findByUserIdOrderByUpdatedAtDesc(user.getId());

        for (ChatSession session : sessions) {
            chatMessageRepository.deleteBySessionId(
                    session.getId()
            );
        }

        chatSessionRepository.deleteByUserId(user.getId());
    }

    @Transactional(readOnly = true)
    public Map<String, Object> getProfileStats(User user) {
        List<ChatSession> sessions = getUserSessions(user);

        long messageCount = sessions.stream()
                .mapToLong(
                        session ->
                                chatMessageRepository
                                        .findBySessionIdOrderByTimestampAsc(
                                                session.getId()
                                        )
                                        .size()
                )
                .sum();

        Map<String, Object> stats = new LinkedHashMap<>();

        stats.put("totalChats", sessions.size());
        stats.put("totalSessions", sessions.size());
        stats.put("totalMessages", messageCount);

        return stats;
    }

    /**
     * Determines whether a Live Talk session still has a generic title.
     */
    private boolean isUntitledLiveSession(ChatSession session) {
        String name = session.getSessionName();

        if (name == null || name.isBlank()) {
            return true;
        }

        String normalized = name.trim();

        return normalized.equalsIgnoreCase("New Chat")
                || normalized.equalsIgnoreCase("Live Talk");
    }

    /**
     * Creates a compact but meaningful sidebar title from
     * the first Live Talk transcript.
     */
    private String buildLiveTalkTitle(String source) {
        if (source == null || source.isBlank()) {
            return "Live Talk";
        }

        /*
         * Normalize repeated whitespace.
         *
         * The previous implementation attempted to strip quotes
         * using an incorrectly escaped Java string literal. That
         * caused the Maven compilation error:
         *
         * unclosed character literal
         * illegal character: '\'
         *
         * Keeping the normalization simple avoids that issue while
         * preserving the actual spoken topic.
         */
        String cleaned = source
                .replaceAll("\\s+", " ")
                .trim();

        if (cleaned.isEmpty()) {
            return "Live Talk";
        }

        // Keep the sidebar compact while preserving the actual topic.
        final int maxLength = 58;

        if (cleaned.length() > maxLength) {
            cleaned = cleaned
                    .substring(0, maxLength)
                    .trim();

            int lastSpace = cleaned.lastIndexOf(' ');

            if (lastSpace > 30) {
                cleaned = cleaned
                        .substring(0, lastSpace)
                        .trim();
            }

            cleaned += "…";
        }

        return "Live Talk - " + cleaned;
    }

    /**
     * Normalizes transcript text before storing it.
     */
    private String normalizeTranscript(String transcript) {
        return transcript == null
                ? ""
                : transcript
                        .replaceAll("\\s+", " ")
                        .trim();
    }
}
