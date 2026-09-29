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
import java.util.Map;
import java.util.HashMap;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class ChatHistoryService {

    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;

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
    public Map<String, Object> getProfileStats(User user) {
        List<ChatSession> sessions = getUserSessions(user);
        long messageCount = 0;
        long userMessages = 0;
        long assistantMessages = 0;
        long estimatedTokens = 0;
        Map<LocalDate, Long> dailyTokens = new HashMap<>();
        Set<LocalDate> activeDays = new HashSet<>();

        for (ChatSession session : sessions) {
            List<ChatMessage> messages = getSessionMessages(session.getId());
            for (ChatMessage message : messages) {
                messageCount++;
                if ("user".equalsIgnoreCase(message.getRole())) userMessages++;
                else assistantMessages++;
                String content = message.getContent() == null ? "" : message.getContent();
                long tokens = Math.max(1, Math.round(content.trim().isEmpty() ? 1 : content.trim().split("\\s+").length * 1.3));
                estimatedTokens += tokens;
                LocalDate day = message.getTimestamp() == null ? LocalDate.now() : message.getTimestamp().toLocalDate();
                dailyTokens.merge(day, tokens, Long::sum);
                activeDays.add(day);
            }
        }

        long peak = dailyTokens.values().stream().mapToLong(Long::longValue).max().orElse(0);
        int currentStreak = calculateCurrentStreak(activeDays);
        int longestStreak = calculateLongestStreak(activeDays);

        List<Map<String, Object>> dailyActivity = dailyTokens.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .map(entry -> {
                    Map<String, Object> point = new HashMap<>();
                    point.put("date", entry.getKey().toString());
                    point.put("tokens", entry.getValue());
                    point.put("messages", 0);
                    return point;
                })
                .collect(java.util.stream.Collectors.toList());

        // Add message counts to the same date buckets without changing the
        // existing aggregate profile metrics.
        Map<LocalDate, Long> dailyMessages = new HashMap<>();
        for (ChatSession session : sessions) {
            for (ChatMessage message : getSessionMessages(session.getId())) {
                LocalDate day = message.getTimestamp() == null ? LocalDate.now() : message.getTimestamp().toLocalDate();
                dailyMessages.merge(day, 1L, Long::sum);
            }
        }
        for (Map<String, Object> point : dailyActivity) {
            LocalDate day = LocalDate.parse(String.valueOf(point.get("date")));
            point.put("messages", dailyMessages.getOrDefault(day, 0L));
        }
        for (Map.Entry<LocalDate, Long> entry : dailyMessages.entrySet()) {
            boolean exists = dailyActivity.stream().anyMatch(point -> String.valueOf(point.get("date")).equals(entry.getKey().toString()));
            if (!exists) {
                Map<String, Object> point = new HashMap<>();
                point.put("date", entry.getKey().toString());
                point.put("tokens", dailyTokens.getOrDefault(entry.getKey(), 0L));
                point.put("messages", entry.getValue());
                dailyActivity.add(point);
            }
        }
        dailyActivity.sort(java.util.Comparator.comparing(point -> String.valueOf(point.get("date"))));

        Map<String, Object> stats = new HashMap<>();
        stats.put("lifetimeTokens", estimatedTokens);
        stats.put("peakTokens", peak);
        stats.put("currentStreak", currentStreak);
        stats.put("longestStreak", longestStreak);
        stats.put("totalChats", sessions.size());
        stats.put("messageCount", messageCount);
        stats.put("userMessages", userMessages);
        stats.put("assistantMessages", assistantMessages);
        stats.put("activeDays", activeDays.size());
        stats.put("dailyActivity", dailyActivity);
        return stats;
    }

    private int calculateCurrentStreak(Set<LocalDate> days) {
        if (days.isEmpty()) return 0;
        LocalDate cursor = LocalDate.now();
        if (!days.contains(cursor)) cursor = cursor.minusDays(1);
        int streak = 0;
        while (days.contains(cursor)) {
            streak++;
            cursor = cursor.minusDays(1);
        }
        return streak;
    }

    private int calculateLongestStreak(Set<LocalDate> days) {
        int longest = 0;
        int current = 0;
        LocalDate cursor = days.stream().min(LocalDate::compareTo).orElse(LocalDate.now());
        LocalDate end = days.stream().max(LocalDate::compareTo).orElse(cursor);
        while (!cursor.isAfter(end)) {
            if (days.contains(cursor)) current++; else current = 0;
            longest = Math.max(longest, current);
            cursor = cursor.plusDays(1);
        }
        return longest;
    }

    /**
     * Persists a completed Live Talk turn in one transaction without repeatedly
     * looking the same session up for each message. The frontend calls this in
     * the background, so database work never blocks Live Talk audio playback.
     */
    @Transactional
    public ChatSession saveLiveTurn(
            User user,
            Long sessionId,
            String userTranscript,
            String assistantTranscript
    ) {
        String userText = userTranscript == null ? "" : userTranscript.trim();
        String assistantText = assistantTranscript == null ? "" : assistantTranscript.trim();

        if (userText.isEmpty() && assistantText.isEmpty()) {
            throw new AIServiceException("Live Talk turn is empty");
        }

        ChatSession session;
        if (sessionId == null) {
            String titleSource = !userText.isEmpty() ? userText : assistantText;
            session = new ChatSession();
            session.setUserId(user.getId());
            session.setSessionName(createLiveTitle(titleSource));
            session.setCreatedAt(LocalDateTime.now());
            session.setUpdatedAt(LocalDateTime.now());
            session = chatSessionRepository.save(session);
        } else {
            session = chatSessionRepository.findById(sessionId)
                    .orElseThrow(() -> new AIServiceException("Live Talk session not found: " + sessionId));

            if (!user.getId().equals(session.getUserId())) {
                throw new AIServiceException("You do not have access to this Live Talk session.");
            }
        }

        if (!userText.isEmpty()) {
            persistLiveMessage(session.getId(), "user", userText);
        }
        if (!assistantText.isEmpty()) {
            persistLiveMessage(session.getId(), "assistant", assistantText);
        }

        // A Live Talk session is created as "New Chat" by the existing
        // session endpoint. Give it a useful fallback title from the first
        // spoken user turn so it behaves like a normal saved chat even if
        // the optional AI title generation on the frontend is unavailable.
        if ("New Chat".equalsIgnoreCase(session.getSessionName()) && !userText.isEmpty()) {
            session.setSessionName(createLiveTitle(userText));
        }

        session.setUpdatedAt(LocalDateTime.now());
        return chatSessionRepository.save(session);
    }

    @Transactional
    public ChatSession saveLiveConversation(User user, String userTranscript, String assistantTranscript) {
        String userText = userTranscript == null ? "" : userTranscript.trim();
        String assistantText = assistantTranscript == null ? "" : assistantTranscript.trim();
        String titleSource = !userText.isEmpty() ? userText : assistantText;
        if (titleSource.isEmpty()) throw new AIServiceException("Live Talk conversation is empty");

        ChatSession session = new ChatSession();
        session.setUserId(user.getId());
        session.setSessionName(createLiveTitle(titleSource));
        session.setCreatedAt(LocalDateTime.now());
        session.setUpdatedAt(LocalDateTime.now());
        session = chatSessionRepository.save(session);

        if (!userText.isEmpty()) persistLiveMessage(session.getId(), "user", userText);
        if (!assistantText.isEmpty()) persistLiveMessage(session.getId(), "assistant", assistantText);

        session.setUpdatedAt(LocalDateTime.now());
        return chatSessionRepository.save(session);
    }

    private void persistLiveMessage(Long sessionId, String role, String content) {
        ChatMessage message = new ChatMessage();
        message.setSessionId(sessionId);
        message.setRole(role);
        message.setContent(content);
        message.setTimestamp(LocalDateTime.now());
        chatMessageRepository.save(message);
    }

    private String createLiveTitle(String text) {
        String normalized = text == null ? "" : text.replaceAll("\\s+", " ").trim();
        if (normalized.isEmpty() || normalized.matches("(?i)^(hi|hello|hey|good morning|good afternoon|good evening|namaste|హాయ్|నమస్కారం)[.!?,\\s]*$")) {
            return "Live Talk - Conversation";
        }

        final String prefix = "Live Talk - ";
        final int maxTitleLength = 60;
        int available = maxTitleLength - prefix.length();
        String topic = normalized.length() <= available
                ? normalized
                : normalized.substring(0, Math.max(1, available - 1)).trim() + "…";

        return prefix + topic;
    }

}
