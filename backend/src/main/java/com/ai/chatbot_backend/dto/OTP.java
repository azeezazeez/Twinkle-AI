package com.ai.chatbot_backend.dto;

import jakarta.persistence.*;

import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "otps")
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OTP {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;


    @Column(
            nullable = false
    )
    private String email;


    @Column(
            name = "otp_code",
            nullable = false
    )
    private String otpCode;


    @Column(
            name = "expiry_time",
            nullable = false
    )
    private LocalDateTime expiryTime;


    @Column(
            nullable = false
    )
    private boolean verified;


    @Column(
            name = "created_at"
    )
    private LocalDateTime createdAt;


    @PrePersist
    protected void onCreate() {

        this.createdAt =
                LocalDateTime.now();

        this.verified = false;
    }
}
