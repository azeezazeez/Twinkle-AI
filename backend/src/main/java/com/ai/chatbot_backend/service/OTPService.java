package com.ai.chatbot_backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class OTPService {

    private static final Logger logger = LoggerFactory.getLogger(OTPService.class);
    private static final SecureRandom random = new SecureRandom();

    @Value("${otp.length:6}")
    private int otpLength;

    @Value("${otp.expiration.minutes:10}")
    private int expirationMinutes;

    @Autowired
    private EmailService emailService;

    private final Map<String, OTPData> otpCache = new ConcurrentHashMap<>();

    /**
     * Generate and send OTP for registration verification.
     */
    public String generateAndSendOtp(String email) {
        validateEmail(email);

        String normalizedEmail = email.trim().toLowerCase();
        String otp = generateOtp();

        try {
            emailService.sendOTPEmail(normalizedEmail, otp);

            OTPData otpData = new OTPData(
                    otp,
                    LocalDateTime.now().plusMinutes(expirationMinutes)
            );

            otpCache.put(normalizedEmail, otpData);

            logger.info("OTP sent successfully to: {}", normalizedEmail);
            return otp;

        } catch (Exception e) {
            logger.error(
                    "Failed to send registration OTP to {}: {}",
                    normalizedEmail,
                    e.getMessage(),
                    e
            );

            throw new OTPDeliveryException(
                    "Unable to send verification email. Please check your email address and try again.",
                    e
            );
        }
    }

    /**
     * Generate and send OTP for password reset.
     */
    public String generateAndSendPasswordResetOtp(String email) {
        validateEmail(email);

        String normalizedEmail = email.trim().toLowerCase();
        String key = "password_reset_" + normalizedEmail;
        String otp = generateOtp();

        try {
            emailService.sendPasswordResetOTP(normalizedEmail, otp);

            OTPData otpData = new OTPData(
                    otp,
                    LocalDateTime.now().plusMinutes(expirationMinutes)
            );

            otpCache.put(
                    key,
                    otpData
            );

            logger.info(
                    "Password reset OTP sent successfully to: {}",
                    normalizedEmail
            );

            return otp;

        } catch (Exception e) {
            logger.error(
                    "Failed to send password reset OTP to {}: {}",
                    normalizedEmail,
                    e.getMessage(),
                    e
            );

            throw new OTPDeliveryException(
                    "Unable to send password reset email. Please try again.",
                    e
            );
        }
    }

    /**
     * Validate registration OTP.
     */
    public boolean validateOtp(String email, String otp) {
        if (email == null || otp == null) {
            return false;
        }

        return validateOtpWithKey(
                email.trim().toLowerCase(),
                otp.trim(),
                email
        );
    }

    /**
     * Validate password reset OTP.
     */
    public boolean validatePasswordResetOtp(String email, String otp) {
        if (email == null || otp == null) {
            return false;
        }

        String normalizedEmail = email.trim().toLowerCase();

        return validateOtpWithKey(
                "password_reset_" + normalizedEmail,
                otp.trim(),
                email
        );
    }

    /**
     * Generic OTP validation.
     */
    private boolean validateOtpWithKey(
            String key,
            String otp,
            String email
    ) {
        OTPData otpData = otpCache.get(key);

        if (otpData == null) {
            logger.warn(
                    "OTP validation failed for {}: No OTP found",
                    email
            );
            return false;
        }

        if (otpData.expiryTime.isBefore(LocalDateTime.now())) {
            logger.warn(
                    "OTP validation failed for {}: OTP expired",
                    email
            );

            otpCache.remove(key);
            return false;
        }

        boolean isValid = otpData.otp.equals(otp);

        if (isValid) {
            otpCache.remove(key);

            logger.info(
                    "OTP validated successfully for: {}",
                    email
            );
        } else {
            logger.warn(
                    "OTP validation failed for {}: Invalid OTP",
                    email
            );
        }

        return isValid;
    }

    /**
     * Resend registration OTP.
     */
    public void resendOtp(String email) {
        generateAndSendOtp(email);
        logger.info("Registration OTP resent to: {}", email);
    }

    /**
     * Resend password reset OTP.
     */
    public void resendPasswordResetOtp(String email) {
        generateAndSendPasswordResetOtp(email);
        logger.info("Password reset OTP resent to: {}", email);
    }

    /**
     * Generate numeric OTP.
     */
    private String generateOtp() {
        StringBuilder otp = new StringBuilder(otpLength);

        for (int i = 0; i < otpLength; i++) {
            otp.append(random.nextInt(10));
        }

        return otp.toString();
    }

    /**
     * Validate email before attempting delivery.
     */
    private void validateEmail(String email) {
        if (email == null || email.trim().isEmpty()) {
            throw new IllegalArgumentException("Email is required");
        }
    }

    /**
     * OTP data.
     */
    private static class OTPData {
        private final String otp;
        private final LocalDateTime expiryTime;

        private OTPData(
                String otp,
                LocalDateTime expiryTime
        ) {
            this.otp = otp;
            this.expiryTime = expiryTime;
        }
    }

    /**
     * Specific exception for email/OTP delivery failures.
     */
    public static class OTPDeliveryException extends RuntimeException {

        public OTPDeliveryException(
                String message,
                Throwable cause
        ) {
            super(message, cause);
        }
    }
}
