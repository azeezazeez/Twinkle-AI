package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.ChatSession;
import com.ai.chatbot_backend.dto.User;
import com.ai.chatbot_backend.repository.ChatMessageRepository;
import com.ai.chatbot_backend.repository.ChatSessionRepository;
import com.ai.chatbot_backend.repository.OTPRepository;
import com.ai.chatbot_backend.repository.SharedChatRepository;
import com.ai.chatbot_backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.util.List;


@Service
@RequiredArgsConstructor
@Slf4j
public class AccountService {

    private static final Duration REVOCATION_TTL = Duration.ofDays(30);

    private final UserRepository userRepository;
    private final ChatSessionRepository chatSessionRepository;
    private final ChatMessageRepository chatMessageRepository;
    private final SharedChatRepository sharedChatRepository;
    private final OTPRepository otpRepository;
    private final JdbcTemplate jdbc;
    private final StringRedisTemplate redis;

    public static String revocationKey(Long userId) {
        return "Twinkle:sessions-revoked-before:" + userId;
    }

    /** Every session that exists right now (on any device) stops working. */
    public void revokeAllSessions(Long userId) {
        if (userId == null) return;
        redis.opsForValue().set(
                revocationKey(userId),
                String.valueOf(System.currentTimeMillis()),
                REVOCATION_TTL
        );
    }

    /** Permanently removes the user and everything that belongs to them. */
    @Transactional
    public void deleteAccount(User user) {
        Long userId = user.getId();

        List<ChatSession> sessions =
                chatSessionRepository.findByUserIdOrderByUpdatedAtDesc(userId);

        for (ChatSession session : sessions) {
            sharedChatRepository.deleteBySessionId(session.getId());
            chatMessageRepository.deleteBySessionId(session.getId());
        }
        chatSessionRepository.deleteByUserId(userId);

        // Knowledge-base documents (tables may not exist on every deployment).
        try {
            jdbc.update("delete from rag_chunks where user_id=?", userId);
            jdbc.update("delete from rag_documents where user_id=?", userId);
        } catch (Exception e) {
            log.warn("Skipping knowledge-base cleanup for user {}: {}", userId, e.getMessage());
        }

        try {
            otpRepository.deleteByEmail(user.getEmail());
        } catch (Exception e) {
            log.warn("Skipping OTP cleanup for user {}: {}", userId, e.getMessage());
        }

        userRepository.deleteById(userId);
        revokeAllSessions(userId);

        log.info("Account deleted: userId={}", userId);
    }
}
