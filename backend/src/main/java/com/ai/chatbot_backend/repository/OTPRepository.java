package com.ai.chatbot_backend.repository;

import com.ai.chatbot_backend.model.OTP;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OTPRepository extends JpaRepository<OTP, Long> {

    Optional<OTP> findByEmailAndOtpCodeAndVerifiedFalse(
            String email,
            String otpCode
    );

    Optional<OTP> findTopByEmailAndVerifiedFalseOrderByCreatedAtDesc(
            String email
    );

    void deleteByEmail(String email);
}
