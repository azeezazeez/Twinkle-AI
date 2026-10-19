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
    private final GeminiService geminiService;

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

    private static final int MAX_IMPORT_MESSAGES = 2000;
    private static final int MAX_IMPORT_CHARS = 200_000;

    /**
     * Creates a new chat for the user from an exported conversation. Only the
     * user and assistant roles are accepted; sizes are capped.
     */
    @Transactional
    public ChatSession importConversation(User user, String title, List<Map<String, Object>> rawMessages) {
        if (user == null || user.getId() == null) {
            throw new AIServiceException("User is required to import a chat");
        }
        if (rawMessages == null || rawMessages.isEmpty()) {
            throw new AIServiceException("This file has no messages to import");
        }

        String cleanTitle = title == null || title.isBlank() ? "Imported chat" : title.trim();
        if (cleanTitle.length() > 120) {
            cleanTitle = cleanTitle.substring(0, 120);
        }

        ChatSession session = createNewSession(user, cleanTitle);
        LocalDateTime fallback = LocalDateTime.now();
        int count = 0;

        for (Map<String, Object> raw : rawMessages) {
            if (count >= MAX_IMPORT_MESSAGES) {
                break;
            }
            Object roleValue = raw.get("role");
            String role = roleValue == null ? "" : roleValue.toString().trim().toLowerCase();
            if (!role.equals("user") && !role.equals("assistant")) {
                continue;
            }
            Object contentValue = raw.get("content");
            String content = contentValue == null ? "" : contentValue.toString();
            if (content.isBlank()) {
                continue;
            }
            if (content.length() > MAX_IMPORT_CHARS) {
                content = content.substring(0, MAX_IMPORT_CHARS);
            }

            LocalDateTime when = fallback.plusSeconds(count);
            Object timestampValue = raw.get("timestamp");
            if (timestampValue != null) {
                try {
                    String text = timestampValue.toString();
                    when = text.matches(".*(Z|[+-]\\d{2}:?\\d{2})$")
                            ? java.time.OffsetDateTime.parse(text).atZoneSameInstant(java.time.ZoneId.systemDefault()).toLocalDateTime()
                            : LocalDateTime.parse(text);
                } catch (Exception ignored) {
                    // keep the fallback time
                }
            }

            ChatMessage message = new ChatMessage();
            message.setSessionId(session.getId());
            message.setRole(role);
            message.setContent(content);
            message.setTimestamp(when);
            chatMessageRepository.save(message);
            count++;
        }

        if (count == 0) {
            throw new AIServiceException("This file has no messages to import");
        }

        session.setUpdatedAt(LocalDateTime.now());
        return chatSessionRepository.save(session);
    }

    @Transactional(readOnly = true)
    public List<ChatSession> getUserSessions(User user) {
        if (user == null || user.getId() == null) {
            return List.of();
        }

        return chatSessionRepository.findByUserIdOrderByUpdatedAtDesc(user.getId());
    }

    /**
     * Resolves a public chat URL identifier to a conversation owned by the
     * authenticated user. Never fetches a conversation by public ID alone:
     * ownership is part of the database query to avoid exposing other users' chats.
     */
    @Transactional(readOnly = true)
    public ChatSession getSessionByPublicId(String publicId, User user) {
        if (publicId == null || publicId.isBlank()) {
            throw new AIServiceException("Chat ID is required");
        }
        if (user == null || user.getId() == null) {
            throw new AIServiceException("Authentication is required to access this chat");
        }

        String normalizedPublicId = publicId.trim();
        try {
            java.util.UUID.fromString(normalizedPublicId);
        } catch (IllegalArgumentException ex) {
            throw new AIServiceException("Invalid chat ID");
        }

        return chatSessionRepository
                .findByPublicIdAndUserId(normalizedPublicId, user.getId())
                .orElseThrow(() -> new AIServiceException(
                        "Chat not found or you do not have access to it"));
    }

    @Transactional(readOnly = true)
    public ChatSession getSessionByIdForUser(Long sessionId, User user) {
        if (sessionId == null || user == null || user.getId() == null) {
            throw new AIServiceException("Chat session is required");
        }
        return chatSessionRepository.findByIdAndUserId(sessionId, user.getId())
                .orElseThrow(() -> new AIServiceException("Chat not found or you do not have access to it"));
    }

    @Transactional(readOnly = true)
    public List<ChatMessage> getSessionMessagesForUser(String publicId, User user) {
        ChatSession session = getSessionByPublicId(publicId, user);
        return chatMessageRepository.findBySessionIdOrderByTimestampAsc(session.getId());
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
        return saveMessage(sessionId, role, content, attachmentData, null);
    }

    @Transactional
    public ChatMessage saveMessage(
            Long sessionId,
            String role,
            String content,
            String attachmentData,
            Long tokenCount
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
        message.setTokenCount(tokenCount != null && tokenCount > 0 ? tokenCount : null);

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
            assistantMessage.setTokenCount(estimateTurnTokens(userText, assistantText));

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

            // Use the instant, deterministic title here. Asking Gemini for a
            // polished title inside this transaction made the first save take
            // seconds (and held the database transaction open). The client
            // replaces a transcript-style title with a polished one in the
            // background once Live Talk ends.
            String liveTitle = buildFallbackLiveTalkTitle(titleSource);

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
        Map<String, Map<String, Object>> activityByDate = new java.util.TreeMap<>();
        long totalMessages = 0;
        long userMessages = 0;
        long assistantMessages = 0;
        long lifetimeTokens = 0;
        java.util.Set<java.time.LocalDate> activeDates = new java.util.TreeSet<>();

        for (ChatSession session : sessions) {
            List<ChatMessage> messages = chatMessageRepository
                    .findBySessionIdOrderByTimestampAsc(session.getId());
            String lastUserContent = "";
            for (ChatMessage message : messages) {
                totalMessages++;
                String role = message.getRole() == null ? "" : message.getRole().toLowerCase(java.util.Locale.ROOT);
                if (role.equals("user")) {
                    userMessages++;
                    lastUserContent = message.getContent() == null ? "" : message.getContent();
                }
                boolean assistant = role.equals("assistant") || role.equals("model");
                if (assistant) assistantMessages++;

                java.time.LocalDate date = message.getTimestamp() == null
                        ? null
                        : message.getTimestamp().toLocalDate();
                Map<String, Object> point = null;
                if (date != null) {
                    activeDates.add(date);
                    String key = date.toString();
                    point = activityByDate.computeIfAbsent(key, ignored -> {
                        Map<String, Object> value = new LinkedHashMap<>();
                        value.put("date", key);
                        value.put("tokens", 0L);
                        value.put("messages", 0L);
                        return value;
                    });
                    point.put("messages", ((Number) point.get("messages")).longValue() + 1L);
                }

                if (assistant) {
                    long turnTokens = message.getTokenCount() != null && message.getTokenCount() > 0
                            ? message.getTokenCount()
                            : estimateTurnTokens(lastUserContent, message.getContent());
                    lifetimeTokens += turnTokens;
                    if (point != null) {
                        point.put("tokens", ((Number) point.get("tokens")).longValue() + turnTokens);
                    }
                    lastUserContent = "";
                }
            }
        }

        long peakTokens = activityByDate.values().stream()
                .mapToLong(point -> ((Number) point.getOrDefault("tokens", 0L)).longValue())
                .max()
                .orElse(0L);

        java.time.LocalDate today = java.time.LocalDate.now();
        int currentStreak = 0;
        java.time.LocalDate cursor = activeDates.contains(today) ? today : today.minusDays(1);
        while (activeDates.contains(cursor)) {
            currentStreak++;
            cursor = cursor.minusDays(1);
        }
        int longestStreak = 0;
        int runningStreak = 0;
        java.time.LocalDate previous = null;
        for (java.time.LocalDate date : activeDates) {
            runningStreak = previous != null && previous.plusDays(1).equals(date) ? runningStreak + 1 : 1;
            longestStreak = Math.max(longestStreak, runningStreak);
            previous = date;
        }

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("totalChats", sessions.size());
        stats.put("totalSessions", sessions.size());
        stats.put("totalMessages", totalMessages);
        stats.put("messageCount", totalMessages);
        stats.put("userMessages", userMessages);
        stats.put("assistantMessages", assistantMessages);
        stats.put("activeDays", activeDates.size());
        stats.put("currentStreak", currentStreak);
        stats.put("longestStreak", longestStreak);
        stats.put("lifetimeTokens", lifetimeTokens);
        stats.put("peakTokens", peakTokens);
        stats.put("dailyActivity", new java.util.ArrayList<>(activityByDate.values()));
        return stats;
    }

    /**
     * The current provider adapters return response text but do not expose
     * usage metadata. Estimate a turn consistently until provider usage is
     * available, then persist that turn total with its assistant message.
     */
    private long estimateTurnTokens(String userContent, String assistantContent) {
        int inputLength = userContent == null ? 0 : userContent.length();
        int outputLength = assistantContent == null ? 0 : assistantContent.length();
        return Math.max(1L, (long) Math.ceil((inputLength + outputLength) / 4.0));
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
     * Generates a concise, professional title from the first meaningful
     * Live Talk user turn. Gemini's configured thinking settings are used
     * by GeminiService; a local fallback ensures saving the transcript still
     * succeeds if title generation is temporarily unavailable.
     */
    private String generateProfessionalLiveTalkTitle(String source) {
        String cleaned = normalizeTranscript(source);
        if (cleaned.isEmpty()) {
            return "Live Talk";
        }

        try {
            String prompt = """
                    Create a professional chat-history title for the conversation represented by the transcript below.
                    Requirements:
                    - Return only the title, with no quotation marks, explanation, markdown, or prefix.
                    - Use 3 to 7 words, ideally under 55 characters.
                    - Identify the main topic or task, not the fact that it was spoken.
                    - Preserve the language of the transcript. If it is Telugu, return a natural Telugu title; if Hindi, return Hindi; otherwise use the transcript's language.
                    - Make it specific, polished, and suitable for a professional chat sidebar.
                    - Do not invent details.

                    Transcript:
                    """ + cleaned;

            String generated = geminiService.generateResponse(
                    prompt,
                    List.of(),
                    List.of(),
                    "auto"
            );

            String title = generated == null ? "" : generated
                    .replaceAll("(?s)^\\s*```(?:text|markdown)?\\s*", "")
                    .replaceAll("\\s*```\\s*$", "")
                    .replaceAll("^[\\\"'“”‘’]+|[\\\"'“”‘’]+$", "")
                    .replaceAll("\\s+", " ")
                    .trim();

            if (!title.isBlank()) {
                if (title.length() > 64) {
                    title = title.substring(0, 61).trim() + "…";
                }
                return title;
            }
        } catch (Exception ex) {
            // A title-generation outage must never prevent the transcript save.
            // The transcript remains the source for a deterministic fallback.
        }

        return buildFallbackLiveTalkTitle(cleaned);
    }

    private String buildFallbackLiveTalkTitle(String source) {
        String cleaned = normalizeTranscript(source);
        if (cleaned.isEmpty()) return "Live Talk";

        final int maxLength = 54;
        if (cleaned.length() > maxLength) {
            cleaned = cleaned.substring(0, maxLength).trim();
            int lastSpace = cleaned.lastIndexOf(' ');
            if (lastSpace > 25) cleaned = cleaned.substring(0, lastSpace).trim();
            cleaned += "…";
        }
        return cleaned;
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
