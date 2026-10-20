package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.UserMemory;
import com.ai.chatbot_backend.dto.UserMemorySetting;
import com.ai.chatbot_backend.repository.UserMemoryRepository;
import com.ai.chatbot_backend.repository.UserMemorySettingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Per-user long-term memory: short facts the assistant learns from chats,
 * stored in user_memories, switched on/off through user_memory_settings.
 */
@Service
public class MemoryService {

    private static final Logger log = LoggerFactory.getLogger(MemoryService.class);

    public static final int MAX_MEMORY_LENGTH = 300;
    private static final int MAX_MEMORIES_PER_USER = 100;
    private static final int MAX_FACTS_PER_TURN = 3;
    private static final int PROMPT_MEMORY_LIMIT = 40;

    private static final ExecutorService LEARN_EXECUTOR = Executors.newFixedThreadPool(2, r -> {
        Thread t = new Thread(r, "memory-learn");
        t.setDaemon(true);
        return t;
    });

    private final UserMemoryRepository memoryRepository;
    private final UserMemorySettingRepository settingRepository;
    private final GroqService groqService;

    public MemoryService(UserMemoryRepository memoryRepository,
                         UserMemorySettingRepository settingRepository,
                         GroqService groqService) {
        this.memoryRepository = memoryRepository;
        this.settingRepository = settingRepository;
        this.groqService = groqService;
    }

    // ---------------------------------------------------------------
    // SETTINGS
    // ---------------------------------------------------------------

    /** Returns the user's setting, creating the row (enabled) on first use. */
    @Transactional
    public UserMemorySetting getOrCreateSettings(Long userId) {
        return settingRepository.findById(userId)
                .orElseGet(() -> settingRepository.save(new UserMemorySetting(userId, true)));
    }

    @Transactional
    public boolean isEnabled(Long userId) {
        if (userId == null) return false;
        return getOrCreateSettings(userId).isEnabled();
    }

    @Transactional
    public UserMemorySetting setEnabled(Long userId, boolean enabled) {
        UserMemorySetting setting = getOrCreateSettings(userId);
        setting.setEnabled(enabled);
        return settingRepository.save(setting);
    }

    // ---------------------------------------------------------------
    // CRUD
    // ---------------------------------------------------------------

    @Transactional(readOnly = true)
    public List<UserMemory> list(Long userId) {
        return memoryRepository.findByUserIdOrderByCreatedAtDescIdDesc(userId);
    }

    @Transactional
    public UserMemory add(Long userId, String rawContent) {
        String content = normalize(rawContent);
        if (content.isEmpty()) return null;

        List<UserMemory> existing = memoryRepository.findByUserIdOrderByCreatedAtDescIdDesc(userId);
        String key = content.toLowerCase(Locale.ROOT);
        for (UserMemory m : existing) {
            if (m.getContent() != null && m.getContent().toLowerCase(Locale.ROOT).equals(key)) {
                return m;
            }
        }

        // Keep the store bounded: drop the oldest entries beyond the cap.
        if (existing.size() >= MAX_MEMORIES_PER_USER) {
            List<UserMemory> overflow = existing.subList(MAX_MEMORIES_PER_USER - 1, existing.size());
            memoryRepository.deleteAll(new ArrayList<>(overflow));
        }

        return memoryRepository.save(new UserMemory(userId, content));
    }

    @Transactional
    public boolean delete(Long userId, Long memoryId) {
        return memoryRepository.findByIdAndUserId(memoryId, userId)
                .map(m -> {
                    memoryRepository.delete(m);
                    return true;
                })
                .orElse(false);
    }

    @Transactional
    public void clearAll(Long userId) {
        memoryRepository.deleteByUserId(userId);
    }

    // ---------------------------------------------------------------
    // PROMPT INJECTION
    // ---------------------------------------------------------------

