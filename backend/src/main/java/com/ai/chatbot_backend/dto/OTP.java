package com.ai.chatbot_backend.dto;

import jakarta.persistence.*;
import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
@Entity
@Table(name = "otps")
public class OTP {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String email;

    @Column(nullable = false, name = "otp_code")
    private String otpCode;  // ← Field name is "otpCode" (camelCase)

    @Column(nullable = false, name = "expiry_time")
    private LocalDateTime expiryTime;

    @Column(nullable = false)
    private boolean verified;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}