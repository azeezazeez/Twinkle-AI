package com.ai.chatbot_backend.repository;

import com.ai.chatbot_backend.dto.SharedChat;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface SharedChatRepository extends JpaRepository<SharedChat, Long> {

    Optional<SharedChat> findByShareTokenAndRevokedFalse(String shareToken);

    Optional<SharedChat> findFirstBySessionIdAndRevokedFalse(Long sessionId);

    void deleteBySessionId(Long sessionId);
}
