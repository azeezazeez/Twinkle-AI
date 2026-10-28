package com.ai.chatbot_backend.service;

import com.ai.chatbot_backend.dto.OTP;
import com.ai.chatbot_backend.repository.OTPRepository;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Optional;


@Service
@RequiredArgsConstructor
@Slf4j
public class OTPService {

    public static final String PURPOSE_AUTH = "AUTH";
    public static final String PURPOSE_RESET = "RESET";

    private static final int MAX_ATTEMPTS_PER_CODE = 5;
    private static final String ATTEMPTS_PREFIX = "Twinkle:otp-attempts:";

    private final OTPRepository otpRepository;
    private final EmailService emailService;
    private final StringRedisTemplate redis;

    @Value("${otp.length:6}")
    private int otpLength;

    @Value("${otp.expiration.minutes:10}")
    private int otpExpirationMinutes;

    @Value("${otp.hash-secret:${oauth.state-secret}}")
    private String hashSecret;

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Transactional
    public String generateAndSendOtp(String email) {
        return generateAndSend(email, PURPOSE_AUTH);
    }

    @Transactional
    public String generateAndSendPasswordResetOtp(String email) {
        return generateAndSend(email, PURPOSE_RESET);
    }

    private String generateAndSend(String email, String purpose) {
        String normalizedEmail = normalizeEmail(email);

        try {
            otpRepository.deleteByEmail(normalizedEmail);
            clearAttempts(normalizedEmail);

            String otpCode = generateOtp();
            LocalDateTime now = LocalDateTime.now();

            OTP otp = new OTP();
            otp.setEmail(normalizedEmail);
            otp.setOtpCode(hash(normalizedEmail, purpose, otpCode));
            otp.setExpiryTime(now.plusMinutes(otpExpirationMinutes));
            otp.setVerified(false);
            otp.setCreatedAt(now);

            otpRepository.save(otp);

            if (PURPOSE_RESET.equals(purpose)) {
                emailService.sendPasswordResetOTP(normalizedEmail, otpCode);
            } else {
                emailService.sendOTPEmail(normalizedEmail, otpCode);
            }

            log.info("{} OTP sent to {}", purpose, maskEmail(normalizedEmail));
            // Returned only for callers/tests; controllers must never put it in a response.
            return otpCode;

        } catch (EmailService.EmailDeliveryException e) {
            log.error("OTP email delivery failed for {}: {}", maskEmail(normalizedEmail), e.getMessage());
            throw new OTPDeliveryException("Unable to send OTP email", e);
        }
    }

    @Transactional
    public boolean validateOtp(String email, String otpCode) {
        return validateOtpInternal(email, otpCode, PURPOSE_AUTH);
    }

    @Transactional
    public boolean validatePasswordResetOtp(String email, String otpCode) {
        return validateOtpInternal(email, otpCode, PURPOSE_RESET);
    }

    private boolean validateOtpInternal(String email, String otpCode, String purpose) {
        String normalizedEmail = normalizeEmail(email);

        if (otpCode == null || otpCode.trim().isEmpty()) {
            return false;
        }
        String normalizedOtp = otpCode.trim();

        try {
            Optional<OTP> latest = otpRepository.findTopByEmailOrderByCreatedAtDesc(normalizedEmail);
            if (latest.isEmpty()) {
                return false;
            }
            OTP otp = latest.get();

            if (otp.getExpiryTime() == null || otp.getExpiryTime().isBefore(LocalDateTime.now())) {
                otpRepository.deleteByEmail(normalizedEmail);
                clearAttempts(normalizedEmail);
                return false;
            }

            String expected = otp.getOtpCode();
            String provided = hash(normalizedEmail, purpose, normalizedOtp);
            boolean match = MessageDigest.isEqual(
                    expected.getBytes(StandardCharsets.UTF_8),
                    provided.getBytes(StandardCharsets.UTF_8));

            if (!match) {
                long attempts = recordAttempt(normalizedEmail);
                if (attempts >= MAX_ATTEMPTS_PER_CODE) {
                    // Burn the code: the user has to request a new one.
                    otpRepository.deleteByEmail(normalizedEmail);
                    clearAttempts(normalizedEmail);
                    log.warn("OTP invalidated after too many wrong attempts for {}", maskEmail(normalizedEmail));
                }
                return false;
            }

            // Single use.
            otpRepository.deleteByEmail(normalizedEmail);
            clearAttempts(normalizedEmail);
            return true;

        } catch (Exception e) {
            log.error("OTP validation error for {}: {}", maskEmail(normalizedEmail), e.getMessage());
            return false;
        }
    }

    public String resendOtp(String email) {
        return generateAndSendOtp(email);
    }

    // ------------------------------------------------------------------

    private long recordAttempt(String email) {
        try {
            String key = ATTEMPTS_PREFIX + email;
            Long value = redis.opsForValue().increment(key);
            if (value != null && value == 1L) {
                redis.expire(key, Duration.ofMinutes(otpExpirationMinutes));
            }
            return value == null ? MAX_ATTEMPTS_PER_CODE : value;
        } catch (Exception e) {
            // Redis down: be strict and burn the code rather than allow unlimited guesses.
            return MAX_ATTEMPTS_PER_CODE;
        }
    }

    private void clearAttempts(String email) {
        try {
            redis.delete(ATTEMPTS_PREFIX + email);
        } catch (Exception ignored) {
            // best effort
        }
    }

    private String hash(String email, String purpose, String code) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(hashSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] out = mac.doFinal((email + "|" + purpose + "|" + code).getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(out);
        } catch (Exception e) {
            throw new IllegalStateException("Could not hash OTP", e);
        }
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

    /** Keeps logs useful without storing full email addresses (a***@gmail.com). */
    private static String maskEmail(String email) {
        if (email == null) return "";
        int at = email.indexOf('@');
        if (at <= 1) return "***" + (at >= 0 ? email.substring(at) : "");
        return email.charAt(0) + "***" + email.substring(at);
    }
}
