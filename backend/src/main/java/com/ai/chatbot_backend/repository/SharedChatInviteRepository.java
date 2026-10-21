package com.ai.chatbot_backend.repository;

import com.ai.chatbot_backend.dto.SharedChatInvite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SharedChatInviteRepository extends JpaRepository<SharedChatInvite, Long> {

    List<SharedChatInvite> findBySessionIdOrderByCreatedAtAsc(Long sessionId);

    Optional<SharedChatInvite> findBySessionIdAndEmail(Long sessionId, String email);

    Optional<SharedChatInvite> findByIdAndSessionId(Long id, Long sessionId);

    boolean existsBySessionIdAndEmail(Long sessionId, String email);

    void deleteBySessionId(Long sessionId);
}
