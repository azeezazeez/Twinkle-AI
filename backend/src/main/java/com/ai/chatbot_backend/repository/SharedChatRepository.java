package com.ai.chatbot_backend.repository;

import com.ai.chatbot_backend.dto.SharedChat;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SharedChatRepository extends JpaRepository<SharedChat, Long> {

    Optional<SharedChat> findByShareTokenAndRevokedFalse(String shareToken);

    Optional<SharedChat> findFirstBySessionIdAndRevokedFalse(Long sessionId);

    List<SharedChat> findBySessionIdAndRevokedFalseOrderByCreatedAtDesc(Long sessionId);

    Optional<SharedChat> findByIdAndSessionId(Long id, Long sessionId);

    void deleteBySessionId(Long sessionId);
}