    /** Text appended to the model prompt (never stored in chat history). */
    public String buildPromptContext(Long userId) {
        if (userId == null) return "";
        try {
            if (!isEnabled(userId)) return "";
            List<UserMemory> memories = list(userId);
            if (memories.isEmpty()) return "";

            StringBuilder sb = new StringBuilder();
            sb.append("Saved memory about this user (facts they shared earlier). ")
              .append("Use it only when it genuinely helps the current request, ")
              .append("never recite it, and do not mention that it is saved memory unless asked:\n");
            int count = 0;
            for (UserMemory m : memories) {
                if (count++ >= PROMPT_MEMORY_LIMIT) break;
                sb.append("- ").append(m.getContent()).append('\n');
            }
            return sb.toString().trim();
        } catch (Exception e) {
            log.warn("Could not load memory context for user {}: {}", userId, e.getMessage());
            return "";
        }
    }

    // ---------------------------------------------------------------
    // LEARNING
    // ---------------------------------------------------------------

    /** Fire-and-forget: extracts durable facts from a turn and saves them. */
    public void learnFromTurnAsync(Long userId, String userMessage, String assistantReply) {
        if (userId == null || userMessage == null) return;
        CompletableFuture.runAsync(() -> {
            try {
                learnFromTurn(userId, userMessage, assistantReply);
            } catch (Exception e) {
                log.warn("Memory extraction failed for user {}: {}", userId, e.getMessage());
            }
        }, LEARN_EXECUTOR);
    }

    private void learnFromTurn(Long userId, String userMessage, String assistantReply) {
        String message = userMessage.trim();
        if (message.length() < 8 || !isEnabled(userId)) return;
        if (message.length() > 2000) message = message.substring(0, 2000);

        String reply = assistantReply == null ? "" : assistantReply.trim();
        if (reply.length() > 600) reply = reply.substring(0, 600);

        StringBuilder known = new StringBuilder();
        int n = 0;
        for (UserMemory m : list(userId)) {
            if (n++ >= 30) break;
            known.append("- ").append(m.getContent()).append('\n');
        }

        String prompt =
                "You maintain long-term memory for a chat assistant. From the conversation turn below, "
              + "extract up to " + MAX_FACTS_PER_TURN + " durable facts about the USER that will stay useful in "
              + "future chats: name, occupation, location, skills, ongoing projects, tools they use, "
              + "preferences about how they want answers, goals.\n"
              + "Rules: only facts the user stated about themselves; write each as one short sentence "
              + "starting with \"User\"; max " + MAX_MEMORY_LENGTH + " characters; skip one-off questions, "
              + "temporary states, code, secrets, passwords, card/ID numbers, and health, political or "
              + "sexual details; skip anything already known.\n"
              + "Output ONLY lines starting with \"- \", or the single word NONE if there is nothing to save.\n\n"
              + "Already known:\n" + (known.length() == 0 ? "(nothing)\n" : known)
              + "\nUser message:\n" + message
              + "\n\nAssistant reply (context only):\n" + reply;

        String output = groqService.generateResponse(prompt, new ArrayList<Map<String, String>>());
        if (output == null || output.isBlank()) return;

        int saved = 0;
        for (String line : output.split("\\R")) {
            String t = line.trim();
            if (!t.startsWith("- ") && !t.startsWith("* ")) continue;
            String fact = normalize(t.substring(2));
            if (fact.length() < 6 || saved >= MAX_FACTS_PER_TURN) continue;
            if (add(userId, fact) != null) saved++;
        }
        if (saved > 0) log.debug("Saved {} memory item(s) for user {}", saved, userId);
    }

    // ---------------------------------------------------------------

    private static String normalize(String raw) {
        if (raw == null) return "";
        String s = raw.replaceAll("\\s+", " ").trim();
        if (s.length() > MAX_MEMORY_LENGTH) s = s.substring(0, MAX_MEMORY_LENGTH).trim();
        return s;
    }
}
