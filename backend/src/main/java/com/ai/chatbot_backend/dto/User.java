package com.ai.chatbot_backend.dto;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.io.Serializable;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class User implements Serializable {

    private static final long serialVersionUID = 1L;

    // ============================================================
    // ID
    // ============================================================

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;


    // ============================================================
    // USERNAME
    // ============================================================

    @Column(
            unique = true,
            nullable = false
    )
    private String username;


    // ============================================================
    // EMAIL
    // ============================================================

    @Column(
            unique = true,
            nullable = false
    )
    private String email;


    // ============================================================
    // PASSWORD
    // ============================================================

    @Column(
            nullable = false
    )
    private String password;


    // ============================================================
    // CREATED AT
    // ============================================================

    @CreationTimestamp
    @Column(
            name = "created_at",
            updatable = false
    )
    private LocalDateTime createdAt;


    // ============================================================
    // EMAIL VERIFICATION STATUS
    // ============================================================

    @Column(
            name = "is_verified",
            nullable = false
    )
    private boolean verified;

    @Column(name = "avatar_url")
    private String avatarUrl;

    @Column(name = "auth_provider")
    private String authProvider = "LOCAL";
}
