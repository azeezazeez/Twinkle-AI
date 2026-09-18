package com.ai.chatbot_backend.dto;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;

import java.time.LocalDateTime;

@Entity
@Table(name = "chat_messages")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ChatMessage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "session_id", nullable = false)
    private Long sessionId;

    @Column(nullable = false)
    private String role;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "timestamp")
    private LocalDateTime timestamp;

    /**
     * Persisted image attachment data as a JSON array of data URLs.
     * This keeps image attachments available after a page refresh without
     * relying on Render's ephemeral filesystem.
     */
    @Column(name = "attachment_data", columnDefinition = "TEXT")
    private String attachmentData;

    /**
     * Runtime-only parsed attachment URLs returned to the frontend.
     */
    @Transient
    private java.util.List<String> attachments;
}