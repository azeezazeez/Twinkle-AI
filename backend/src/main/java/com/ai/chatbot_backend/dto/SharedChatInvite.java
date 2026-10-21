package com.ai.chatbot_backend.dto;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "shared_chat_invites",
        uniqueConstraints = @UniqueConstraint(name = "uq_shared_chat_invite", columnNames = {"session_id", "email"}),
        indexes = @Index(name = "idx_shared_chat_invite_session", columnList = "session_id")
)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SharedChatInvite {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    /** Always stored lower-case. */
    @Column(name = "email", nullable = false, length = 255)
    private String email;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;
}
