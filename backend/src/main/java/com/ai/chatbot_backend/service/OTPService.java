package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.OTP;
import com.ai.chatbot_backend.repository.OTPRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class OTPService {

    private final OTPRepository otpRepository;
    private final EmailService emailService;

    @Value("${otp.length:6}")
    private int otpLength;

    @Value("${otp.expiration.minutes:10}")
    private int otpExpirationMinutes;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Transactional
    public String generateAndSendOtp(String email) {
        String normalizedEmail = normalizeEmail(email);

        try {
            otpRepository.deleteByEmail(normalizedEmail);

            String otpCode = generateOtp();
            LocalDateTime now = LocalDateTime.now();

            OTP otp = new OTP();
            otp.setEmail(normalizedEmail);
            otp.setOtpCode(otpCode);
            otp.setExpiryTime(now.plusMinutes(otpExpirationMinutes));
            otp.setVerified(false);
            otp.setCreatedAt(now);

            otpRepository.save(otp);

            emailService.sendOTPEmail(normalizedEmail, otpCode);

            log.info("Registration OTP sent successfully to {}", normalizedEmail);
            return otpCode;

        } catch (EmailService.EmailDeliveryException e) {
            log.error("OTP email delivery failed for {}: {}", normalizedEmail, e.getMessage(), e);
            throw new OTPDeliveryException("Unable to send OTP email", e);
        } catch (Exception e) {
            log.error("OTP generation failed for {}: {}", normalizedEmail, e.getMessage(), e);
            throw e;
        }
    }


    @Transactional
    public String generateAndSendPasswordResetOtp(String email) {
        String normalizedEmail = normalizeEmail(email);

        try {
            otpRepository.deleteByEmail(normalizedEmail);

            String otpCode = generateOtp();
            LocalDateTime now = LocalDateTime.now();

            OTP otp = new OTP();
            otp.setEmail(normalizedEmail);
            otp.setOtpCode(otpCode);
            otp.setExpiryTime(now.plusMinutes(otpExpirationMinutes));
            otp.setVerified(false);
            otp.setCreatedAt(now);

            otpRepository.save(otp);
            emailService.sendPasswordResetOTP(normalizedEmail, otpCode);

            log.info("Password reset OTP sent successfully to {}", normalizedEmail);
            return otpCode;

        } catch (EmailService.EmailDeliveryException e) {
            log.error("Password reset email delivery failed for {}: {}", normalizedEmail, e.getMessage(), e);
            throw new OTPDeliveryException("Unable to send password reset OTP", e);
        } catch (Exception e) {
            log.error("Password reset OTP generation failed for {}: {}", normalizedEmail, e.getMessage(), e);
            throw e;
        }
    }

    @Transactional(readOnly = true)
    public boolean validateOtp(String email, String otpCode) {
        return validateOtpInternal(email, otpCode);
    }

    @Transactional(readOnly = true)
    public boolean validatePasswordResetOtp(String email, String otpCode) {
        return validateOtpInternal(email, otpCode);
    }

    /**
     * NOTE: This method is intentionally called from transactional public
     * methods above so the repository lookup and OTP update have a JPA context.
     */
    private boolean validateOtpInternal(String email, String otpCode) {
        String normalizedEmail = normalizeEmail(email);

        if (otpCode == null || otpCode.trim().isEmpty()) {
            log.warn("OTP validation failed: empty OTP for {}", normalizedEmail);
            return false;
        }

        String normalizedOtp = otpCode.trim();

        try {
            Optional<OTP> optionalOtp = otpRepository
                    .findByEmailAndOtpCodeAndVerifiedFalse(normalizedEmail, normalizedOtp);

            if (optionalOtp.isEmpty()) {
                log.warn("Invalid OTP for {}", normalizedEmail);
                return false;
            }

            OTP otp = optionalOtp.get();

            if (otp.getExpiryTime() == null) {
                log.warn("OTP has no expiry time for {}", normalizedEmail);
                return false;
            }

            if (otp.getExpiryTime().isBefore(LocalDateTime.now())) {
                log.warn("Expired OTP for {}", normalizedEmail);
                return false;
            }

            otp.setVerified(true);
            otpRepository.save(otp);

            log.info("OTP verified successfully for {}", normalizedEmail);
            return true;

        } catch (Exception e) {
            log.error("OTP validation error for {}: {}", normalizedEmail, e.getMessage(), e);
            return false;
        }
    }

    public String resendOtp(String email) {
        return generateAndSendOtp(email);
    }

    private String generateOtp() {
        if (otpLength <= 0) {
            throw new IllegalStateException("OTP length must be greater than zero");
        }

        if (otpLength > 9) {
            throw new IllegalStateException("OTP length cannot be greater than 9");
        }

        int minimum = (int) Math.pow(10, otpLength - 1);
        int maximum = (int) Math.pow(10, otpLength) - 1;
        int otpNumber = minimum + SECURE_RANDOM.nextInt(maximum - minimum + 1);

        return String.valueOf(otpNumber);
    }

    private String normalizeEmail(String email) {
        if (email == null || email.trim().isEmpty()) {
            throw new IllegalArgumentException("Email is required");
        }
        return email.trim().toLowerCase();
    }

    public static class OTPDeliveryException extends RuntimeException {
        public OTPDeliveryException(String message) {
            super(message);
        }

        public OTPDeliveryException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}
