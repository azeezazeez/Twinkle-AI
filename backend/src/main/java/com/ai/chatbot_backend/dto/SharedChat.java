package com.ai.chatbot_backend.dto;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(
        name = "shared_chats",
        indexes = {
                @Index(name = "idx_shared_chat_token", columnList = "share_token", unique = true),
                @Index(name = "idx_shared_chat_session", columnList = "session_id")
        }
)
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SharedChat {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(name = "share_token", nullable = false, unique = true, length = 128)
    private String shareToken;

    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt;

    @Column(name = "revoked", nullable = false)
    private boolean revoked = false;
}
