package com.ai.chatbot_backend.repository;

import com.ai.chatbot_backend.dto.OTP;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;

@Repository
public interface OTPRepository
        extends JpaRepository<OTP, Long> {

    Optional<OTP>
    findByEmailAndOtpCodeAndVerifiedFalse(
            String email,
            String otpCode
    );


    Optional<OTP>
    findTopByEmailOrderByCreatedAtDesc(
            String email
    );


    void deleteByEmail(
            String email
    );


    void deleteByExpiryTimeBefore(
            LocalDateTime time
    );
}
